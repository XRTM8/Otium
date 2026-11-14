import type { BeamMessage, BeamTransferState } from '../types';
import { ignoreBenignRejection } from '../../core/utils/bestEffort';
import { trustedRelayUrl } from './beamSecurity';
import {
  CLOUD_RELAY_BASE,
  RELAY_CHUNK_SIZE,
  computeSha256,
  fetchWithTimeout,
  getDeviceLabel,
  isBrowserNetworkAvailable,
  isRetryableStatus,
  randomId,
  retryDelayMs,
  safeTopicPart,
  sleep,
  topicForRoom,
} from './beamUtils';
import type { BeamDocumentAttempt } from './beamDocumentCheckpoint';

export async function putRelayAttachment(
  topic: string,
  data: ArrayBuffer,
  filename: string
): Promise<string> {
  const encodedName = encodeURIComponent(filename);
  const url = `${CLOUD_RELAY_BASE}/${topic}?filename=${encodedName}`;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'PUT',
          headers: {
            Filename: encodedName,
            'Content-Type': 'application/octet-stream',
          },
          body: data,
        },
        60000
      );

      if (response.ok) {
        const parsed = (await response.json()) as { attachment?: { url?: unknown } };
        const attachmentUrl = parsed?.attachment?.url;
        if (typeof attachmentUrl === 'string' && attachmentUrl.length > 0) {
          return trustedRelayUrl(attachmentUrl);
        }
        throw new Error('The relay did not return an attachment URL.');
      }

      if (isRetryableStatus(response.status) && attempt < 3) {
        await sleep(retryDelayMs(response, attempt));
        continue;
      }

      if (response.status === 413) {
        throw new Error('The cloud relay rejected a file chunk. The PDF may be too large for relay mode.');
      }
      if (response.status === 429) {
        throw new Error('The public relay is rate-limiting uploads. Wait a few seconds and retry, or keep both devices on the same Wi-Fi.');
      }
      throw new Error(`The cloud relay returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await sleep(retryDelayMs(null, attempt));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to upload a file chunk to the relay.');
}

export async function publishRelayMessage({
  connectedRoom,
  deviceId,
  message,
  onPublishFailed,
}: {
  connectedRoom: string | null;
  deviceId: string;
  message: BeamMessage;
  onPublishFailed: () => void;
}): Promise<boolean> {
  if (!connectedRoom || !isBrowserNetworkAvailable()) return false;
  const topic = topicForRoom(message.roomCode);
  const body: BeamMessage = {
    ...message,
    msgId: message.msgId || randomId('m'),
    origin: message.origin || deviceId,
    timestamp: message.timestamp || Date.now(),
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchWithTimeout(
        `${CLOUD_RELAY_BASE}/${topic}`,
        {
          method: 'POST',
          keepalive: body.type === 'BEAM_DISCONNECT',
          headers: {
            'Content-Type': 'application/json',
            'X-Title': 'Otium Beam',
          },
          body: JSON.stringify(body),
        },
        15000
      );
      if (response.ok) return true;
      if (isRetryableStatus(response.status) && attempt === 0) {
        await sleep(retryDelayMs(response, attempt));
        continue;
      }
      return false;
    } catch (error) {
      if (attempt === 0) {
        await sleep(retryDelayMs(null, attempt));
      } else {
        console.debug('Cloud signaling transport note:', error);
      }
    }
  }
  onPublishFailed();
  return false;
}

export async function uploadAndBroadcastViaRelay({
  connectedRoom,
  sessionId,
  options,
  assertActive,
  putChunk,
  onTransferPatch,
  registerCompletion,
  broadcastPayload,
}: {
  connectedRoom: string;
  sessionId: string | null;
  options: BeamDocumentAttempt;
  assertActive: () => void;
  putChunk: (topic: string, chunk: ArrayBuffer, filename: string) => Promise<string>;
  onTransferPatch: (patch: Partial<BeamTransferState>) => void;
  registerCompletion: (transferId: string) => Promise<void>;
  broadcastPayload: (msg: BeamMessage) => Promise<void>;
}): Promise<void> {
  const totalBytes = options.buffer.byteLength;
  const checkpoint = options.checkpoint;
  const sha256 = checkpoint ? checkpoint.sha256 : await computeSha256(options.buffer);
  assertActive();
  const transferId = checkpoint?.transferId ?? randomId('t');
  const chunkCount = Math.ceil(totalBytes / RELAY_CHUNK_SIZE);
  const baseTopic = topicForRoom(connectedRoom);
  const safeName = encodeURIComponent(
    (options.title || 'document').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60)
  );
  const chunks = checkpoint?.relayChunks ?? [];
  if (checkpoint && Date.now() - checkpoint.relayStartedAt > 5 * 60_000) {
    checkpoint.relayStartedAt = Date.now();
    chunks.length = 0;
  }

  onTransferPatch({
    active: true,
    direction: 'send',
    mode: 'relay',
    phase: 'transferring',
    progress: 2,
    bytesTransferred: Math.min(chunks.length * RELAY_CHUNK_SIZE, totalBytes),
    totalBytes,
    error: null,
  });

  for (let index = chunks.length; index < chunkCount; index++) {
    const start = index * RELAY_CHUNK_SIZE;
    const end = Math.min(start + RELAY_CHUNK_SIZE, totalBytes);
    const chunk = options.buffer.slice(start, end);
    const topic = `${baseTopic}_${safeTopicPart(transferId)}_c${index}`;
    const filename = `${safeName}.part${index}`;
    const url = await putChunk(topic, chunk, filename);
    assertActive();
    chunks.push(url);
    onTransferPatch({
      phase: 'transferring',
      progress: Math.min(88, 2 + Math.round(((index + 1) / chunkCount) * 86)),
      bytesTransferred: end,
    });
  }

  onTransferPatch({ phase: 'finalizing', progress: 92 });
  const completion = registerCompletion(transferId);
  ignoreBenignRejection(completion, 'relay-completion-preattach');
  await broadcastPayload({
    type: 'BEAM_PAYLOAD',
    roomCode: connectedRoom,
    sessionId: sessionId || undefined,
    senderName: getDeviceLabel(),
    payload: {
      title: options.title,
      pageNumber: options.pageNumber,
      totalPages: options.totalPages,
      theme: options.theme,
      chunks: [...chunks],
      totalSize: totalBytes,
      sha256: sha256 || undefined,
      transferId,
    },
    timestamp: Date.now(),
  });

  await completion;
  assertActive();

  onTransferPatch({
    active: false,
    phase: 'done',
    progress: 100,
    bytesTransferred: totalBytes,
    totalBytes,
  });
}
