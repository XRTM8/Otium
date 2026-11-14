import type { BeamPayload, BeamPeerState, BeamTransferState } from '../types';
import { BEAM_RELAY_ORIGIN } from './beamSecurity';

export type BeamConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type BeamLaunchRole = 'sender' | 'receiver';

export interface BeamLaunchParams {
  room: string | null;
  role: BeamLaunchRole | null;
  auto: boolean;
}

export type BeamSendErrorCode =
  | 'busy'
  | 'peer-unreachable'
  | 'too-large'
  | 'transfer-failed'
  | 'invalid-document';

export class BeamSendError extends Error {
  code: BeamSendErrorCode;

  constructor(code: BeamSendErrorCode, message: string) {
    super(message);
    this.name = 'BeamSendError';
    this.code = code;
  }
}

export class BeamTransferTimeout extends Error {}

export interface LocalDocState {
  title: string | null;
  page: number;
  total: number;
}

export interface IncomingFileState {
  transferId: string;
  sessionId?: string;
  title: string;
  name: string;
  fileName?: string;
  size: number;
  sha256?: string;
  pageNumber: number;
  totalPages: number;
  theme: BeamPayload['theme'];
  parts: ArrayBuffer[];
  received: number;
  lastProgressAt: number;
}

export interface FileCompletion {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface SendDocumentOptions {
  roomCode: string;
  buffer: ArrayBuffer;
  title: string;
  fileName?: string;
  pageNumber: number;
  totalPages: number;
  theme: BeamPayload['theme'];
}

export const BEAM_CHANNEL_NAME = 'otium_smart_beam_channel';
export const BEAM_STORAGE_KEY = 'otium_beam_last_event';
export const RECENT_ROOMS_KEY = 'otium_recent_beam_rooms';
export const RECEIVER_ROOM_KEY = 'otium_receiver_room_code';
export const CLOUD_RELAY_BASE = BEAM_RELAY_ORIGIN;

export const SSE_SINCE = '30s';
export const HANDSHAKE_INTERVAL_MS = 2000;
export const PING_INTERVAL_MS = 5000;
export const PEER_TIMEOUT_MS = 20000;
export const PEER_WAIT_MS = 20000;
export const P2P_WAIT_MS = 8000;
export const RTC_RETRY_MS = 6000;
export const RTC_MAX_ATTEMPTS = 4;

export const RELAY_CHUNK_SIZE = 1.75 * 1024 * 1024;
// ntfy.sh allows 20 MB per visitor/day and 2 MB per attachment.
export const RELAY_MAX_BYTES = 18 * 1024 * 1024;
export const P2P_CHUNK_SIZE = 32 * 1024;
export const P2P_HIGH_WATER_MARK = 1024 * 1024;
export const MAX_FILE_BYTES = 300 * 1024 * 1024;
export const MAX_SEEN_MESSAGES = 600;
// Delay error banner until both SSE and HTTPS polling fail a few times.
export const CLOUD_FAILURES_BEFORE_ERROR = 3;

export const EMPTY_PEER: BeamPeerState = {
  connected: false,
  peerName: null,
  transport: null,
  docTitle: null,
  pageNumber: null,
  totalPages: null,
};

export const EMPTY_TRANSFER: BeamTransferState = {
  active: false,
  direction: null,
  mode: null,
  phase: 'idle',
  progress: 0,
  bytesTransferred: 0,
  totalBytes: 0,
  error: null,
};

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
