import type { BeamMessage } from '../types';
import type { ThemeMode } from '../../core/types';
import { ignoreBenignRejection } from '../../core/utils/bestEffort';
import {
  MAX_FILE_BYTES,
  P2P_CHUNK_SIZE,
  P2P_HIGH_WATER_MARK,
  computeSha256,
  isBeamMessage,
  isPdfHeader,
  mergeBuffers,
  randomId,
  sleep,
} from './beamUtils';
import type { BeamWebRtcHost } from './beamWebRtcTransport';
import type { BeamDirectChannel } from './beamLanTransport';
import type { BeamDocumentAttempt } from './beamDocumentCheckpoint';
import { isBeamMediaFile, validateFile } from '../../media/media';

interface DataChannelControlMessage {
  kind?: string;
  transferId?: string;
  ok?: boolean;
  message?: string;
  type?: BeamMessage['type'];
  roomCode?: string;
  sessionId?: string;
  size?: number;
  offset?: number;
  complete?: boolean;
  title?: string;
  name?: string;
  fileName?: string;
  sha256?: string;
  pageNumber?: number;
  totalPages?: number;
  theme?: ThemeMode;
}

export class BeamDirectInterrupted extends Error {}

function matchesCheckpoint(file: BeamWebRtcHost['state']['openedFile'], meta: DataChannelControlMessage): boolean {
  return Boolean(file && file.sessionId && file.sessionId === meta.sessionId &&
    file.transferId === meta.transferId && file.size === meta.size && file.sha256 && file.sha256 === meta.sha256);
}

export async function processDataChannelPayload(host: BeamWebRtcHost, data: unknown): Promise<void> {
  if (typeof data === 'string') {
    let parsed: DataChannelControlMessage;
    try {
      parsed = JSON.parse(data) as DataChannelControlMessage;
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;

    if (parsed.kind === 'file-resume' && host.getRole() === 'receiver' && parsed.sessionId === host.getPeerSessionId()) {
      const file = host.state.incomingFile;
      const opened = host.state.openedFile;
      const complete = opened !== undefined && matchesCheckpoint(opened, parsed);
      const offset = complete ? opened.size : file && matchesCheckpoint(file, parsed) ? file.received : 0;
      host.sendDataChannelControl({ kind: 'file-offset', transferId: parsed.transferId, offset, complete });
      return;
    }
    if (parsed.kind === 'file-offset') {
      host.state.acceptOffset?.(String(parsed.transferId || ''), Number(parsed.offset), parsed.complete === true);
      return;
    }
    if (parsed.kind === 'file-begin') {
      host.beginIncomingFile(parsed);
      return;
    }
    if (parsed.kind === 'file-end') {
      await host.finishIncomingFile(String(parsed.transferId || ''));
      return;
    }
    if (parsed.kind === 'file-cancel') {
      if (!parsed.transferId || host.state.incomingFile?.transferId !== parsed.transferId) return;
      host.state.incomingFile = null;
      host.updateTransfer({ active: false, phase: 'error', error: 'The sender cancelled the transfer.' });
      return;
    }
    if (parsed.kind === 'file-complete') {
      host.handleFileCompletion(String(parsed.transferId || ''), parsed.ok === true, parsed.message);
      return;
    }
    if (parsed.kind === 'file-error') {
      host.handleFileCompletion(String(parsed.transferId || ''), false, parsed.message);
      return;
    }

    if (isBeamMessage(parsed)) {
      await host.handleIncoming(parsed, 'p2p');
    }
    return;
  }

  const channel = host.state.rtcDataChannel;
  const file = host.state.incomingFile;
  if (!file || host.state.incomingFileChannel !== channel || file.sessionId !== host.getPeerSessionId()) return;
  let buffer: ArrayBuffer | null = null;
  if (data instanceof ArrayBuffer) {
    buffer = data;
  } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
    buffer = await data.arrayBuffer();
  }
  if (!buffer || host.state.incomingFile !== file || host.state.rtcDataChannel !== channel) return;

  if (file.received + buffer.byteLength > file.size) {
    host.state.incomingFile = null;
    host.sendDataChannelControl({ kind: 'file-error', transferId: file.transferId, message: 'The file exceeds its declared size.' });
    host.updateTransfer({ active: false, phase: 'error', error: 'The file exceeds its declared size.' });
    return;
  }
  file.parts.push(buffer);
  file.received += buffer.byteLength;

  if (file.size > 0) {
    const now = Date.now();
    if (now - file.lastProgressAt > 120 || file.received >= file.size) {
      file.lastProgressAt = now;
      host.updateTransfer({
        active: true,
        direction: 'receive',
        mode: 'p2p',
        phase: 'transferring',
        progress: Math.min(96, Math.round((file.received / file.size) * 96)),
        bytesTransferred: file.received,
        totalBytes: file.size,
      });
    }
  }
}

export function beginBeamIncomingFile(
  host: BeamWebRtcHost,
  meta: DataChannelControlMessage,
): void {
  if (!meta?.sessionId || meta.sessionId !== host.getPeerSessionId() || host.getRole() !== 'receiver') return;
  const size = Number(meta.size);
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_FILE_BYTES) {
    host.updateTransfer({
      active: false,
      phase: 'error',
      error: 'The incoming file size is invalid.',
    });
    return;
  }
  if (meta.fileName !== undefined && (typeof meta.fileName !== 'string' || !isBeamMediaFile(meta.fileName) ||
      validateFile({ name: meta.fileName, size }))) {
    const message = 'The incoming media type or size is unsupported.';
    host.updateTransfer({ active: false, phase: 'error', error: message });
    host.sendDataChannelControl({ kind: 'file-error', transferId: meta.transferId, message });
    return;
  }

  const offset = meta.offset ?? 0;
  const retained = host.state.incomingFile;
  if (offset === size && matchesCheckpoint(host.state.openedFile, meta)) {
    host.sendDataChannelControl({ kind: 'file-complete', transferId: meta.transferId, ok: true });
    return;
  }
  if (offset !== 0 && (!retained || !matchesCheckpoint(retained, meta) || retained.received !== offset)) {
    host.sendDataChannelControl({ kind: 'file-error', transferId: meta.transferId, message: 'The direct transfer offset is no longer available.' });
    return;
  }
  host.state.incomingFile = offset && retained ? retained : {
    transferId: String(meta.transferId || randomId('r')),
    sessionId: meta.sessionId,
    title: String(meta.title || 'Beamed Document'),
    name: String(meta.name || 'document.pdf'),
    fileName: meta.fileName,
    size,
    sha256: typeof meta.sha256 === 'string' ? meta.sha256 : undefined,
    pageNumber: Number(meta.pageNumber) || 1,
    totalPages: Number(meta.totalPages) || 1,
    theme: meta.theme || 'midnight',
    parts: [],
    received: 0,
    lastProgressAt: 0,
  };
  host.state.incomingFileChannel = host.state.rtcDataChannel;

  host.updateTransfer({
    active: true,
    direction: 'receive',
    mode: 'p2p',
    phase: 'transferring',
    progress: Math.round((offset / size) * 96),
    bytesTransferred: offset,
    totalBytes: size,
    error: null,
  });
}

export async function finishBeamIncomingFile(host: BeamWebRtcHost, transferId: string): Promise<void> {
  const file = host.state.incomingFile;
  const session = host.getPeerSessionId();
  if (!file || file.transferId !== transferId || (file.sessionId && (file.sessionId !== session ||
      host.state.incomingFileChannel !== host.state.rtcDataChannel))) return;

  try {
    host.updateTransfer({
      active: true,
      phase: 'finalizing',
      progress: 98,
      bytesTransferred: file.received,
      totalBytes: file.size,
    });

    if (file.received !== file.size) {
      throw new Error(`P2P size mismatch (expected ${file.size} bytes, got ${file.received}).`);
    }

    const merged = mergeBuffers(file.parts);
    if (!file.fileName && !isPdfHeader(merged)) {
      throw new Error('The received file is not a valid PDF.');
    }
    if (file.sha256) {
      const actual = await computeSha256(merged);
      if (actual && actual !== file.sha256) {
        throw new Error('P2P checksum mismatch.');
      }
    }

    const payloadMessage: BeamMessage = {
      type: 'BEAM_PAYLOAD',
      roomCode: host.getConnectedRoom() || '',
      msgId: randomId('m'),
      sessionId: host.getPeerSessionId() || undefined,
      origin: host.getDeviceId(),
      payload: {
        title: file.title,
        pageNumber: file.pageNumber,
        totalPages: file.totalPages,
        theme: file.theme,
        ...(file.fileName ? { fileName: file.fileName, fileData: merged } : { pdfData: merged }),
        totalSize: merged.byteLength,
        sha256: file.sha256,
        transferId: file.transferId,
      },
      timestamp: Date.now(),
    };

    if (host.getPeerSessionId() !== session || host.getRole() !== 'receiver') return;
    await host.deliverDocument(payloadMessage, 'p2p');
    if (host.getPeerSessionId() !== session || host.getRole() !== 'receiver') return;
    host.state.openedFile = { transferId, sessionId: file.sessionId, size: file.size, sha256: file.sha256 };

    host.updateTransfer({
      active: false,
      phase: 'done',
      progress: 100,
      bytesTransferred: file.size,
      totalBytes: file.size,
    });

    host.sendDataChannelControl({
      kind: 'file-complete',
      transferId: file.transferId,
      ok: true,
    });
  } catch (error) {
    if (host.getPeerSessionId() !== session || host.getRole() !== 'receiver') return;
    const message = error instanceof Error ? error.message : 'P2P receive failed.';
    host.updateTransfer({ active: false, phase: 'error', error: message });
    host.sendDataChannelControl({
      kind: 'file-error',
      transferId: file.transferId,
      message,
    });
  } finally {
    if (host.state.incomingFile === file) host.state.incomingFile = null;
  }
}

export async function sendFileOverBeamChannel(
  host: BeamWebRtcHost,
  options: BeamDocumentAttempt
): Promise<void> {
  const session = host.getSessionId();
  const channel = host.state.rtcDataChannel;
  if (!channel || channel.readyState !== 'open') {
    throw new Error('The direct channel is not open yet.');
  }

  const checkpoint = options.checkpoint;
  const transferId = checkpoint?.transferId ?? randomId('t');
  const sha256 = checkpoint ? checkpoint.sha256 : await computeSha256(options.buffer);
  const assertChannel = () => {
    if (host.getSessionId() !== session || host.state.rtcDataChannel !== channel || channel.readyState !== 'open') {
      throw new BeamDirectInterrupted('The direct channel closed during transfer.');
    }
  };
  assertChannel();
  let interrupt = () => {};
  const interruption = new Promise<never>((_, reject) => {
    interrupt = () => reject(new BeamDirectInterrupted('The direct channel closed during transfer.'));
  });
  ignoreBenignRejection(interruption, 'rtc-interruption-preattach');
  host.state.interruptTransfer = interrupt;

  try {
    const retry = checkpoint && checkpoint.directAttempts++ > 0;
    const size = options.buffer.byteLength;
    const meta = { transferId, sessionId: session, size, sha256 };
    const resume = retry && sha256
      ? await requestBeamFileOffset(host, channel, { ...meta, sha256 }, interruption)
      : { offset: 0, complete: false };
    assertChannel();
    if (resume.complete) {
      host.updateTransfer({ active: false, phase: 'done', progress: 100, bytesTransferred: size, totalBytes: size, error: null });
      return;
    }
    const completion = host.registerCompletion(transferId, 90000, 'The receiver did not confirm the direct transfer.');
    ignoreBenignRejection(completion, 'rtc-completion-preattach');
    channel.send(
      JSON.stringify({
        kind: 'file-begin',
        ...meta,
        offset: resume.offset,
        name: options.fileName || (options.title ? `${options.title}.pdf` : 'document.pdf'),
        fileName: options.fileName,
        title: options.title,
        pageNumber: options.pageNumber,
        totalPages: options.totalPages,
        theme: options.theme,
      })
    );

    host.updateTransfer({
      active: true,
      direction: 'send',
      mode: 'p2p',
      phase: 'transferring',
      progress: 4,
      bytesTransferred: resume.offset,
      totalBytes: options.buffer.byteLength,
      error: null,
    });

    let offset = resume.offset;
    while (offset < options.buffer.byteLength) {
      while (channel.readyState === 'open' && channel.bufferedAmount > P2P_HIGH_WATER_MARK) {
        await Promise.race([sleep(40), interruption]);
      }
      assertChannel();
      const end = Math.min(offset + P2P_CHUNK_SIZE, options.buffer.byteLength);
      channel.send(options.buffer.slice(offset, end));
      offset = end;
      host.updateTransfer({
        phase: 'transferring',
        progress: Math.min(94, 4 + Math.round((offset / options.buffer.byteLength) * 90)),
        bytesTransferred: offset,
      });
    }

    assertChannel();
    channel.send(JSON.stringify({ kind: 'file-end', transferId }));
    host.updateTransfer({ phase: 'finalizing', progress: 96 });
    await Promise.race([completion, interruption]);
    assertChannel();

    host.updateTransfer({
      active: false,
      phase: 'done',
      progress: 100,
      bytesTransferred: options.buffer.byteLength,
      totalBytes: options.buffer.byteLength,
    });
  } catch (error) {
    assertChannel();
    throw error;
  } finally {
    if (host.state.interruptTransfer === interrupt) host.state.interruptTransfer = undefined;
    if (host.getFileCompletionId() === transferId) host.resolveFileCompletion(null);
  }
}

async function requestBeamFileOffset(
  host: BeamWebRtcHost, channel: BeamDirectChannel,
  meta: { transferId: string; sessionId: string | null; size: number; sha256: string },
  interruption: Promise<never>,
): Promise<{ offset: number; complete: boolean }> {
  const initial = { offset: 0, complete: false };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = new Promise<typeof initial>((resolve) => {
      // Older receivers ignore the probe and accept a regular file-begin from zero.
      timer = setTimeout(() => resolve(initial), 900);
      host.state.acceptOffset = (id, offset, complete) => {
        if (id !== meta.transferId || !Number.isSafeInteger(offset) || offset < 0 || offset > meta.size) return;
        resolve({ offset, complete: complete && offset === meta.size });
      };
      channel.send(JSON.stringify({ ...meta, kind: 'file-resume' }));
    });
    return await Promise.race([response, interruption]);
  } finally {
    clearTimeout(timer);
    host.state.acceptOffset = undefined;
  }
}
