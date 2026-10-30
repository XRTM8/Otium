import type { ThemeMode, TextAnnotation, AnnotationRect } from '../core/types';
import type { InkMark } from '../core/annotations/ink';

export type BoardTool = 'hand' | 'pen' | 'highlighter' | 'eraser' | 'laser';

export type BoardBackground = 'white' | 'grid' | 'ruled' | 'dark';

export interface StrokePoint {
  x: number;
  y: number;
  pressure?: number;
}

export interface BoardStroke {
  id: string;
  points: StrokePoint[];
  color: string;
  width: number;
  tool: 'pen' | 'highlighter' | 'eraser';
}

export interface BoardSnippet {
  id: string;
  type: 'text' | 'image';
  content: string; // quote text or image dataUrl (PNG)
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  createdAt: number;
}

export interface BoardPageData {
  id: string;
  strokes: BoardStroke[];
  redoStack: BoardStroke[][];
  undoStack?: BoardStroke[][];
  background: BoardBackground;
}

export interface BeamSessionInfo {
  roomCode: string;
  role: 'sender' | 'receiver';
  deviceName: string;
  connectedAt: number;
}

export interface BeamPayload {
  title: string;
  pageNumber: number;
  totalPages: number;
  theme: ThemeMode;
  pdfBase64?: string;
  pdfData?: ArrayBuffer;
  pdfUrl?: string;
  chunks?: string[];
  totalSize?: number;
  sha256?: string;
  transferId?: string;
}

export type BeamMessageType =
  | 'BEAM_HANDSHAKE'
  | 'BEAM_READY'
  | 'BEAM_PING'
  | 'BEAM_PONG'
  | 'BEAM_PAYLOAD'
  | 'BEAM_DOCUMENT_RESULT'
  | 'BEAM_DOCUMENT_OPENED'
  | 'BEAM_INK_UPDATE'
  | 'BEAM_INK_REQUEST'
  | 'BEAM_ANNOTATION_ACK'
  | 'BEAM_TEXT_ANNOTATIONS'
  | 'BEAM_TEXT_ANNOTATIONS_REQUEST'
  | 'BEAM_SELECTION'
  | 'BEAM_PAGE_CHANGE'
  | 'BEAM_VIEW_MODE'
  | 'BEAM_STEP'
  | 'BEAM_QUERY_STATE'
  | 'BEAM_STATE_ANNOUNCE'
  | 'BEAM_LASER'
  | 'BEAM_DISCONNECT'
  | 'BEAM_RTC_OFFER'
  | 'BEAM_RTC_ANSWER'
  | 'BEAM_RTC_ICE';

export interface BeamMessage {
  type: BeamMessageType;
  roomCode: string;
  /** Unique message id used to drop relay replays and double delivery. */
  msgId?: string;
  /** Random id shared by one sender session. Never reused across sessions. */
  sessionId?: string;
  /** Device that published the message; stops a device reacting to its own echo. */
  origin?: string;
  senderName?: string;
  receiverName?: string;
  transferId?: string;
  ok?: boolean;
  error?: string;
  receiptId?: string;
  annotationReceipt?: { documentId: string; id: string };
  ink?: { documentId: string; upsert?: InkMark[]; deleted?: string[] };
  annotationSync?: { documentId: string; upsert?: TextAnnotation[]; deleted?: string[] };
  selection?: { documentId: string; page: number; rects: AnnotationRect[] };
  payload?: BeamPayload;
  pageNumber?: number;
  viewMode?: 'continuous' | 'dual' | 'single';
  direction?: 'next' | 'prev';
  docTitle?: string;
  totalPages?: number;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  laserPoint?: { x: number; y: number; active: boolean };
  timestamp: number;
}

export type BeamTransport = 'relay' | 'p2p' | 'local';

export type BeamTransferPhase =
  | 'idle'
  | 'waiting-peer'
  | 'preparing'
  | 'transferring'
  | 'finalizing'
  | 'done'
  | 'error';

export interface BeamPeerState {
  connected: boolean;
  peerName: string | null;
  transport: BeamTransport | null;
  docTitle: string | null;
  pageNumber: number | null;
  totalPages: number | null;
}

export interface BeamTransferState {
  active: boolean;
  direction: 'send' | 'receive' | null;
  mode: BeamTransport | null;
  phase: BeamTransferPhase;
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
  error: string | null;
}
