import type { BeamMessage, BeamPeerState, BeamTransferState, BeamTransport } from '../types';
import {
  MAX_FILE_BYTES, RTC_MAX_ATTEMPTS, RTC_RETRY_MS, SSE_SINCE,
  formatRoomCode, randomId, saveRecentRoom,
  type BeamConnectionStatus, type BeamLaunchParams, type BeamLaunchRole,
  type BeamSendErrorCode, type IncomingFileState,
  type LocalDocState, type SendDocumentOptions,
} from './beamUtils';
import { attachBeamLocalTransports, deliverBeamDocumentToListeners, dispatchBeamMessage, rememberBeamMessage } from './beamSessionFrames';
import { BeamCompletionTracker, BeamObserverHub, createEmptyPeerState, createEmptyTransferState } from './beamServiceHosts';
import { BeamDocumentDeliveries } from './beamDocumentDeliveries';
import type { BeamDocumentAttempt } from './beamDocumentCheckpoint';
import { BeamLanTransport, lanRoomCode, type BeamDirectChannel, type LanInvitation, type LanTarget } from './beamLanTransport';
import {
  buildBeamHostFactories, buildBeamStateAnnounceMessage, computePeerConnectedState,
  computePeerDocumentState, runBeamRelayUpload, sendBeamProtocolFrame, startBeamMaintenanceLoop,
} from './beamServiceHelpers';
import {
  downloadChunksViaRelay, extractMessagesFromRelayEvent, fetchRelayAttachmentBuffer,
  fetchRelayAttachmentText, publishRelayMessage, putRelayAttachment, type RelayAttachmentPayload,
} from './beamRelayTransport';
import { dispatchReceiverBeamMessage, dispatchSenderBeamMessage } from './beamProtocolHandlers';
import {
  clearBeamFileCheckpoint, closeBeamRtcPeer, createBeamPeerConnection, finishBeamIncomingFile, handleBeamRtcIce,
  handleBeamRtcOffer, initiateBeamRtc, processDataChannelPayload, sendFileOverBeamChannel,
  type BeamWebRtcState,
} from './beamWebRtcTransport';
import {
  closeBeamEventSource, executeBeamSendDocument, openBeamEventSource, pollBeamRoom,
  processBeamRelayEvent, waitForOpenBeamDataChannel, waitUntilBeamPeerConnected, type BeamSignalingState,
} from './beamSignalingTransport';

export type { BeamConnectionStatus, BeamLaunchRole, BeamLaunchParams, BeamSendErrorCode, SendDocumentOptions };

export {
  BeamSendError, generateRoomCode, getPersistentReceiverRoomCode, generateNewReceiverRoomCode,
  formatRoomCode, parseBeamLaunch, buildBeamLink, arrayBufferToBase64, base64ToArrayBuffer,
  computeSha256, looksLikePdfBuffer, mergeArrayBuffers, getRecentRooms, saveRecentRoom,
} from './beamUtils';

/** Coordinates local-tab BroadcastChannel, cloud relay SSE/polling, and WebRTC P2P Beam sessions. */
export class BeamService {
  private broadcastChannel: BroadcastChannel | null = null;
  private lan: BeamLanTransport | null = null;
  private lanSenderTarget: LanTarget | null = null;
  private lanInvitation: LanInvitation | null = null;
  private readonly observers = new BeamObserverHub();
  private readonly completions = new BeamCompletionTracker();
  private readonly documentDeliveries = new BeamDocumentDeliveries();
  private sigState: BeamSignalingState = {
    activeEventSource: null, activeRoomCode: null, connectedRoom: null, role: null,
    connectionStatus: 'disconnected', sessionId: null, relayCursor: SSE_SINCE,
    pollingGeneration: null, reconnectAttempt: 0, sourceGeneration: 0,
    reconnectTimer: null, connectionTimer: null, pollTimer: null,
  };
  private readonly deviceId = randomId('d');
  private peerSessionId: string | null = null;
  private closedSessions = new Set<string>();
  private localDoc: LocalDocState = { title: null, page: 1, total: 0 };
  private peerState: BeamPeerState = createEmptyPeerState();
  private transferState: BeamTransferState = createEmptyTransferState();
  private rtcState: BeamWebRtcState = {
    isRtcSupported: typeof RTCPeerConnection !== 'undefined', rtcPeer: null,
    rtcDataChannel: null, remoteDescriptionSet: false, queuedIce: [],
    rtcAttempt: 0, lastOfferSdp: null, incomingFile: null,
  };
  private rtcRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private maintenanceTimer: number | null = null;
  private lastPeerSeen = 0;
  private lastPingAt = 0;
  private seenMessages = new Map<string, number>();
  private lastPageBroadcast = { page: 0, at: 0 };
  private sendingDocument = false;
  private readonly hosts = buildBeamHostFactories({
    sigState: this.sigState, rtcState: this.rtcState, observers: this.observers,
    completions: this.completions, closedSessions: this.closedSessions,
    getDeviceId: () => this.deviceId, getPeerState: () => this.peerState,
    getPeerSessionId: () => this.peerSessionId, setPeerSessionId: (id) => this.setPeerSession(id),
    isCurrentSession: (id) => this.isCurrentSession(id), setLastPeerSeen: (ts) => { this.lastPeerSeen = ts; },
    setConnectionStatus: (s) => this.setConnectionStatus(s),
    closeEventSource: () => this.closeEventSource(), openEventSource: () => this.openEventSource(),
    pollRoom: (g) => this.pollRoom(g), handleRelayEvent: (raw, g) => this.handleRelayEvent(raw, g),
    extractRelayMessages: (p) => this.extractRelayMessages(p as RelayAttachmentPayload),
    handleIncoming: (m, t) => this.handleIncoming(m, t), sendFrame: (k, id) => this.sendFrame(k, id),
    setPeerConnected: (c, n) => this.setPeerConnected(c, n), setPeerTransport: (t) => this.setPeerTransport(t),
    setPeerDocument: (title, p, t) => this.setPeerDocument(title, p, t),
    createPeerConnection: () => this.createPeerConnection(), closeRtc: () => this.closeRtc(),
    scheduleRtcRetry: () => this.scheduleRtcRetry(), resetTransfer: () => this.resetTransfer(),
    resetPeer: () => this.resetPeer(), initiateRtc: () => this.initiateRtc(),
    handleRtcOffer: (m) => this.handleRtcOffer(m), handleRtcIce: (m) => this.handleRtcIce(m),
    finishDisconnect: () => this.finishDisconnect(), deliverDocument: (m, t) => this.deliverDocument(m, t),
    updateTransfer: (p) => this.updateTransfer(p), broadcast: (m) => this.broadcast(m),
    handleDataChannelPayload: (d) => this.handleDataChannelPayload(d),
    finishIncomingFile: (id) => this.finishIncomingFile(id),
  });

  private get activeRoomCode(): string | null { return this.sigState.activeRoomCode; }
  private set activeRoomCode(v: string | null) { this.sigState.activeRoomCode = v; }
  private get connectedRoom(): string | null { return this.sigState.connectedRoom; }
  private set connectedRoom(v: string | null) { this.sigState.connectedRoom = v; }
  private get role(): 'receiver' | 'sender' | null { return this.sigState.role; }
  private set role(v: 'receiver' | 'sender' | null) { this.sigState.role = v; }
  private get sessionId(): string | null { return this.sigState.sessionId; }
  private set sessionId(v: string | null) { this.sigState.sessionId = v; }
  private get sourceGeneration(): number { return this.sigState.sourceGeneration; }
  private get isRtcSupported(): boolean { return this.rtcState.isRtcSupported; }
  private set isRtcSupported(v: boolean) { this.rtcState.isRtcSupported = v; }
  private get rtcPeer(): RTCPeerConnection | null { return this.rtcState.rtcPeer; }
  private get rtcDataChannel(): BeamDirectChannel | null { return this.rtcState.rtcDataChannel; }
  private set rtcDataChannel(v: BeamDirectChannel | null) { this.rtcState.rtcDataChannel = v; }
  /** @internal White-box accessors used by unit tests. */
  public get fileCompletionId(): string | null { return this.completions.completionId; }
  public get incomingFile(): IncomingFileState | null { return this.rtcState.incomingFile; }
  public set incomingFile(v: IncomingFileState | null) { this.rtcState.incomingFile = v; }

  constructor() {
    this.broadcastChannel = attachBeamLocalTransports({
      onIncoming: (msg, transport) => { void this.handleIncoming(msg, transport); },
      onOnline: () => this.retryCloudConnection(),
      onOffline: () => { if (this.connectedRoom && !this.lan) this.setConnectionStatus('connecting'); },
    });
  }

  public getDeviceId(): string { return this.deviceId; }
  public isOwnMessage(msg: BeamMessage): boolean { return Boolean(msg.origin && msg.origin === this.deviceId); }
  public normalizeRoom(code: string): string { return code.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase(); }
  public isMatchingRoom(a: string, b: string): boolean {
    const cleanA = this.normalizeRoom(a);
    return cleanA.length > 0 && cleanA === this.normalizeRoom(b);
  }
  public getConnectedRoom(): string | null { return this.connectedRoom; }
  public getRole(): 'receiver' | 'sender' | null { return this.role; }
  public getConnectionStatus(): BeamConnectionStatus { return this.sigState.connectionStatus; }
  public getPeerState(): BeamPeerState { return { ...this.peerState }; }
  public getTransferState(): BeamTransferState { return { ...this.transferState }; }
  public getLocalDocumentState(): LocalDocState { return { ...this.localDoc }; }
  public isLanSession(): boolean { return this.lan !== null; }

  public retryCloudConnection(): void {
    if (this.lan || !this.connectedRoom || !this.activeRoomCode || !this.role) return;
    this.sigState.reconnectAttempt = 0;
    this.closeEventSource();
    this.setConnectionStatus('connecting');
    this.openEventSource();
    if (this.role === 'sender') this.sendFrame('handshake');
  }

  public startReceiver(roomCode: string, force = false): void { this.startSession('receiver', roomCode, force); }
  public startSender(roomCode: string, force = false): void {
    if (!force && this.lan && this.role === 'sender' && this.connectedRoom === roomCode) {
      this.sendFrame('handshake');
      return;
    }
    this.startSession('sender', roomCode, force);
    if (formatRoomCode(roomCode)) this.sendFrame('handshake');
  }

  private startSession(role: 'receiver' | 'sender', roomCode: string, force: boolean, lan?: BeamLanTransport): void {
    const formatted = formatRoomCode(roomCode);
    if (!formatted) return;
    if (!lan) saveRecentRoom(formatted);
    if (!force && !this.lan && this.connectedRoom === formatted && this.role === role) {
      if (this.sigState.connectionStatus !== 'connected') this.openEventSource();
      return;
    }
    if (this.lan !== lan) this.lan?.stop();
    this.lan = lan ?? null;
    this.lanSenderTarget = null;
    this.lanInvitation = null;
    this.closeRtc();
    this.closeEventSource();
    this.stopMaintenance();
    this.resetTransfer();
    this.resetPeer();
    this.connectedRoom = formatted;
    this.role = role;
    this.sessionId = role === 'sender' ? randomId('s') : null;
    this.setPeerSession(null); this.sigState.documentCheckpoint = undefined;
    this.closedSessions.clear();
    this.lastPeerSeen = 0;
    this.sigState.reconnectAttempt = 0;
    this.sigState.relayCursor = SSE_SINCE;
    this.seenMessages.clear();
    this.observers.notifyState(this.connectedRoom, this.role);
    this.setConnectionStatus('connecting');
    this.activeRoomCode = formatted;
    if (!lan) this.openEventSource();
    this.startMaintenance();
  }

  public async startLanReceiver(isCurrent: () => boolean) {
    const lan = this.createLanTransport();
    try {
      const invitation = await lan.listen();
      if (!isCurrent()) { lan.stop(); return null; }
      this.startSession('receiver', lanRoomCode(invitation.key), true, lan);
      this.lanInvitation = invitation;
      this.setConnectionStatus('connected');
      return invitation;
    } catch (error) {
      lan.stop();
      throw error;
    }
  }

  public async startLanSender(target: LanTarget): Promise<void> {
    const code = lanRoomCode(target.key);
    const lan = this.createLanTransport();
    this.startSession('sender', code, true, lan);
    this.lanSenderTarget = target;
    try {
      await lan.connect(target);
      if (this.lan !== lan) throw new Error('The LAN session was replaced.');
    } catch (error) {
      if (this.lan === lan) this.finishDisconnect();
      throw error;
    }
  }

  public getLanSenderTarget(): LanTarget | null { return this.lanSenderTarget; }
  public getLanInvitation(): LanInvitation | null { return this.lanInvitation; }

  private createLanTransport(): BeamLanTransport {
    const lan = new BeamLanTransport(channel => {
      if (this.lan !== lan) return;
      if (channel) {
        this.rtcDataChannel = channel;
        this.setConnectionStatus('connected');
        if (this.role === 'sender') this.sendFrame('handshake');
        return;
      }
      this.closeRtc();
      this.resetPeer();
      if (this.role === 'sender') this.setConnectionStatus('error');
      else {
        this.setPeerSession(null);
        this.resetTransfer();
      }
    }, data => {
      if (this.lan === lan) void this.handleDataChannelPayload(data);
    });
    return lan;
  }

  public disconnect(): void { this.sendFrame('disconnect'); this.finishDisconnect(); }
  public onConnectionStatusChange(cb: (status: BeamConnectionStatus) => void): () => void {
    return this.observers.addObserver(this.observers.statusListeners, cb, () => cb(this.sigState.connectionStatus));
  }
  public onStateChange(cb: (state: { room: string | null; role: 'receiver' | 'sender' | null }) => void): () => void {
    return this.observers.addObserver(this.observers.stateListeners, cb, () => cb({ room: this.connectedRoom, role: this.role }));
  }
  public onPeerChange(cb: (state: BeamPeerState) => void): () => void {
    return this.observers.addObserver(this.observers.peerListeners, cb, () => cb({ ...this.peerState }));
  }
  public onTransferProgress(cb: (state: BeamTransferState) => void): () => void {
    return this.observers.addObserver(this.observers.transferListeners, cb, () => cb({ ...this.transferState }));
  }
  public subscribe(cb: (msg: BeamMessage, transport: BeamTransport) => void | Promise<void>): () => void {
    return this.observers.addObserver(this.observers.listeners, cb);
  }

  public isReceivingSession(room: string | null, sessionId?: string): boolean {
    return this.role === 'receiver' && this.connectedRoom === room && this.isCurrentSession(sessionId);
  }

  public setLocalDocumentState(docTitle: string, currentPage: number, totalPages: number): void {
    this.localDoc = { title: docTitle || null, page: currentPage || 1, total: totalPages || 0 };
    if (this.role === 'receiver' && this.connectedRoom && this.peerSessionId) {
      this.announceState(docTitle, currentPage, totalPages);
    }
  }

  public broadcastPageChange(pageNumber: number): void {
    if (!this.connectedRoom || this.role !== 'sender' || !this.sessionId || !this.peerSessionId) return;
    const page = Math.max(1, Math.round(pageNumber));
    const now = Date.now();
    if (this.lastPageBroadcast.page === page && now - this.lastPageBroadcast.at < 600) return;
    this.lastPageBroadcast = { page, at: now };
    void this.broadcast({ type: 'BEAM_PAGE_CHANGE', roomCode: this.connectedRoom, sessionId: this.sessionId, pageNumber: page, timestamp: now });
  }

  private sendSenderCommand(type: 'BEAM_STEP' | 'BEAM_VIEW_MODE' | 'BEAM_QUERY_STATE', patch: Partial<BeamMessage>, roomOverride?: string): void {
    const room = roomOverride || this.connectedRoom;
    if (!room || this.role !== 'sender' || !this.sessionId) return;
    void this.broadcast({ type, roomCode: room, sessionId: this.sessionId, timestamp: Date.now(), ...patch });
  }

  public sendStep(direction: 'next' | 'prev'): void { this.sendSenderCommand('BEAM_STEP', { direction }); }
  public sendViewMode(viewMode: 'continuous' | 'dual' | 'single'): void { this.sendSenderCommand('BEAM_VIEW_MODE', { viewMode }); }
  public queryReceiverState(roomCode?: string): void { this.sendSenderCommand('BEAM_QUERY_STATE', {}, roomCode); }

  public announceState(docTitle?: string | null, pageNumber?: number, totalPages?: number): void {
    if (!this.connectedRoom || (this.role === 'receiver' && !this.peerSessionId)) return;
    void this.broadcast(buildBeamStateAnnounceMessage({
      connectedRoom: this.connectedRoom, role: this.role, sessionId: this.sessionId,
      peerSessionId: this.peerSessionId, localDoc: this.localDoc, docTitle, pageNumber, totalPages,
    }));
  }

  public async sendDocument(options: SendDocumentOptions): Promise<{ mode: BeamTransport }> {
    return executeBeamSendDocument({
      sigState: this.sigState, isSendingDocument: () => this.sendingDocument, setSendingDocument: (v) => { this.sendingDocument = v; },
      startSender: (r, f) => this.startSender(r, f), isRtcSupported: () => this.isRtcSupported || Boolean(this.lan),
      isLan: () => Boolean(this.lan),
      updateTransfer: (p) => this.updateTransfer(p), waitForPeer: (ms) => this.waitForPeer(ms),
      waitForDataChannel: (ms) => this.waitForDataChannel(ms),
      sendFileOverDataChannel: (o) => this.sendFileOverDataChannel(o), sendFileOverRelay: (o) => this.sendFileOverRelay(o),
    }, options);
  }

  public async downloadRelayChunks(chunks: string[], expectedSize?: number, expectedSha256?: string): Promise<ArrayBuffer> {
    return downloadChunksViaRelay({ chunks, expectedSize, expectedSha256, fetchChunk: fetchRelayAttachmentBuffer, onTransferPatch: (p) => this.updateTransfer(p) });
  }
  public async downloadRelayDocument(url: string): Promise<ArrayBuffer> { return fetchRelayAttachmentBuffer(url, MAX_FILE_BYTES); }

  public async broadcast(message: BeamMessage): Promise<void> {
    await dispatchBeamMessage({
      sessionId: this.connectedRoom && this.isMatchingRoom(message.roomCode, this.connectedRoom) ? (this.sessionId || this.peerSessionId || undefined) : undefined,
      message, deviceId: this.deviceId, dataChannel: this.rtcDataChannel, broadcastChannel: this.broadcastChannel,
      lanOnly: Boolean(this.lan),
      seenMessages: this.seenMessages, publishRelay: (msg) => this.publishMessage(msg),
    });
  }

  private async publishMessage(message: BeamMessage): Promise<boolean> {
    return publishRelayMessage({
      connectedRoom: this.connectedRoom, deviceId: this.deviceId, message,
      onPublishFailed: () => { if (!this.sigState.activeEventSource) this.setConnectionStatus('connecting'); },
    });
  }

  private setConnectionStatus(status: BeamConnectionStatus): void {
    if (this.sigState.connectionStatus === status) return;
    this.sigState.connectionStatus = status;
    this.observers.notifyStatus(status);
  }
  private updateTransfer(patch: Partial<BeamTransferState>): void {
    this.transferState = { ...this.transferState, ...patch };
    this.observers.notifyTransfer(this.transferState);
  }
  private resetTransfer(): void {
    this.completions.resolve(new Error('Transfer cancelled.'));
    this.transferState = createEmptyTransferState();
    this.observers.notifyTransfer(this.transferState);
  }
  private resetPeer(): void { this.peerState = createEmptyPeerState(); this.observers.notifyPeer(this.peerState); }

  private setPeerConnected(connected: boolean, peerName?: string | null): void {
    const { next, changed } = computePeerConnectedState(this.peerState, connected, peerName, this.rtcDataChannel?.readyState === 'open');
    this.peerState = next;
    if (changed) this.observers.notifyPeer(this.peerState);
  }
  private setPeerTransport(transport: BeamTransport | null): void {
    if (this.peerState.transport === transport) return;
    this.peerState = { ...this.peerState, transport };
    this.observers.notifyPeer(this.peerState);
  }
  private setPeerDocument(docTitle: string | null | undefined, pageNumber: number | null | undefined, totalPages: number | null | undefined): void {
    this.peerState = computePeerDocumentState(this.peerState, docTitle, pageNumber, totalPages);
    this.observers.notifyPeer(this.peerState);
  }

  private openEventSource(): void { openBeamEventSource(this.hosts.signalingHost()); }
  private closeEventSource(): void { closeBeamEventSource(this.sigState); }

  private sendFrame(kind: 'handshake' | 'ping' | 'ready' | 'pong' | 'disconnect', explicitSessionId?: string): void {
    sendBeamProtocolFrame(kind, {
      connectedRoom: this.connectedRoom, role: this.role, sessionId: this.sessionId,
      peerSessionId: this.peerSessionId, localDoc: this.localDoc,
      setLastPingAt: (ts) => { this.lastPingAt = ts; }, broadcast: (msg) => this.broadcast(msg),
    }, explicitSessionId);
  }

  private startMaintenance(): void {
    this.stopMaintenance();
    this.maintenanceTimer = startBeamMaintenanceLoop({
      sigState: this.sigState, isPeerConnected: () => this.peerState.connected,
      getLastPeerSeen: () => this.lastPeerSeen, getLastPingAt: () => this.lastPingAt,
      closeRtc: () => { if (!this.lan) this.closeRtc(); },
      resetPeer: () => this.resetPeer(), sendHandshake: () => this.sendFrame('handshake'), sendPing: () => this.sendFrame('ping'),
    });
  }
  private stopMaintenance(): void {
    if (this.maintenanceTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = null;
    }
  }

  private finishDisconnect(): void {
    this.lan?.stop();
    this.lan = null;
    this.lanSenderTarget = null;
    this.lanInvitation = null;
    this.closeRtc(); this.closeEventSource(); this.stopMaintenance(); this.resetTransfer(); this.resetPeer();
    this.activeRoomCode = null; this.connectedRoom = null; this.role = null; this.sessionId = null;
    this.setPeerSession(null); this.sigState.documentCheckpoint = undefined;
    this.setConnectionStatus('disconnected');
    this.observers.notifyState(this.connectedRoom, this.role);
  }

  private async handleIncoming(message: BeamMessage, transport: BeamTransport): Promise<void> {
    if (!message || !message.roomCode || !this.connectedRoom) return;
    if (this.lan && (transport !== 'p2p' || message.type.startsWith('BEAM_RTC_') || message.type === 'BEAM_PAYLOAD')) return;
    if (!this.isMatchingRoom(message.roomCode, this.connectedRoom) || this.isOwnMessage(message)) return;
    if (!rememberBeamMessage(this.seenMessages, message)) return;
    if (this.role === 'receiver') await dispatchReceiverBeamMessage(this.hosts.protocolHost(), message, transport);
    else if (this.role === 'sender') await dispatchSenderBeamMessage(this.hosts.protocolHost(), message, transport);
  }

  private isCurrentSession(sessionId?: string): boolean {
    if (this.role === 'receiver') return Boolean(sessionId && this.peerSessionId && sessionId === this.peerSessionId);
    return Boolean(sessionId && this.sessionId && sessionId === this.sessionId);
  }
  private setPeerSession(id: string | null): void {
    if (this.peerSessionId !== id || !id) clearBeamFileCheckpoint(this.rtcState);
    this.peerSessionId = id;
  }
  private async deliverDocument(message: BeamMessage, transport: BeamTransport): Promise<void> {
    await this.documentDeliveries.deliver(message, () => {
      if (!this.isCurrentSession(message.sessionId)) throw new Error('The receiving session was cancelled.');
      if (transport !== 'p2p') this.resetTransfer();
      return deliverBeamDocumentToListeners(this.observers.listeners, (id) => this.isCurrentSession(id), (msg, via) => this.observers.notifyMessage(msg, via), message, transport);
    });
  }

  private closeRtc(): void {
    if (this.rtcRetryTimer !== null) { clearTimeout(this.rtcRetryTimer); this.rtcRetryTimer = null; }
    closeBeamRtcPeer(this.rtcState);
  }
  private scheduleRtcRetry(): void {
    if (this.role !== 'sender' || !this.connectedRoom || !this.peerSessionId) return;
    if (this.rtcState.rtcAttempt >= RTC_MAX_ATTEMPTS || this.rtcRetryTimer !== null) return;
    this.rtcRetryTimer = setTimeout(() => {
      this.rtcRetryTimer = null;
      if (this.role === 'sender' && this.connectedRoom && this.peerSessionId) void this.initiateRtc();
    }, RTC_RETRY_MS);
  }

  private initiateRtc(): Promise<void> {
    return this.lan ? Promise.resolve() : initiateBeamRtc(this.hosts.rtcHost());
  }
  private createPeerConnection(): RTCPeerConnection | null { return createBeamPeerConnection(this.hosts.rtcHost()); }
  private handleRtcOffer(m: BeamMessage): Promise<void> { return handleBeamRtcOffer(this.hosts.rtcHost(), m); }
  private handleRtcIce(m: BeamMessage): Promise<void> { return handleBeamRtcIce(this.rtcState, m); }
  private handleDataChannelPayload(d: unknown): Promise<void> { return processDataChannelPayload(this.hosts.rtcHost(), d); }
  private finishIncomingFile(id: string): Promise<void> { return finishBeamIncomingFile(this.hosts.rtcHost(), id); }
  private sendFileOverDataChannel(o: BeamDocumentAttempt): Promise<void> { return sendFileOverBeamChannel(this.hosts.rtcHost(), o); }
  /** @internal White-box helper used by unit tests. */
  public handleFileCompletion(id: string, ok: boolean, message?: string): void { this.completions.handle(id, ok, message); }
  private waitForPeer(ms: number): Promise<boolean> { return waitUntilBeamPeerConnected(() => this.peerState.connected, () => this.connectedRoom, ms); }
  private pollRoom(g: number): Promise<void> { return pollBeamRoom(this.hosts.signalingHost(), g); }
  private handleRelayEvent(raw: string, g = this.sourceGeneration): Promise<void> { return processBeamRelayEvent(this.hosts.signalingHost(), raw, g); }
  private extractRelayMessages(p: RelayAttachmentPayload): Promise<BeamMessage[]> {
    return extractMessagesFromRelayEvent(p, {
      role: this.role, peerSessionId: this.peerSessionId, connectedRoom: this.connectedRoom, fetchText: fetchRelayAttachmentText,
    });
  }
  private putAttachment(topic: string, data: ArrayBuffer, filename: string): Promise<string> { return putRelayAttachment(topic, data, filename); }

  private async waitForDataChannel(timeoutMs: number): Promise<BeamDirectChannel | null> {
    return waitForOpenBeamDataChannel({
      getDataChannel: () => this.rtcDataChannel, getConnectedRoom: () => this.connectedRoom,
      getRole: () => this.role, hasRtcPeer: () => Boolean(this.rtcPeer),
      isPeerConnected: () => this.peerState.connected, initiateRtc: () => this.initiateRtc(), timeoutMs,
    });
  }
  private async sendFileOverRelay(options: BeamDocumentAttempt): Promise<void> {
    await runBeamRelayUpload({
      sigState: this.sigState, options,
      putChunk: (topic, data, filename) => this.putAttachment(topic, data, filename),
      updateTransfer: (patch) => this.updateTransfer(patch),
      registerCompletion: (id, ms, msg) => this.completions.register(id, ms, msg),
      broadcast: (msg) => this.broadcast(msg),
    });
  }
}

export const beamService = new BeamService();
