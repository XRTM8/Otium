import type { Language } from '../../core/i18n/translations';
import { localStorage } from '../../platform/storage';
import type { BeamMessage, BeamTransferState, BeamTransport } from '../types';
import type { BeamDirectChannel } from './beamLanTransport';
import type { BeamSignalingState } from './beamSignalingTransport';
import {
  BEAM_CHANNEL_NAME,
  BEAM_STORAGE_KEY,
  HANDSHAKE_INTERVAL_MS,
  MAX_SEEN_MESSAGES,
  PEER_TIMEOUT_MS,
  PING_INTERVAL_MS,
  getDeviceLabel,
  randomId,
  type LocalDocState,
} from './beamUtils';

export function buildBeamHandshakeMessage(roomCode: string, sessionId: string): BeamMessage {
  return {
    type: 'BEAM_HANDSHAKE',
    roomCode,
    sessionId,
    senderName: getDeviceLabel(),
    timestamp: Date.now(),
  };
}

export function buildBeamPingMessage(roomCode: string, sessionId: string, now = Date.now()): BeamMessage {
  return {
    type: 'BEAM_PING',
    roomCode,
    sessionId,
    timestamp: now,
  };
}

export function buildBeamReadyMessage(roomCode: string, sessionId: string, localDoc: LocalDocState): BeamMessage {
  return {
    type: 'BEAM_READY',
    roomCode,
    sessionId,
    receiverName: getDeviceLabel(),
    docTitle: localDoc.title || undefined,
    pageNumber: localDoc.page,
    totalPages: localDoc.total,
    timestamp: Date.now(),
  };
}

export function buildBeamPongMessage(roomCode: string, sessionId: string): BeamMessage {
  return {
    type: 'BEAM_PONG',
    roomCode,
    sessionId,
    timestamp: Date.now(),
  };
}

export function buildBeamDisconnectMessage(roomCode: string, sessionId: string): BeamMessage {
  return {
    type: 'BEAM_DISCONNECT',
    roomCode,
    sessionId,
    timestamp: Date.now(),
  };
}

export function rememberBeamMessage(seenMessages: Map<string, number>, msg: BeamMessage): boolean {
  if (!msg.msgId) return true;
  if (seenMessages.has(msg.msgId)) return false;
  seenMessages.set(msg.msgId, Date.now());
  if (seenMessages.size > MAX_SEEN_MESSAGES) {
    const oldest = seenMessages.keys().next().value;
    if (oldest !== undefined) seenMessages.delete(oldest);
  }
  return true;
}

export interface BeamMaintenanceHost {
  sigState: BeamSignalingState;
  isPeerConnected: () => boolean;
  getLastPeerSeen: () => number;
  getLastPingAt: () => number;
  closeRtc: () => void;
  resetPeer: () => void;
  sendHandshake: () => void;
  sendPing: () => void;
}

export function startBeamMaintenanceLoop(host: BeamMaintenanceHost): number | null {
  if (typeof window === 'undefined' || typeof window.setInterval !== 'function') return null;
  return window.setInterval(() => {
    if (!host.sigState.connectedRoom) return;
    const now = Date.now();
    const lastSeen = host.getLastPeerSeen();
    if (host.isPeerConnected() && lastSeen > 0 && now - lastSeen > PEER_TIMEOUT_MS) {
      host.closeRtc();
      host.resetPeer();
    }
    if (host.sigState.role === 'sender') {
      if (!host.isPeerConnected()) host.sendHandshake();
      else if (now - host.getLastPingAt() >= PING_INTERVAL_MS) host.sendPing();
    }
  }, HANDSHAKE_INTERVAL_MS);
}

/** Attaches BroadcastChannel and window storage/network listeners for Beam signaling. */
export function attachBeamLocalTransports(handlers: {
  onIncoming: (msg: BeamMessage, transport: BeamTransport) => void;
  onOnline: () => void;
  onOffline: () => void;
}): BroadcastChannel | null {
  let channel: BroadcastChannel | null = null;
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(BEAM_CHANNEL_NAME);
      channel.onmessage = (event) => {
        const msg = event.data as BeamMessage | undefined;
        if (msg) handlers.onIncoming(msg, 'local');
      };
    } catch (error) {
      console.warn('BroadcastChannel not available, using fallback:', error);
    }
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (event) => {
      if (event.key === BEAM_STORAGE_KEY && event.newValue) {
        try {
          handlers.onIncoming(JSON.parse(event.newValue) as BeamMessage, 'local');
        } catch (err) {
          console.warn('[Beam] Failed to parse local storage frame:', err);
        }
      }
    });
    window.addEventListener('online', handlers.onOnline);
    window.addEventListener('offline', handlers.onOffline);
  }
  return channel;
}

/** Sends a Beam message over WebRTC DataChannel when open, plus BroadcastChannel, storage, and cloud relay. */
export async function dispatchBeamMessage(params: {
  message: BeamMessage;
  sessionId?: string;
  deviceId: string;
  dataChannel: BeamDirectChannel | null;
  lanOnly?: boolean;
  broadcastChannel: BroadcastChannel | null;
  seenMessages: Map<string, number>;
  publishRelay: (message: BeamMessage) => Promise<boolean>;
}): Promise<void> {
  const outgoing: BeamMessage = {
    ...params.message,
    sessionId: params.message.sessionId || params.sessionId,
    msgId: params.message.msgId || randomId('m'),
    origin: params.message.origin || params.deviceId,
    timestamp: params.message.timestamp || Date.now(),
  };
  rememberBeamMessage(params.seenMessages, outgoing);

  if (!outgoing.type.startsWith('BEAM_RTC_') && params.dataChannel?.readyState === 'open') {
    try {
      params.dataChannel.send(JSON.stringify(outgoing));
      if (outgoing.type !== 'BEAM_DISCONNECT') return;
    } catch (error) {
      console.debug('P2P channel send note, relay fallback active:', error);
    }
  }
  if (params.lanOnly) return;
  if (params.broadcastChannel) {
    try {
      params.broadcastChannel.postMessage(outgoing);
    } catch (err) {
      console.debug('[Beam] BroadcastChannel postMessage skipped:', err);
    }
  }
  try {
    localStorage.setItem(BEAM_STORAGE_KEY, JSON.stringify(outgoing));
  } catch (err) {
    console.debug('[Beam] localStorage relay mirror skipped:', err);
  }
  await params.publishRelay(outgoing);
}

/** Delivers an incoming Beam document message to active listeners and confirms opening. */
export async function deliverBeamDocumentToListeners(
  listeners: Set<(msg: BeamMessage, transport: BeamTransport) => void | Promise<void>>,
  isCurrentSession: (sessionId?: string) => boolean,
  notifyOpened: (msg: BeamMessage, transport: BeamTransport) => void,
  message: BeamMessage,
  transport: BeamTransport,
): Promise<void> {
  const pending: Promise<void>[] = [];
  for (const listener of listeners) {
    const result = listener(message, transport);
    if (result) pending.push(result);
  }
  if (!pending.length) throw new Error('The receiving reader is not ready. Reopen Receiver and retry.');
  await Promise.all(pending);
  if (!isCurrentSession(message.sessionId)) throw new Error('The receiving session was cancelled.');
  notifyOpened({ ...message, type: 'BEAM_DOCUMENT_OPENED' }, transport);
}

/** Formats human-readable localized status text for active Beam file transfers. */
export function formatBeamTransferPhaseText(transfer: BeamTransferState, lang: Language): string | null {
  if (!transfer.active && transfer.phase !== 'finalizing') return null;
  const ar = lang === 'ar';
  if (transfer.phase === 'waiting-peer') {
    return ar ? 'بانتظار استجابة السبورة…' : 'Waiting for the receiver…';
  }
  if (transfer.phase === 'preparing') {
    return ar ? 'جارٍ تجهيز الاتصال المباشر…' : 'Preparing the direct connection…';
  }
  if (transfer.phase === 'finalizing') {
    return ar ? 'بانتظار فتح الملف على الجهاز الآخر…' : 'Waiting for the receiver to open the file…';
  }
  if (transfer.phase === 'transferring') {
    const channel = transfer.mode === 'p2p' ? (ar ? 'P2P مباشر' : 'Direct P2P') : ar ? 'سحابة' : 'Cloud';
    return `${channel} · ${transfer.progress}%`;
  }
  return null;
}
