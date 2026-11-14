import type { BeamMessage, BeamTransferState, BeamTransport } from '../types';
import type { BeamConnectionStatus, SendDocumentOptions } from './beamUtils';
import {
  BeamSendError,
  BeamTransferTimeout,
  CLOUD_FAILURES_BEFORE_ERROR,
  CLOUD_RELAY_BASE,
  MAX_FILE_BYTES,
  P2P_WAIT_MS,
  PEER_WAIT_MS,
  RELAY_MAX_BYTES,
  SSE_SINCE,
  fetchWithTimeout,
  formatRoomCode,
  isPdfHeader,
  sleep,
  topicForRoom,
} from './beamUtils';
import type { RelayAttachmentPayload } from './beamRelayTransport';
import { prepareBeamDocument, type BeamDocumentAttempt } from './beamDocumentCheckpoint';
import { BeamDirectInterrupted } from './beamWebRtcTransfer';
import { isBeamMediaFile, validateFile } from '../../media/media';
import type { BeamDirectChannel } from './beamLanTransport';

export interface BeamSignalingState {
  documentCheckpoint?: BeamDocumentAttempt['checkpoint'];
  activeEventSource: EventSource | null;
  activeRoomCode: string | null;
  connectedRoom: string | null;
  role: 'receiver' | 'sender' | null;
  connectionStatus: BeamConnectionStatus;
  sessionId: string | null;
  relayCursor: string;
  pollingGeneration: number | null;
  reconnectAttempt: number;
  sourceGeneration: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  connectionTimer: ReturnType<typeof setTimeout> | null;
  pollTimer: ReturnType<typeof setTimeout> | null;
}

export interface BeamSignalingHost {
  state: BeamSignalingState;
  setConnectionStatus: (status: BeamConnectionStatus) => void;
  closeEventSource: () => void;
  openEventSource: () => void;
  pollRoom: (generation: number) => Promise<void>;
  scheduleReconnect: (generation: number) => void;
  handleRelayEvent: (raw: string, generation?: number) => Promise<void>;
  extractRelayMessages: (parsed: Record<string, unknown>) => Promise<BeamMessage[]>;
  handleIncoming: (message: BeamMessage, transport: BeamTransport) => Promise<void>;
  sendHandshake: () => void;
}

export function openBeamEventSource(host: BeamSignalingHost): void {
  const s = host.state;
  host.closeEventSource();
  if (!s.activeRoomCode) return;
  if (typeof EventSource === 'undefined') {
    host.setConnectionStatus('connecting');
    void host.pollRoom(s.sourceGeneration);
    return;
  }

  const generation = s.sourceGeneration;
  host.setConnectionStatus('connecting');

  try {
    const topic = topicForRoom(s.activeRoomCode);
    const source = new EventSource(`${CLOUD_RELAY_BASE}/${topic}/sse?since=${SSE_SINCE}`);
    s.activeEventSource = source;

    s.connectionTimer = setTimeout(() => {
      if (generation !== s.sourceGeneration) return;
      source.close();
      s.activeEventSource = null;
      host.setConnectionStatus('connecting');
      void host.pollRoom(generation);
    }, 15000);

    source.onopen = () => {
      if (generation !== s.sourceGeneration || s.activeEventSource !== source) return;
      if (s.connectionTimer !== null) clearTimeout(s.connectionTimer);
      s.connectionTimer = null;
      s.reconnectAttempt = 0;
      host.setConnectionStatus('connected');
      if (s.role === 'sender') host.sendHandshake();
    };

    source.onmessage = (event) => {
      if (generation !== s.sourceGeneration || s.activeEventSource !== source) return;
      void host.handleRelayEvent(event.data, generation);
    };

    source.onerror = () => {
      if (generation !== s.sourceGeneration || s.activeEventSource !== source) return;
      if (s.connectionTimer !== null) clearTimeout(s.connectionTimer);
      s.connectionTimer = null;
      host.setConnectionStatus('connecting');
      source.close();
      s.activeEventSource = null;
      void host.pollRoom(generation);
    };
  } catch {
    host.setConnectionStatus('connecting');
    host.scheduleReconnect(generation);
  }
}

export function closeBeamEventSource(s: BeamSignalingState): void {
  s.sourceGeneration += 1;
  s.pollingGeneration = null;
  if (s.pollTimer !== null) {
    clearTimeout(s.pollTimer);
    s.pollTimer = null;
  }
  if (s.connectionTimer !== null) {
    clearTimeout(s.connectionTimer);
    s.connectionTimer = null;
  }
  if (s.reconnectTimer !== null) {
    clearTimeout(s.reconnectTimer);
    s.reconnectTimer = null;
  }
  if (s.activeEventSource) {
    try {
      s.activeEventSource.close();
    } catch (err) {
      console.debug('[BeamSignaling] EventSource close note:', err);
    }
    s.activeEventSource = null;
  }
}

export async function pollBeamRoom(host: BeamSignalingHost, generation: number): Promise<void> {
  const s = host.state;
  if (generation !== s.sourceGeneration || !s.activeRoomCode) return;
  s.pollingGeneration = generation;
  try {
    const topic = topicForRoom(s.activeRoomCode);
    const url = `${CLOUD_RELAY_BASE}/${topic}/json?poll=1&since=${encodeURIComponent(s.relayCursor)}`;
    const response = await fetchWithTimeout(url, undefined, 10000);
    if (generation !== s.sourceGeneration) return;
    if (!response.ok) throw new Error(`Signaling returned HTTP ${response.status}`);
    const body = await response.text();
    if (generation !== s.sourceGeneration) return;
    host.setConnectionStatus('connected');
    s.reconnectAttempt = 0;
    for (const line of body.split('\n')) {
      if (generation !== s.sourceGeneration) return;
      if (line.trim()) await host.handleRelayEvent(line, generation);
    }
  } catch {
    if (generation !== s.sourceGeneration) return;
    s.reconnectAttempt += 1;
    host.setConnectionStatus(s.reconnectAttempt >= CLOUD_FAILURES_BEFORE_ERROR ? 'error' : 'connecting');
  }
  if (generation !== s.sourceGeneration) return;
  const delay = s.reconnectAttempt === 0 ? 5000 : Math.min(30000, 1500 * 2 ** Math.min(4, s.reconnectAttempt));
  s.pollTimer = setTimeout(() => {
    s.pollTimer = null;
    void host.pollRoom(generation);
  }, delay);
}

export function scheduleBeamReconnect(host: BeamSignalingHost, generation: number): void {
  const s = host.state;
  if (s.reconnectTimer !== null || !s.activeRoomCode) return;
  const delay = Math.min(30000, 1000 * 2 ** s.reconnectAttempt);
  s.reconnectAttempt += 1;
  s.reconnectTimer = setTimeout(() => {
    s.reconnectTimer = null;
    if (generation === s.sourceGeneration && s.activeRoomCode) host.openEventSource();
  }, delay);
}

export async function processBeamRelayEvent(
  host: BeamSignalingHost,
  raw: string,
  generation: number
): Promise<void> {
  const s = host.state;
  let parsed: RelayAttachmentPayload | null = null;
  try {
    parsed = JSON.parse(raw) as RelayAttachmentPayload;
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== 'object') return;
  const messages = await host.extractRelayMessages(parsed as Record<string, unknown>);
  if (generation !== s.sourceGeneration) return;
  for (const msg of messages) {
    if (generation !== s.sourceGeneration) return;
    await host.handleIncoming(msg, 'relay');
  }
  if (generation === s.sourceGeneration && parsed.event === 'message' && typeof parsed.id === 'string') {
    s.relayCursor = parsed.id;
  }
}

export interface BeamSendDocumentHost {
  sigState: BeamSignalingState;
  isSendingDocument: () => boolean;
  setSendingDocument: (val: boolean) => void;
  startSender: (room: string, force: boolean) => void;
  isRtcSupported: () => boolean;
  isLan?: () => boolean;
  updateTransfer: (patch: Partial<BeamTransferState>) => void;
  waitForPeer: (timeoutMs: number) => Promise<boolean>;
  waitForDataChannel: (timeoutMs: number) => Promise<BeamDirectChannel | null>;
  sendFileOverDataChannel: (options: BeamDocumentAttempt) => Promise<void>;
  sendFileOverRelay: (options: BeamDocumentAttempt) => Promise<void>;
}

export async function executeBeamSendDocument(
  host: BeamSendDocumentHost,
  options: SendDocumentOptions
): Promise<{ mode: BeamTransport }> {
  if (host.isSendingDocument()) {
    throw new BeamSendError('busy', 'Another document transfer is already in progress.');
  }
  const { fileName } = options;
  const media = fileName !== undefined;
  if (media && (!isBeamMediaFile(fileName) ||
      validateFile({ name: fileName, size: options.buffer.byteLength }))) {
    throw new BeamSendError('invalid-document', 'This image, video, or presentation format or size is unsupported.');
  }
  if (!media && !isPdfHeader(options.buffer)) {
    throw new BeamSendError('invalid-document', 'The selected file does not look like a valid PDF.');
  }
  if (options.buffer.byteLength <= 0 || options.buffer.byteLength > MAX_FILE_BYTES) {
    throw new BeamSendError('too-large', 'The file exceeds the 300 MB Beam transfer limit.');
  }
  const room = formatRoomCode(options.roomCode);
  if (!room) {
    throw new BeamSendError('peer-unreachable', 'Missing Beam room code.');
  }

  const s = host.sigState;
  if (s.connectedRoom !== room || s.role !== 'sender') {
    host.startSender(room, true);
  }

  host.setSendingDocument(true);
  const sendingSession = s.sessionId;
  const assertActive = () => {
    if (s.sessionId !== sendingSession || s.connectedRoom !== room || s.role !== 'sender') {
      throw new BeamSendError('transfer-failed', 'Transfer cancelled because the Beam session changed.');
    }
  };

  try {
    host.updateTransfer({
      active: true,
      direction: 'send',
      mode: null,
      phase: 'waiting-peer',
      progress: 0,
      bytesTransferred: 0,
      totalBytes: options.buffer.byteLength,
      error: null,
    });

    const peerReady = await host.waitForPeer(PEER_WAIT_MS);
    assertActive();
    if (!peerReady) {
      throw new BeamSendError(
        'peer-unreachable',
        'The receiver did not answer. Open Otium on the other device, choose Receiver, and make sure the code matches.'
      );
    }
    const checkpoint = await prepareBeamDocument(sendingSession, options, s.documentCheckpoint);
    assertActive();
    s.documentCheckpoint = checkpoint;
    const attempt = { ...options, checkpoint };

    if (host.isRtcSupported()) {
      host.updateTransfer({ phase: 'preparing', mode: 'p2p', progress: 2 });
      for (let retry = 0; retry < 2; retry++) {
        const channel = await host.waitForDataChannel(P2P_WAIT_MS);
        assertActive();
        if (!channel) break;
        try {
          await host.sendFileOverDataChannel(attempt);
          assertActive();
          s.documentCheckpoint = undefined;
          return { mode: 'p2p' };
        } catch (error) {
          assertActive();
          if (error instanceof BeamSendError && error.code === 'invalid-document') throw error;
          if (retry === 0 && (error instanceof BeamDirectInterrupted || error instanceof BeamTransferTimeout)) continue;
          if (media || host.isLan?.()) throw error;
          console.warn('P2P transfer failed, trying cloud relay:', error);
          break;
        }
      }
    }

    if (host.isLan?.()) {
      throw new BeamSendError('peer-unreachable', 'The local connection closed. Reconnect on the same Wi-Fi and retry the file.');
    }
    if (media) {
      throw new BeamSendError('peer-unreachable', 'Media requires a direct connection. Keep both devices on the same Wi-Fi or hotspot and update Otium on both devices.');
    }
    if (options.buffer.byteLength > RELAY_MAX_BYTES) {
      throw new BeamSendError(
        'too-large',
        'This PDF is too large for the cloud relay. Keep both devices on the same Wi-Fi or phone hotspot so the direct connection can be used.'
      );
    }

    try {
      await host.sendFileOverRelay(attempt);
    } catch (error) {
      assertActive();
      if (!(error instanceof BeamTransferTimeout)) throw error;
      await host.sendFileOverRelay(attempt);
    }
    assertActive();
    s.documentCheckpoint = undefined;
    return { mode: 'relay' };
  } catch (error) {
    if (sendingSession !== s.sessionId) throw error;
    const message = error instanceof Error ? error.message : 'Document transfer failed.';
    host.updateTransfer({ active: false, phase: 'error', error: message });
    if (error instanceof BeamSendError) {
      if (error.code === 'invalid-document') s.documentCheckpoint = undefined;
      throw error;
    }
    throw new BeamSendError('transfer-failed', message);
  } finally {
    host.setSendingDocument(false);
  }
}

export async function waitUntilBeamPeerConnected(
  isPeerConnected: () => boolean,
  getConnectedRoom: () => string | null,
  timeoutMs: number
): Promise<boolean> {
  if (isPeerConnected()) return true;
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (isPeerConnected()) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() - started >= timeoutMs || !getConnectedRoom()) {
        clearInterval(timer);
        resolve(false);
      }
    }, 100);
  });
}

export async function waitForOpenBeamDataChannel(params: {
  getDataChannel: () => BeamDirectChannel | null;
  getConnectedRoom: () => string | null;
  getRole: () => 'receiver' | 'sender' | null;
  hasRtcPeer: () => boolean;
  isPeerConnected: () => boolean;
  initiateRtc: () => Promise<void>;
  timeoutMs: number;
}): Promise<BeamDirectChannel | null> {
  const started = Date.now();
  while (Date.now() - started < params.timeoutMs && params.getConnectedRoom() && params.getRole() === 'sender') {
    const channel = params.getDataChannel();
    if (channel?.readyState === 'open') return channel;
    if (!params.hasRtcPeer() && params.isPeerConnected()) void params.initiateRtc();
    await sleep(120);
  }
  const channel = params.getDataChannel();
  return channel?.readyState === 'open' ? channel : null;
}
