import type { BeamMessage, BeamPeerState, BeamTransferState, BeamTransport } from '../types';
import type { BeamDirectChannel } from './beamLanTransport';
import {
  buildBeamDisconnectMessage,
  buildBeamHandshakeMessage,
  buildBeamPingMessage,
  buildBeamPongMessage,
  buildBeamReadyMessage,
  startBeamMaintenanceLoop,
} from './beamSessionFrames';
import {
  BeamSendError,
  getDeviceLabel,
  type LocalDocState,
} from './beamUtils';
import type { BeamDocumentAttempt } from './beamDocumentCheckpoint';
import { scheduleBeamReconnect, type BeamSignalingHost, type BeamSignalingState } from './beamSignalingTransport';
import { uploadAndBroadcastViaRelay } from './beamRelayTransport';
import {
  beginBeamIncomingFile,
  bindBeamDataChannel,
  handleBeamRtcAnswer,
  type BeamWebRtcHost,
  type BeamWebRtcState,
} from './beamWebRtcTransport';
import {
  BeamCompletionTracker,
  BeamObserverHub,
  createBeamProtocolHost,
  createBeamSignalingHost,
  createBeamWebRtcHost,
  type BeamServiceAdapterContext,
} from './beamServiceHosts';
import type { BeamProtocolHost } from './beamProtocolHandlers';

export function computePeerConnectedState(
  current: BeamPeerState,
  connected: boolean,
  peerName: string | null | undefined,
  channelOpen: boolean
): { next: BeamPeerState; changed: boolean } {
  const changed = current.connected !== connected || (peerName !== undefined && current.peerName !== peerName);
  const next: BeamPeerState = {
    ...current,
    connected,
    peerName: peerName !== undefined ? peerName : current.peerName,
    transport: connected ? current.transport || (channelOpen ? 'p2p' : 'relay') : null,
  };
  return { next, changed };
}

export function computePeerDocumentState(
  current: BeamPeerState,
  docTitle: string | null | undefined,
  pageNumber: number | null | undefined,
  totalPages: number | null | undefined
): BeamPeerState {
  return {
    ...current,
    docTitle: docTitle !== undefined ? docTitle : current.docTitle,
    pageNumber: pageNumber !== undefined ? pageNumber : current.pageNumber,
    totalPages: totalPages !== undefined ? totalPages : current.totalPages,
  };
}

export function markClosedSessionBounded(closedSessions: Set<string>, id: string): void {
  closedSessions.add(id);
  if (closedSessions.size > 40) {
    const oldest = closedSessions.values().next().value;
    if (oldest !== undefined) closedSessions.delete(oldest);
  }
}

export function sendDataChannelJson(channel: BeamDirectChannel | null, message: Record<string, unknown>): void {
  if (channel?.readyState !== 'open') return;
  try {
    channel.send(JSON.stringify(message));
  } catch (err) {
    console.warn('[BeamService] Failed to send DataChannel control message:', err);
  }
}

export function sendBeamProtocolFrame(
  kind: 'handshake' | 'ping' | 'ready' | 'pong' | 'disconnect',
  ctx: {
    connectedRoom: string | null;
    role: 'receiver' | 'sender' | null;
    sessionId: string | null;
    peerSessionId: string | null;
    localDoc: LocalDocState;
    setLastPingAt: (ts: number) => void;
    broadcast: (msg: BeamMessage) => Promise<void>;
  },
  explicitSessionId?: string
): void {
  if (!ctx.connectedRoom) return;
  if (kind === 'handshake') {
    if (ctx.role !== 'sender' || !ctx.sessionId) return;
    void ctx.broadcast(buildBeamHandshakeMessage(ctx.connectedRoom, ctx.sessionId));
    return;
  }
  if (kind === 'ping') {
    if (ctx.role !== 'sender' || !ctx.sessionId) return;
    const now = Date.now();
    ctx.setLastPingAt(now);
    void ctx.broadcast(buildBeamPingMessage(ctx.connectedRoom, ctx.sessionId, now));
    return;
  }
  if (kind === 'ready') {
    if (ctx.role !== 'receiver' || !explicitSessionId) return;
    void ctx.broadcast(buildBeamReadyMessage(ctx.connectedRoom, explicitSessionId, ctx.localDoc));
    return;
  }
  if (kind === 'pong') {
    if (ctx.role !== 'receiver' || !explicitSessionId) return;
    void ctx.broadcast(buildBeamPongMessage(ctx.connectedRoom, explicitSessionId));
    return;
  }
  const session = ctx.role === 'sender' ? ctx.sessionId : ctx.peerSessionId;
  if (session) void ctx.broadcast(buildBeamDisconnectMessage(ctx.connectedRoom, session));
}

export function buildBeamStateAnnounceMessage(ctx: {
  connectedRoom: string;
  role: 'receiver' | 'sender' | null;
  sessionId: string | null;
  peerSessionId: string | null;
  localDoc: LocalDocState;
  docTitle?: string | null;
  pageNumber?: number;
  totalPages?: number;
}): BeamMessage {
  return {
    type: 'BEAM_STATE_ANNOUNCE',
    roomCode: ctx.connectedRoom,
    sessionId: ctx.role === 'receiver' ? ctx.peerSessionId || undefined : ctx.sessionId || undefined,
    receiverName: getDeviceLabel(),
    docTitle: (ctx.docTitle ?? ctx.localDoc.title ?? undefined) || undefined,
    pageNumber: ctx.pageNumber ?? ctx.localDoc.page ?? 1,
    totalPages: ctx.totalPages ?? ctx.localDoc.total ?? 1,
    timestamp: Date.now(),
  };
}

export async function runBeamRelayUpload(ctx: {
  sigState: BeamSignalingState;
  options: BeamDocumentAttempt;
  putChunk: (topic: string, data: ArrayBuffer, filename: string) => Promise<string>;
  updateTransfer: (patch: Partial<BeamTransferState>) => void;
  registerCompletion: (id: string, timeoutMs: number, timeoutMessage: string) => Promise<void>;
  broadcast: (msg: BeamMessage) => Promise<void>;
}): Promise<void> {
  const { sessionId: session, connectedRoom: room } = ctx.sigState;
  if (!room) throw new BeamSendError('transfer-failed', 'Transfer cancelled because no Beam room is active.');
  await uploadAndBroadcastViaRelay({
    connectedRoom: room,
    sessionId: session,
    options: ctx.options,
    assertActive: () => {
      if (ctx.sigState.role !== 'sender' || ctx.sigState.sessionId !== session || ctx.sigState.connectedRoom !== room) {
        throw new BeamSendError('transfer-failed', 'Transfer cancelled because the Beam session changed.');
      }
    },
    putChunk: ctx.putChunk,
    onTransferPatch: ctx.updateTransfer,
    registerCompletion: (transferId) =>
      ctx.registerCompletion(transferId, 60000, 'The receiver did not confirm opening the PDF.'),
    broadcastPayload: ctx.broadcast,
  });
}

export interface BeamServiceBridge {
  sigState: BeamSignalingState;
  rtcState: BeamWebRtcState;
  observers: BeamObserverHub;
  completions: BeamCompletionTracker;
  closedSessions: Set<string>;
  getDeviceId: () => string;
  getPeerState: () => BeamPeerState;
  getPeerSessionId: () => string | null;
  setPeerSessionId: (id: string | null) => void;
  isCurrentSession: (id?: string) => boolean;
  setLastPeerSeen: (ts: number) => void;
  setConnectionStatus: (s: BeamServiceAdapterContext['setConnectionStatus'] extends (x: infer S) => void ? S : never) => void;
  closeEventSource: () => void;
  openEventSource: () => void;
  pollRoom: (g: number) => Promise<void>;
  handleRelayEvent: (raw: string, g?: number) => Promise<void>;
  extractRelayMessages: (p: Record<string, unknown>) => Promise<BeamMessage[]>;
  handleIncoming: (m: BeamMessage, t: BeamTransport) => Promise<void>;
  sendFrame: (kind: 'handshake' | 'ping' | 'ready' | 'pong' | 'disconnect', explicitSessionId?: string) => void;
  setPeerConnected: (c: boolean, n?: string | null) => void;
  setPeerTransport: (t: BeamTransport | null) => void;
  setPeerDocument: (title: string | null | undefined, p: number | null | undefined, t: number | null | undefined) => void;
  createPeerConnection: () => RTCPeerConnection | null;
  closeRtc: () => void;
  scheduleRtcRetry: () => void;
  resetTransfer: () => void;
  resetPeer: () => void;
  initiateRtc: () => Promise<void>;
  handleRtcOffer: (m: BeamMessage) => Promise<void>;
  handleRtcIce: (m: BeamMessage) => Promise<void>;
  finishDisconnect: () => void;
  deliverDocument: (m: BeamMessage, t: BeamTransport) => Promise<void>;
  updateTransfer: (p: Partial<BeamTransferState>) => void;
  broadcast: (m: BeamMessage) => Promise<void>;
  handleDataChannelPayload: (d: unknown) => Promise<void>;
  finishIncomingFile: (id: string) => Promise<void>;
}

export function buildBeamHostFactories(bridge: BeamServiceBridge): {
  signalingHost: () => BeamSignalingHost;
  protocolHost: () => BeamProtocolHost;
  rtcHost: () => BeamWebRtcHost;
} {
  const ctx = (): BeamServiceAdapterContext => ({
    sigState: bridge.sigState,
    rtcState: bridge.rtcState,
    getDeviceId: bridge.getDeviceId,
    getPeerState: bridge.getPeerState,
    getPeerSessionId: bridge.getPeerSessionId,
    setPeerSessionId: bridge.setPeerSessionId,
    hasClosedSession: (id) => bridge.closedSessions.has(id),
    markSessionClosed: (id) => markClosedSessionBounded(bridge.closedSessions, id),
    isCurrentSession: bridge.isCurrentSession,
    setLastPeerSeen: bridge.setLastPeerSeen,
    setConnectionStatus: bridge.setConnectionStatus,
    closeEventSource: bridge.closeEventSource,
    openEventSource: bridge.openEventSource,
    pollRoom: bridge.pollRoom,
    scheduleReconnect: (g) => scheduleBeamReconnect(signalingHost(), g),
    handleRelayEvent: bridge.handleRelayEvent,
    extractRelayMessages: bridge.extractRelayMessages,
    handleIncoming: bridge.handleIncoming,
    sendHandshake: () => bridge.sendFrame('handshake'),
    setPeerConnected: bridge.setPeerConnected,
    setPeerTransport: bridge.setPeerTransport,
    setPeerDocument: bridge.setPeerDocument,
    createPeerConnection: bridge.createPeerConnection,
    closeRtc: bridge.closeRtc,
    scheduleRtcRetry: bridge.scheduleRtcRetry,
    setupDataChannel: (ch) => bindBeamDataChannel(rtcHost(), ch),
    resetTransfer: bridge.resetTransfer,
    resetPeer: bridge.resetPeer,
    initiateRtc: bridge.initiateRtc,
    handleRtcOffer: bridge.handleRtcOffer,
    handleRtcAnswer: (m) => handleBeamRtcAnswer(bridge.rtcState, m),
    handleRtcIce: bridge.handleRtcIce,
    sendReady: (id) => bridge.sendFrame('ready', id),
    sendPong: (id) => bridge.sendFrame('pong', id),
    finishDisconnect: bridge.finishDisconnect,
    deliverDocument: bridge.deliverDocument,
    updateTransfer: bridge.updateTransfer,
    broadcast: bridge.broadcast,
    notifyListeners: (m, t) => bridge.observers.notifyMessage(m, t),
    completions: bridge.completions,
    handleDataChannelPayload: bridge.handleDataChannelPayload,
    finishIncomingFile: bridge.finishIncomingFile,
    beginIncomingFile: (m) => beginBeamIncomingFile(rtcHost(), m),
    sendDataChannelControl: (m) => sendDataChannelJson(bridge.rtcState.rtcDataChannel, m),
  });
  const signalingHost = () => createBeamSignalingHost(ctx());
  const protocolHost = () => createBeamProtocolHost(ctx());
  const rtcHost = () => createBeamWebRtcHost(ctx());
  return { signalingHost, protocolHost, rtcHost };
}

export { startBeamMaintenanceLoop };
