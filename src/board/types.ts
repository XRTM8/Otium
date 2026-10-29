import type { ThemeMode } from '../core/types';

export type BoardTool = 'pen' | 'highlighter' | 'eraser' | 'laser';

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
}

export interface BeamMessage {
  type:
    | 'BEAM_HANDSHAKE'
    | 'BEAM_PAYLOAD'
    | 'BEAM_PAGE_CHANGE'
    | 'BEAM_STEP'
    | 'BEAM_QUERY_STATE'
    | 'BEAM_STATE_ANNOUNCE'
    | 'BEAM_LASER'
    | 'BEAM_DISCONNECT'
    | 'BEAM_RTC_OFFER'
    | 'BEAM_RTC_ANSWER'
    | 'BEAM_RTC_ICE';
  roomCode: string;
  senderName?: string;
  payload?: BeamPayload;
  pageNumber?: number;
  direction?: 'next' | 'prev';
  docTitle?: string;
  totalPages?: number;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  laserPoint?: { x: number; y: number; active: boolean };
  timestamp: number;
}
