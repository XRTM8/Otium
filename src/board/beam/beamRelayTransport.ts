import type { BeamMessage, BeamTransferState } from '../types';
import { boundedResponseBytes, trustedRelayUrl } from './beamSecurity';
import {
  RELAY_CHUNK_SIZE,
  RELAY_MAX_BYTES,
  MAX_FILE_BYTES,
  computeSha256,
  isPdfHeader,
  isRetryableStatus,
  mergeBuffers,
  mapWithConcurrency,
  retryDelayMs,
  sleep,
  isBeamMessage,
} from './beamUtils';

export {
  publishRelayMessage,
  putRelayAttachment,
  uploadAndBroadcastViaRelay,
} from './beamRelayUpload';

export interface RelayAttachmentPayload {
  event?: string;
  id?: string;
  type?: string;
  roomCode?: string;
  message?: string;
  time?: number;
  attachment?: {
    url?: string;
    name?: string;
  };
}

export async function fetchRelayWithRetry(url: string, attempts = 3): Promise<Response> {
  return readRelayWithRetry(url, response => Promise.resolve(response), attempts);
}

async function readRelayWithRetry<T>(url: string, read: (response: Response) => Promise<T>, attempts = 3): Promise<T> {
  const safeUrl = trustedRelayUrl(url);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    let delay = 0;
    try {
      const response = await fetch(safeUrl, {
        redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal,
      });
      if (response.ok) return await read(response);
      if (!isRetryableStatus(response.status) || attempt === attempts - 1) {
        throw new Error(`Relay returned HTTP ${response.status}.`);
      }
      delay = retryDelayMs(response, attempt);
    } catch (error) {
      const interrupted = error instanceof TypeError || (error instanceof Error && error.name === 'AbortError');
      if (!interrupted || attempt === attempts - 1) throw error;
      delay = retryDelayMs(null, attempt);
    } finally {
      clearTimeout(timer);
    }
    await sleep(delay);
  }
  throw new Error('Failed to download the relay attachment.');
}

export async function fetchRelayAttachmentText(url: string): Promise<string> {
  return new TextDecoder().decode(await fetchRelayAttachmentBuffer(url, 2 * 1024 * 1024));
}

export async function fetchRelayAttachmentBuffer(url: string, maxBytes = MAX_FILE_BYTES): Promise<ArrayBuffer> {
  return readRelayWithRetry(url, response => boundedResponseBytes(response, maxBytes));
}

export async function extractMessagesFromRelayEvent(
  parsed: RelayAttachmentPayload,
  context: {
    role: 'receiver' | 'sender' | null;
    peerSessionId: string | null;
    connectedRoom: string | null;
    fetchText: (url: string) => Promise<string>;
  }
): Promise<BeamMessage[]> {
  if (!parsed.message && isBeamMessage(parsed)) {
    return [parsed];
  }

  if (typeof parsed.message === 'string' && parsed.message.length > 0) {
    try {
      const inner = JSON.parse(parsed.message) as Partial<BeamMessage> | null;
      if (inner && inner.type && inner.roomCode) {
        return [inner as BeamMessage];
      }
    } catch {
      // ntfy stores bodies larger than 4 KB as an attachment.
    }
  }

  const attachment = parsed.attachment;
  if (attachment?.url) {
    const name = String(attachment.name || '').toLowerCase();
    const isJsonLike =
      name.endsWith('.json') ||
      name.endsWith('.txt') ||
      name.endsWith('.bin') ||
      name === 'attachment' ||
      name === '';
    if (isJsonLike) {
      try {
        const text = await context.fetchText(attachment.url);
        const inner = JSON.parse(text) as Partial<BeamMessage> | null;
        if (inner && inner.type && inner.roomCode) {
          return [inner as BeamMessage];
        }
      } catch (error) {
        console.warn('Failed to read beam relay attachment:', error);
      }
    } else if (name.includes('.pdf')) {
      // Backwards compatibility with v1 senders before pairing sessions existed.
      if (context.role !== 'receiver' || context.peerSessionId) return [];
      let title = 'document';
      try {
        title = decodeURIComponent(attachment.name || '').replace(/\.pdf$/i, '');
      } catch {
        title = String(attachment.name || '').replace(/\.pdf$/i, '');
      }
      return [
        {
          type: 'BEAM_PAYLOAD',
          roomCode: context.connectedRoom || 'BEAM',
          payload: {
            title,
            pageNumber: 1,
            totalPages: 1,
            theme: 'midnight',
            pdfUrl: attachment.url,
          },
          timestamp: typeof parsed.time === 'number' ? parsed.time * 1000 : Date.now(),
        },
      ];
    }
  }

  return [];
}

export async function downloadChunksViaRelay({
  chunks,
  expectedSize,
  expectedSha256,
  fetchChunk,
  onTransferPatch,
}: {
  chunks: string[];
  expectedSize?: number;
  expectedSha256?: string;
  fetchChunk: (url: string, maxBytes: number) => Promise<ArrayBuffer>;
  onTransferPatch: (patch: Partial<BeamTransferState>) => void;
}): Promise<ArrayBuffer> {
  if (!Array.isArray(chunks) || chunks.length === 0 || chunks.length > Math.ceil(RELAY_MAX_BYTES / RELAY_CHUNK_SIZE) + 1) {
    throw new Error('The relay payload contains no chunks.');
  }
  if (expectedSize !== undefined && (!Number.isInteger(expectedSize) || expectedSize <= 0 || expectedSize > RELAY_MAX_BYTES)) {
    throw new Error('Invalid relay transfer size.');
  }
  if (expectedSha256 !== undefined && !/^[a-f0-9]{64}$/i.test(expectedSha256)) {
    throw new Error('Invalid relay checksum.');
  }
  chunks.forEach(trustedRelayUrl);

  onTransferPatch({
    active: true,
    direction: 'receive',
    mode: 'relay',
    phase: 'transferring',
    progress: 0,
    bytesTransferred: 0,
    totalBytes: expectedSize || 0,
    error: null,
  });

  let failed = false;
  try {
    const parts: ArrayBuffer[] = new Array(chunks.length);
    let downloaded = 0;

    const downloadOne = async (url: string, index: number): Promise<void> => {
      if (failed) return;
      const buffer = await fetchChunk(url, RELAY_CHUNK_SIZE + 1024);
      if (failed) return;
      parts[index] = buffer;
      downloaded += buffer.byteLength;
      if (downloaded > RELAY_MAX_BYTES || (expectedSize && downloaded > expectedSize)) {
        throw new Error('Relay payload exceeds the announced size.');
      }
      const total = expectedSize || downloaded;
      onTransferPatch({
        phase: 'transferring',
        progress: Math.min(96, Math.round((downloaded / Math.max(1, total)) * 100)),
        bytesTransferred: downloaded,
        totalBytes: total,
      });
    };

    await mapWithConcurrency(chunks, 3, downloadOne);

    const merged = mergeBuffers(parts);
    if (expectedSize && merged.byteLength !== expectedSize) {
      throw new Error(`Relay size mismatch (expected ${expectedSize} bytes, got ${merged.byteLength}).`);
    }
    if (!isPdfHeader(merged)) {
      throw new Error('The relay payload is not a valid PDF.');
    }
    if (expectedSha256) {
      const actual = await computeSha256(merged);
      if (!actual || actual.toLowerCase() !== expectedSha256.toLowerCase()) {
        throw new Error('Relay checksum mismatch. Please retry the transfer.');
      }
    }

    onTransferPatch({
      active: true,
      phase: 'finalizing',
      progress: 98,
      bytesTransferred: merged.byteLength,
      totalBytes: merged.byteLength,
    });
    return merged;
  } catch (error) {
    failed = true;
    const message = error instanceof Error ? error.message : 'Relay download failed.';
    onTransferPatch({ active: false, phase: 'error', error: message });
    throw error;
  }
}
