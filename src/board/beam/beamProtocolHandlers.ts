import type { BeamMessage, BeamTransferState, BeamTransport } from '../types';

export interface BeamProtocolHost {
  getSessionId: () => string | null;
  getPeerSessionId: () => string | null;
  setPeerSessionId: (id: string | null) => void;
  isPeerConnected: () => boolean;
  hasClosedSession: (sessionId: string) => boolean;
  markSessionClosed: (sessionId: string) => void;
  isCurrentSession: (sessionId?: string) => boolean;
  isChannelOpen: () => boolean;
  setLastPeerSeen: (ts: number) => void;
  setPeerConnected: (connected: boolean, peerName?: string | null) => void;
  setPeerTransport: (transport: BeamTransport | null) => void;
  setPeerDocument: (title: string | null | undefined, page: number | null | undefined, total: number | null | undefined) => void;
  closeRtc: () => void;
  resetTransfer: () => void;
  resetPeer: () => void;
  resetRtcAttempt: () => void;
  hasRtcPeer: () => boolean;
  initiateRtc: () => Promise<void>;
  handleRtcOffer: (message: BeamMessage) => Promise<void>;
  handleRtcAnswer: (message: BeamMessage) => Promise<void>;
  handleRtcIce: (message: BeamMessage) => Promise<void>;
  sendReady: (sessionId: string) => void;
  sendPong: (sessionId: string) => void;
  finishDisconnect: () => void;
  deliverDocument: (message: BeamMessage, transport: BeamTransport) => Promise<void>;
  updateTransfer: (patch: Partial<BeamTransferState>) => void;
  broadcast: (message: BeamMessage) => Promise<void>;
  notifyListeners: (message: BeamMessage, transport: BeamTransport) => void;
  handleFileCompletion: (transferId: string, ok: boolean, message?: string) => void;
}

export async function dispatchReceiverBeamMessage(
  host: BeamProtocolHost,
  message: BeamMessage,
  transport: BeamTransport
): Promise<void> {
  switch (message.type) {
    case 'BEAM_HANDSHAKE': {
      if (!message.sessionId) return;
      if (host.hasClosedSession(message.sessionId)) return;
      const existingPeerSession = host.getPeerSessionId();
      if (host.isPeerConnected() && existingPeerSession && message.sessionId !== existingPeerSession) return;
      const isNewSession = !existingPeerSession || existingPeerSession !== message.sessionId;
      if (isNewSession) {
        host.setPeerSessionId(message.sessionId);
        if (transport !== 'p2p') host.closeRtc();
        host.resetTransfer();
        host.resetRtcAttempt();
        host.setPeerDocument(null, null, null);
      }
      host.setLastPeerSeen(Date.now());
      host.setPeerConnected(true, message.senderName || 'Remote');
      host.setPeerTransport(host.isChannelOpen() ? 'p2p' : 'relay');
      host.sendReady(message.sessionId);
      host.notifyListeners(message, transport);
      return;
    }

    case 'BEAM_PING': {
      if (!host.isCurrentSession(message.sessionId)) return;
      host.setLastPeerSeen(Date.now());
      host.setPeerConnected(true);
      host.sendPong(message.sessionId!);
      return;
    }

    case 'BEAM_RTC_OFFER': {
      if (!host.isCurrentSession(message.sessionId)) return;
      host.setLastPeerSeen(Date.now());
      await host.handleRtcOffer(message);
      return;
    }

    case 'BEAM_RTC_ICE': {
      if (!host.isCurrentSession(message.sessionId)) return;
      host.setLastPeerSeen(Date.now());
      await host.handleRtcIce(message);
      return;
    }

    case 'BEAM_QUERY_STATE': {
      if (!host.isCurrentSession(message.sessionId)) return;
      host.setLastPeerSeen(Date.now());
      if (message.sessionId) host.sendReady(message.sessionId);
      return;
    }

    case 'BEAM_DISCONNECT': {
      if (!host.isCurrentSession(message.sessionId)) return;
      host.markSessionClosed(message.sessionId!);
      host.closeRtc();
      host.resetTransfer();
      host.resetPeer();
      host.setPeerSessionId(null);
      host.notifyListeners(message, transport);
      return;
    }

    case 'BEAM_PAGE_CHANGE':
    case 'BEAM_VIEW_MODE':
    case 'BEAM_ANNOTATION_ACK':
    case 'BEAM_INK_UPDATE':
    case 'BEAM_INK_REQUEST':
    case 'BEAM_TEXT_ANNOTATIONS':
    case 'BEAM_TEXT_ANNOTATIONS_REQUEST':
    case 'BEAM_SELECTION':
    case 'BEAM_STEP':
    case 'BEAM_PAYLOAD':
    case 'BEAM_STATE_ANNOUNCE':
    case 'BEAM_LASER': {
      if (!host.isCurrentSession(message.sessionId)) return;
      host.setLastPeerSeen(Date.now());
      host.setPeerConnected(true);
      if (message.type === 'BEAM_PAYLOAD') {
        try {
          await host.deliverDocument(message, transport);
          if (!host.isCurrentSession(message.sessionId)) return;
          host.updateTransfer({ active: false, phase: 'done', progress: 100 });
          await host.broadcast({
            type: 'BEAM_DOCUMENT_RESULT',
            roomCode: message.roomCode,
            sessionId: message.sessionId,
            transferId: message.payload?.transferId,
            ok: true,
            timestamp: Date.now(),
          });
        } catch (error) {
          if (!host.isCurrentSession(message.sessionId)) return;
          const reason = error instanceof Error ? error.message : 'The receiver could not open the PDF.';
          host.updateTransfer({ active: false, phase: 'error', error: reason });
          await host.broadcast({
            type: 'BEAM_DOCUMENT_RESULT',
            roomCode: message.roomCode,
            sessionId: message.sessionId,
            transferId: message.payload?.transferId,
            ok: false,
            error: reason,
            timestamp: Date.now(),
          });
        }
        return;
      }
      host.notifyListeners(message, transport);
      return;
    }

    default:
      return;
  }
}

export async function dispatchSenderBeamMessage(
  host: BeamProtocolHost,
  message: BeamMessage,
  transport: BeamTransport
): Promise<void> {
  const sessionId = host.getSessionId();
  switch (message.type) {
    case 'BEAM_ANNOTATION_ACK':
    case 'BEAM_INK_UPDATE':
    case 'BEAM_INK_REQUEST':
    case 'BEAM_TEXT_ANNOTATIONS':
    case 'BEAM_TEXT_ANNOTATIONS_REQUEST':
    case 'BEAM_SELECTION': {
      if (!message.sessionId || message.sessionId !== sessionId || !host.isPeerConnected()) return;
      host.notifyListeners(message, transport);
      return;
    }
    case 'BEAM_DOCUMENT_RESULT': {
      if (message.sessionId !== sessionId || !message.transferId) return;
      host.handleFileCompletion(message.transferId, message.ok === true, message.error);
      return;
    }
    case 'BEAM_READY': {
      if (!message.sessionId || message.sessionId !== sessionId) return;
      host.setPeerSessionId(message.sessionId);
      host.setLastPeerSeen(Date.now());
      host.setPeerConnected(true, message.receiverName || 'Receiver');
      host.setPeerTransport(host.isChannelOpen() ? 'p2p' : 'relay');
      host.setPeerDocument(message.docTitle, message.pageNumber, message.totalPages);
      if (!host.hasRtcPeer()) {
        void host.initiateRtc();
      }
      return;
    }

    case 'BEAM_PONG': {
      if (!message.sessionId || message.sessionId !== sessionId) return;
      host.setLastPeerSeen(Date.now());
      host.setPeerConnected(true);
      if (!host.getPeerSessionId()) host.setPeerSessionId(message.sessionId);
      return;
    }

    case 'BEAM_STATE_ANNOUNCE': {
      if (!message.sessionId || message.sessionId !== sessionId) return;
      host.setLastPeerSeen(Date.now());
      host.setPeerConnected(true);
      host.setPeerDocument(message.docTitle, message.pageNumber, message.totalPages);
      return;
    }

    case 'BEAM_RTC_ANSWER': {
      if (!message.sessionId || message.sessionId !== sessionId) return;
      await host.handleRtcAnswer(message);
      return;
    }

    case 'BEAM_RTC_ICE': {
      if (!message.sessionId || message.sessionId !== sessionId) return;
      await host.handleRtcIce(message);
      return;
    }

    case 'BEAM_DISCONNECT': {
      if (!message.sessionId || message.sessionId !== sessionId) return;
      host.finishDisconnect();
      return;
    }

    default:
      return;
  }
}
