import type { BeamMessage, BeamTransferState, BeamTransport } from '../types';
import type { ThemeMode } from '../../core/types';
import type { BeamDirectChannel } from './beamLanTransport';
import { tryBestEffort } from '../../core/utils/bestEffort';
import {
  ICE_SERVERS,
  type IncomingFileState,
} from './beamUtils';

export {
  beginBeamIncomingFile,
  finishBeamIncomingFile,
  processDataChannelPayload,
  sendFileOverBeamChannel,
} from './beamWebRtcTransfer';

export interface BeamWebRtcState {
  isRtcSupported: boolean;
  rtcPeer: RTCPeerConnection | null;
  rtcDataChannel: BeamDirectChannel | null;
  remoteDescriptionSet: boolean;
  queuedIce: RTCIceCandidateInit[];
  rtcAttempt: number;
  lastOfferSdp: string | null;
  incomingFile: IncomingFileState | null;
  incomingFileChannel?: BeamDirectChannel | null;
  openedFile?: Pick<IncomingFileState, 'transferId' | 'sessionId' | 'size' | 'sha256'>;
  acceptOffset?: (transferId: string, offset: number, complete: boolean) => void;
  interruptTransfer?: () => void;
}

export interface BeamWebRtcHost {
  state: BeamWebRtcState;
  getRole: () => 'receiver' | 'sender' | null;
  getConnectedRoom: () => string | null;
  getSessionId: () => string | null;
  getPeerSessionId: () => string | null;
  getDeviceId: () => string;
  isPeerConnected: () => boolean;
  createPeerConnection: () => RTCPeerConnection | null;
  closeRtc: () => void;
  scheduleRtcRetry: () => void;
  setupDataChannel: (channel: RTCDataChannel) => void;
  broadcast: (message: BeamMessage) => Promise<void>;
  setPeerTransport: (transport: BeamTransport | null) => void;
  updateTransfer: (patch: Partial<BeamTransferState>) => void;
  handleIncoming: (message: BeamMessage, transport: BeamTransport) => Promise<void>;
  deliverDocument: (message: BeamMessage, transport: BeamTransport) => Promise<void>;
  handleFileCompletion: (transferId: string, ok: boolean, message?: string) => void;
  resolveFileCompletion: (error: Error | null) => void;
  registerCompletion: (transferId: string, timeoutMs: number, timeoutMessage: string) => Promise<void>;
  getFileCompletionId: () => string | null;
  handleDataChannelPayload: (data: unknown) => Promise<void>;
  finishIncomingFile: (transferId: string) => Promise<void>;
  beginIncomingFile: (meta: {
    sessionId?: string;
    size?: number;
    offset?: number;
    transferId?: string;
    title?: string;
    name?: string;
    sha256?: string;
    pageNumber?: number;
    totalPages?: number;
    theme?: ThemeMode;
  }) => void;
  sendDataChannelControl: (message: Record<string, unknown>) => void;
}

export function clearBeamFileCheckpoint(state: BeamWebRtcState): void {
  state.incomingFile = null;
  state.openedFile = undefined;
  state.incomingFileChannel = null;
}

export function createBeamPeerConnection(host: BeamWebRtcHost): RTCPeerConnection | null {
  if (!host.state.isRtcSupported) return null;
  const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peer.onicecandidate = (event) => {
    if (peer !== host.state.rtcPeer || !event.candidate) return;
    const roomCode = host.getConnectedRoom();
    if (!roomCode) return;
    const sessionId = host.getRole() === 'sender' ? host.getSessionId() : host.getPeerSessionId();
    if (!sessionId) return;
    void host.broadcast({
      type: 'BEAM_RTC_ICE',
      roomCode,
      sessionId,
      candidate: event.candidate.toJSON(),
      timestamp: Date.now(),
    });
  };
  peer.onconnectionstatechange = () => {
    if (peer !== host.state.rtcPeer) return;
    if (peer.connectionState === 'connected') {
      host.setPeerTransport(host.state.rtcDataChannel?.readyState === 'open' ? 'p2p' : 'relay');
    } else if (peer.connectionState === 'failed') {
      host.setPeerTransport(host.isPeerConnected() ? 'relay' : null);
      host.scheduleRtcRetry();
    }
  };
  peer.oniceconnectionstatechange = () => {
    if (peer !== host.state.rtcPeer) return;
    if (peer.iceConnectionState === 'failed') {
      host.scheduleRtcRetry();
    }
  };
  return peer;
}

export async function initiateBeamRtc(host: BeamWebRtcHost): Promise<void> {
  const room = host.getConnectedRoom();
  const sessionId = host.getSessionId();
  if (!host.state.isRtcSupported || host.getRole() !== 'sender' || !room) return;
  if (!sessionId || !host.getPeerSessionId()) return;

  host.state.rtcAttempt += 1;
  host.closeRtc();

  try {
    const peer = host.createPeerConnection();
    if (!peer) return;
    host.state.rtcPeer = peer;
    host.state.remoteDescriptionSet = false;
    host.state.queuedIce = [];

    const channel = peer.createDataChannel('otium_p2p_channel', { ordered: true });
    host.setupDataChannel(channel);

    const offer = await peer.createOffer();
    if (peer !== host.state.rtcPeer) return;
    await peer.setLocalDescription(offer);
    if (peer !== host.state.rtcPeer || peer.signalingState === 'closed') return;
    const description = peer.localDescription || offer;

    await host.broadcast({
      type: 'BEAM_RTC_OFFER',
      roomCode: room,
      sessionId,
      sdp: { type: description.type, sdp: description.sdp },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.debug('WebRTC initiate note:', error);
    host.scheduleRtcRetry();
  }
}

export async function flushBeamQueuedIce(state: BeamWebRtcState): Promise<void> {
  if (!state.rtcPeer || !state.remoteDescriptionSet) return;
  const queued = state.queuedIce;
  state.queuedIce = [];
  for (const candidate of queued) {
    try {
      await state.rtcPeer.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.debug('WebRTC queued ice note:', error);
    }
  }
}

export async function handleBeamRtcOffer(host: BeamWebRtcHost, message: BeamMessage): Promise<void> {
  if (!host.state.isRtcSupported || !message.sdp || host.getRole() !== 'receiver') return;
  if (!message.sessionId || message.sessionId !== host.getPeerSessionId()) return;

  const sdp = message.sdp.sdp || '';
  if (host.state.rtcPeer && host.state.lastOfferSdp === sdp) return;
  host.state.lastOfferSdp = sdp;

  const earlyIce = host.state.queuedIce;
  host.closeRtc();
  host.state.queuedIce = earlyIce;
  host.state.lastOfferSdp = sdp;

  try {
    const peer = host.createPeerConnection();
    if (!peer) return;
    host.state.rtcPeer = peer;
    host.state.remoteDescriptionSet = false;

    peer.ondatachannel = (event) => {
      if (peer !== host.state.rtcPeer) return;
      host.setupDataChannel(event.channel);
    };

    await peer.setRemoteDescription(new RTCSessionDescription(message.sdp));
    if (peer !== host.state.rtcPeer) return;
    host.state.remoteDescriptionSet = true;
    await flushBeamQueuedIce(host.state);

    const answer = await peer.createAnswer();
    if (peer !== host.state.rtcPeer) return;
    await peer.setLocalDescription(answer);
    if (peer !== host.state.rtcPeer || peer.signalingState === 'closed') return;
    const description = peer.localDescription || answer;

    await host.broadcast({
      type: 'BEAM_RTC_ANSWER',
      roomCode: host.getConnectedRoom()!,
      sessionId: message.sessionId,
      sdp: { type: description.type, sdp: description.sdp },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.debug('WebRTC offer handle note:', error);
  }
}

export async function handleBeamRtcAnswer(state: BeamWebRtcState, message: BeamMessage): Promise<void> {
  if (!state.isRtcSupported || !state.rtcPeer || !message.sdp) return;
  try {
    if (state.rtcPeer.signalingState === 'have-local-offer') {
      await state.rtcPeer.setRemoteDescription(new RTCSessionDescription(message.sdp));
      state.remoteDescriptionSet = true;
      await flushBeamQueuedIce(state);
    }
  } catch (error) {
    console.debug('WebRTC answer handle note:', error);
  }
}

export async function handleBeamRtcIce(state: BeamWebRtcState, message: BeamMessage): Promise<void> {
  if (!state.isRtcSupported || !message.candidate) return;
  if (!state.rtcPeer || !state.remoteDescriptionSet) {
    if (state.queuedIce.length < 200) {
      state.queuedIce.push(message.candidate);
    }
    return;
  }
  try {
    await state.rtcPeer.addIceCandidate(new RTCIceCandidate(message.candidate));
  } catch (error) {
    console.debug('WebRTC ice candidate note:', error);
  }
}

export function bindBeamDataChannel(host: BeamWebRtcHost, channel: RTCDataChannel): void {
  if (host.state.rtcDataChannel !== channel) host.state.interruptTransfer?.();
  host.state.rtcDataChannel = channel;
  channel.binaryType = 'arraybuffer';
  channel.bufferedAmountLowThreshold = 256 * 1024;

  channel.onopen = () => {
    if (host.state.rtcDataChannel !== channel) return;
    host.state.rtcAttempt = 0;
    host.setPeerTransport('p2p');
  };

  channel.onclose = () => {
    if (host.state.rtcDataChannel !== channel) return;
    host.state.rtcDataChannel = null;
    host.state.interruptTransfer?.();
    if (host.state.incomingFile && host.state.incomingFileChannel === channel) {
      host.updateTransfer({ active: false });
    }
    host.closeRtc();
    host.setPeerTransport(host.isPeerConnected() ? 'relay' : null);
    host.scheduleRtcRetry();
  };

  channel.onerror = () => {
    console.debug('Otium Beam P2P channel error; relay remains available.');
  };

  channel.onmessage = (event) => {
    if (host.state.rtcDataChannel !== channel) return;
    void host.handleDataChannelPayload(event.data);
  };
}

export function closeBeamRtcPeer(state: BeamWebRtcState): void {
  state.interruptTransfer?.();
  if (state.rtcDataChannel) {
    const channel = state.rtcDataChannel;
    state.rtcDataChannel = null;
    tryBestEffort('rtc-datachannel-close', () => {
      if (typeof RTCDataChannel !== 'undefined' && channel instanceof RTCDataChannel) {
        channel.onopen = channel.onclose = channel.onerror = channel.onmessage = null;
      }
      channel.close();
    });
  }
  if (state.rtcPeer) {
    tryBestEffort('rtc-peer-close', () => {
      if (!state.rtcPeer) return;
      state.rtcPeer.onicecandidate = null;
      state.rtcPeer.onconnectionstatechange = null;
      state.rtcPeer.oniceconnectionstatechange = null;
      state.rtcPeer.ondatachannel = null;
      state.rtcPeer.close();
    });
    state.rtcPeer = null;
  }
  state.remoteDescriptionSet = false;
  state.queuedIce = [];
  state.lastOfferSdp = null;
}
