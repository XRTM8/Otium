import type { BeamMessage, BeamPeerState, BeamTransferState, BeamTransport } from '../types';
import type { BeamProtocolHost } from './beamProtocolHandlers';
import type { BeamSignalingHost, BeamSignalingState } from './beamSignalingTransport';
import type { BeamWebRtcHost, BeamWebRtcState } from './beamWebRtcTransport';
import {
  BeamSendError,
  BeamTransferTimeout,
  EMPTY_PEER,
  EMPTY_TRANSFER,
  type BeamConnectionStatus,
  type FileCompletion,
} from './beamUtils';

/** Tracks observer callbacks and notifies Beam session, peer, transfer, and status subscribers. */
export class BeamObserverHub {
  readonly listeners = new Set<(msg: BeamMessage, transport: BeamTransport) => void | Promise<void>>();
  readonly stateListeners = new Set<(state: { room: string | null; role: 'receiver' | 'sender' | null }) => void>();
  readonly statusListeners = new Set<(status: BeamConnectionStatus) => void>();
  readonly peerListeners = new Set<(state: BeamPeerState) => void>();
  readonly transferListeners = new Set<(state: BeamTransferState) => void>();
  private lastNotifiedState = '';

  addObserver<T>(set: Set<T>, cb: T, emit?: () => void): () => void {
    set.add(cb);
    emit?.();
    return () => { set.delete(cb); };
  }

  private safeEmit<T>(listeners: Set<(payload: T) => void>, payload: T, label: string): void {
    listeners.forEach((l) => {
      try {
        l(payload);
      } catch (err) {
        console.warn(`[BeamObserverHub] ${label} listener error:`, err);
      }
    });
  }

  notifyState(room: string | null, role: 'receiver' | 'sender' | null): void {
    const state = { room, role };
    const serialized = `${room || ''}|${role || ''}`;
    if (serialized === this.lastNotifiedState) return;
    this.lastNotifiedState = serialized;
    this.safeEmit(this.stateListeners, state, 'state');
  }

  notifyStatus(status: BeamConnectionStatus): void {
    this.safeEmit(this.statusListeners, status, 'status');
  }

  notifyPeer(peerState: BeamPeerState): void {
    this.safeEmit(this.peerListeners, { ...peerState }, 'peer');
  }

  notifyTransfer(transferState: BeamTransferState): void {
    this.safeEmit(this.transferListeners, { ...transferState }, 'transfer');
  }

  notifyMessage(message: BeamMessage, transport: BeamTransport): void {
    for (const listener of this.listeners) {
      try {
        const result = listener(message, transport);
        if (result) void result.catch((error) => console.error('Error in beam listener:', error));
      } catch (error) {
        console.error('Error in beam listener:', error);
      }
    }
  }
}

/** Tracks pending remote document open confirmations with deterministic timeout settlement. */
export class BeamCompletionTracker {
  private completion: FileCompletion | null = null;
  completionId: string | null = null;

  register(transferId: string, timeoutMs: number, timeoutMessage: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.resolve(null);
      this.completionId = transferId;
      const timer = setTimeout(() => {
        if (this.completionId === transferId) {
          this.completionId = null;
          this.completion = null;
          reject(new BeamTransferTimeout(timeoutMessage));
        }
      }, timeoutMs);
      this.completion = { resolve, reject, timer };
    });
  }

  handle(transferId: string, ok: boolean, message?: string): void {
    if (!this.completion || this.completionId !== transferId) return;
    const active = this.completion;
    this.completion = null;
    this.completionId = null;
    clearTimeout(active.timer);
    if (ok) active.resolve();
    else active.reject(new BeamSendError('invalid-document', message || 'The receiver could not open the PDF.'));
  }

  resolve(error: Error | null): void {
    if (!this.completion) return;
    const active = this.completion;
    this.completion = null;
    this.completionId = null;
    clearTimeout(active.timer);
    if (error) active.reject(error);
    else active.resolve();
  }
}

export interface BeamServiceAdapterContext {
  sigState: BeamSignalingState;
  rtcState: BeamWebRtcState;
  getDeviceId: () => string;
  getPeerState: () => BeamPeerState;
  getPeerSessionId: () => string | null;
  setPeerSessionId: (id: string | null) => void;
  hasClosedSession: (id: string) => boolean;
  markSessionClosed: (id: string) => void;
  isCurrentSession: (id?: string) => boolean;
  setLastPeerSeen: (ts: number) => void;
  setConnectionStatus: (s: BeamConnectionStatus) => void;
  closeEventSource: () => void;
  openEventSource: () => void;
  pollRoom: (g: number) => Promise<void>;
  scheduleReconnect: (g: number) => void;
  handleRelayEvent: (raw: string, g?: number) => Promise<void>;
  extractRelayMessages: (p: Record<string, unknown>) => Promise<BeamMessage[]>;
  handleIncoming: (m: BeamMessage, t: BeamTransport) => Promise<void>;
  sendHandshake: () => void;
  setPeerConnected: (c: boolean, n?: string | null) => void;
  setPeerTransport: (t: BeamTransport | null) => void;
  setPeerDocument: (title: string | null | undefined, p: number | null | undefined, t: number | null | undefined) => void;
  createPeerConnection: () => RTCPeerConnection | null;
  closeRtc: () => void;
  scheduleRtcRetry: () => void;
  setupDataChannel: (ch: RTCDataChannel) => void;
  resetTransfer: () => void;
  resetPeer: () => void;
  initiateRtc: () => Promise<void>;
  handleRtcOffer: (m: BeamMessage) => Promise<void>;
  handleRtcAnswer: (m: BeamMessage) => Promise<void>;
  handleRtcIce: (m: BeamMessage) => Promise<void>;
  sendReady: (id: string) => void;
  sendPong: (id: string) => void;
  finishDisconnect: () => void;
  deliverDocument: (m: BeamMessage, t: BeamTransport) => Promise<void>;
  updateTransfer: (p: Partial<BeamTransferState>) => void;
  broadcast: (m: BeamMessage) => Promise<void>;
  notifyListeners: (m: BeamMessage, t: BeamTransport) => void;
  completions: BeamCompletionTracker;
  handleDataChannelPayload: (d: unknown) => Promise<void>;
  finishIncomingFile: (id: string) => Promise<void>;
  beginIncomingFile: (m: Parameters<BeamWebRtcHost['beginIncomingFile']>[0]) => void;
  sendDataChannelControl: (m: Record<string, unknown>) => void;
}

export function createBeamSignalingHost(ctx: BeamServiceAdapterContext): BeamSignalingHost {
  return {
    state: ctx.sigState,
    setConnectionStatus: ctx.setConnectionStatus,
    closeEventSource: ctx.closeEventSource,
    openEventSource: ctx.openEventSource,
    pollRoom: ctx.pollRoom,
    scheduleReconnect: ctx.scheduleReconnect,
    handleRelayEvent: ctx.handleRelayEvent,
    extractRelayMessages: ctx.extractRelayMessages,
    handleIncoming: ctx.handleIncoming,
    sendHandshake: ctx.sendHandshake,
  };
}

export function createBeamProtocolHost(ctx: BeamServiceAdapterContext): BeamProtocolHost {
  return {
    getSessionId: () => ctx.sigState.sessionId,
    getPeerSessionId: ctx.getPeerSessionId,
    setPeerSessionId: ctx.setPeerSessionId,
    isPeerConnected: () => ctx.getPeerState().connected,
    hasClosedSession: ctx.hasClosedSession,
    markSessionClosed: ctx.markSessionClosed,
    isCurrentSession: ctx.isCurrentSession,
    isChannelOpen: () => ctx.rtcState.rtcDataChannel?.readyState === 'open',
    setLastPeerSeen: ctx.setLastPeerSeen,
    setPeerConnected: ctx.setPeerConnected,
    setPeerTransport: ctx.setPeerTransport,
    setPeerDocument: ctx.setPeerDocument,
    closeRtc: ctx.closeRtc,
    resetTransfer: ctx.resetTransfer,
    resetPeer: ctx.resetPeer,
    resetRtcAttempt: () => { ctx.rtcState.rtcAttempt = 0; },
    hasRtcPeer: () => Boolean(ctx.rtcState.rtcPeer),
    initiateRtc: ctx.initiateRtc,
    handleRtcOffer: ctx.handleRtcOffer,
    handleRtcAnswer: ctx.handleRtcAnswer,
    handleRtcIce: ctx.handleRtcIce,
    sendReady: ctx.sendReady,
    sendPong: ctx.sendPong,
    finishDisconnect: ctx.finishDisconnect,
    deliverDocument: ctx.deliverDocument,
    updateTransfer: ctx.updateTransfer,
    broadcast: ctx.broadcast,
    notifyListeners: ctx.notifyListeners,
    handleFileCompletion: (id, ok, msg) => ctx.completions.handle(id, ok, msg),
  };
}

export function createBeamWebRtcHost(ctx: BeamServiceAdapterContext): BeamWebRtcHost {
  return {
    state: ctx.rtcState,
    getRole: () => ctx.sigState.role,
    getConnectedRoom: () => ctx.sigState.connectedRoom,
    getSessionId: () => ctx.sigState.sessionId,
    getPeerSessionId: ctx.getPeerSessionId,
    getDeviceId: ctx.getDeviceId,
    isPeerConnected: () => ctx.getPeerState().connected,
    createPeerConnection: ctx.createPeerConnection,
    closeRtc: ctx.closeRtc,
    scheduleRtcRetry: ctx.scheduleRtcRetry,
    setupDataChannel: ctx.setupDataChannel,
    broadcast: ctx.broadcast,
    setPeerTransport: ctx.setPeerTransport,
    updateTransfer: ctx.updateTransfer,
    handleIncoming: ctx.handleIncoming,
    deliverDocument: ctx.deliverDocument,
    handleFileCompletion: (id, ok, msg) => ctx.completions.handle(id, ok, msg),
    resolveFileCompletion: (err) => ctx.completions.resolve(err),
    registerCompletion: (id, ms, msg) => ctx.completions.register(id, ms, msg),
    getFileCompletionId: () => ctx.completions.completionId,
    handleDataChannelPayload: ctx.handleDataChannelPayload,
    finishIncomingFile: ctx.finishIncomingFile,
    beginIncomingFile: ctx.beginIncomingFile,
    sendDataChannelControl: ctx.sendDataChannelControl,
  };
}

export function createEmptyPeerState(): BeamPeerState {
  return { ...EMPTY_PEER };
}

export function createEmptyTransferState(): BeamTransferState {
  return { ...EMPTY_TRANSFER };
}
