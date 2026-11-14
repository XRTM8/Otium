import { localStorage } from '../../platform/storage';
import type { BeamMessage, BeamMessageType } from '../types';
import {
  RECEIVER_ROOM_KEY,
  RECENT_ROOMS_KEY,
  type BeamLaunchParams,
  type BeamLaunchRole,
} from './beamTypesAndConstants';

export {
  BEAM_CHANNEL_NAME,
  BEAM_STORAGE_KEY,
  BeamSendError,
  BeamTransferTimeout,
  CLOUD_FAILURES_BEFORE_ERROR,
  CLOUD_RELAY_BASE,
  EMPTY_PEER,
  EMPTY_TRANSFER,
  HANDSHAKE_INTERVAL_MS,
  ICE_SERVERS,
  MAX_FILE_BYTES,
  MAX_SEEN_MESSAGES,
  P2P_CHUNK_SIZE,
  P2P_HIGH_WATER_MARK,
  P2P_WAIT_MS,
  PEER_TIMEOUT_MS,
  PEER_WAIT_MS,
  PING_INTERVAL_MS,
  RECEIVER_ROOM_KEY,
  RECENT_ROOMS_KEY,
  RELAY_CHUNK_SIZE,
  RELAY_MAX_BYTES,
  RTC_MAX_ATTEMPTS,
  RTC_RETRY_MS,
  SSE_SINCE,
  type BeamConnectionStatus,
  type BeamLaunchParams,
  type BeamLaunchRole,
  type BeamSendErrorCode,
  type FileCompletion,
  type IncomingFileState,
  type LocalDocState,
  type SendDocumentOptions,
} from './beamTypesAndConstants';

let fallbackRandomCounter = 0;

export function randomId(prefix = ''): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}${crypto.randomUUID().replace(/-/g, '')}`;
    }
  } catch (err) {
    console.debug('[Beam] crypto.randomUUID unavailable, using fallback:', err);
  }
  fallbackRandomCounter += 1;
  return `${prefix}${Date.now().toString(36)}${fallbackRandomCounter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      window.setTimeout(resolve, ms);
    } else {
      setTimeout(resolve, ms);
    }
  });
}

export function getDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Device';
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Macintosh|Mac OS/i.test(ua)) return 'Mac';
  return 'Browser';
}

export function isBrowserNetworkAvailable(): boolean {
  return typeof fetch === 'function';
}

export function topicForRoom(roomCode: string): string {
  const clean = roomCode.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return `otium_beam_${clean}`;
}

export function safeTopicPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16).toLowerCase();
}

export function isPdfHeader(buffer: ArrayBuffer): boolean {
  if (!buffer || buffer.byteLength < 5) return false;
  const head = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
  return (
    head[0] === 0x25 &&
    head[1] === 0x50 &&
    head[2] === 0x44 &&
    head[3] === 0x46 &&
    head[4] === 0x2d
  );
}

export function mergeBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const total = buffers.reduce((sum, part) => sum + part.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of buffers) {
    merged.set(new Uint8Array(part), offset);
    offset += part.byteLength;
  }
  return merged.buffer;
}

export async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  let nextIndex = 0;
  const runWorker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item !== undefined) {
        await worker(item, index);
      }
    }
  };
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, () => runWorker()));
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 20000
): Promise<Response> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  if (controller) {
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }
  try {
    return await fetch(input, {
      ...init,
      signal: controller ? controller.signal : init?.signal,
    });
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

export function retryDelayMs(response: Response | null, attempt: number): number {
  const header = response?.headers?.get('Retry-After');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(30000, seconds * 1000);
    }
  }
  return Math.min(15000, 800 * 2 ** attempt);
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `OTM-${Array.from(bytes, (value) => alphabet[value & 31]).join('')}`;
}

export function getPersistentReceiverRoomCode(): string {
  if (typeof localStorage === 'undefined') return generateRoomCode();
  try {
    const saved = localStorage.getItem(RECEIVER_ROOM_KEY);
    if (saved && /^OTM-[A-HJ-NP-Z2-9]{12}$/.test(saved)) {
      return saved;
    }
    const fresh = generateRoomCode();
    localStorage.setItem(RECEIVER_ROOM_KEY, fresh);
    return fresh;
  } catch {
    return generateRoomCode();
  }
}

export function generateNewReceiverRoomCode(): string {
  const fresh = generateRoomCode();
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(RECEIVER_ROOM_KEY, fresh);
    } catch (err) {
      console.warn('[Beam] Failed to persist receiver room code:', err);
    }
  }
  return fresh;
}

export function formatRoomCode(code: string): string {
  if (typeof code !== 'string' || code.length > 256) return '';
  const clean = (code || '').trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (clean.startsWith('OTM') && clean.length > 3) {
    return `OTM-${clean.slice(3)}`;
  }
  if (/^\d{4,6}$/.test(clean)) {
    return `OTM-${clean}`;
  }
  return clean || '';
}

export function parseBeamLaunch(hash = '', search = ''): BeamLaunchParams {
  const sortedValues = new Map<string, string>();

  const readQuery = (query: string) => {
    if (!query) return;
    try {
      const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
      params.forEach((value, key) => {
        if (!sortedValues.has(key.toLowerCase())) {
          sortedValues.set(key.toLowerCase(), value);
        }
      });
    } catch (err) {
      console.debug('[Beam] Ignored malformed query string:', err);
    }
  };

  const rawHash = (hash || '').replace(/^#/, '');
  const hashQueryIndex = rawHash.indexOf('?');
  const hashPath = hashQueryIndex >= 0 ? rawHash.slice(0, hashQueryIndex) : rawHash;
  readQuery(hashQueryIndex >= 0 ? rawHash.slice(hashQueryIndex + 1) : '');
  readQuery(search || '');

  let roomRaw = sortedValues.get('room') || sortedValues.get('code') || '';
  if (!roomRaw) {
    const legacy = `${rawHash} ${search || ''}`.match(/(?:^|[#?&\s])room=([A-Za-z0-9_-]+)/i);
    if (legacy?.[1]) roomRaw = legacy[1];
  }
  if (!roomRaw) {
    const typed = `${rawHash} ${search || ''}`.match(/\bOTM-[A-Za-z0-9]{4,32}\b/i);
    if (typed) roomRaw = typed[0];
  }

  const roleRaw = (
    sortedValues.get('role') ||
    sortedValues.get('mode') ||
    sortedValues.get('target') ||
    ''
  ).toLowerCase();

  let role: BeamLaunchRole | null = null;
  if (['send', 'sender', 'phone', 'remote', 'cast'].includes(roleRaw)) {
    role = 'sender';
  } else if (['receive', 'receiver', 'board', 'pc', 'screen', 'smartboard'].includes(roleRaw)) {
    role = 'receiver';
  }

  const room = roomRaw ? formatRoomCode(roomRaw) : null;
  const auto =
    Boolean(room) ||
    /(^|[#/?&])beam\b/i.test(rawHash) ||
    /(^|[?&])beam\b/i.test(search || '') ||
    hashPath.toLowerCase().startsWith('/beam');

  return { room, role, auto };
}

export function buildBeamLink(roomCode: string, role: BeamLaunchRole = 'sender'): string {
  const room = formatRoomCode(roomCode);
  const roleValue = role === 'receiver' ? 'receive' : 'send';
  return `https://xrtm8.github.io/Otium/#/beam?room=${encodeURIComponent(room)}&role=${roleValue}`;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 0x4000;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function computeSha256(buffer: ArrayBuffer): Promise<string | null> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null;
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

export function looksLikePdfBuffer(buffer: ArrayBuffer): boolean {
  return isPdfHeader(buffer);
}

export function mergeArrayBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  return mergeBuffers(buffers);
}

export function getRecentRooms(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const stored = localStorage.getItem(RECENT_ROOMS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((room): room is string => typeof room === 'string').slice(0, 4);
  } catch {
    return [];
  }
}

const BEAM_MESSAGE_TYPES: ReadonlySet<BeamMessageType> = new Set<BeamMessageType>([
  'BEAM_HANDSHAKE',
  'BEAM_READY',
  'BEAM_PING',
  'BEAM_PONG',
  'BEAM_PAYLOAD',
  'BEAM_DOCUMENT_RESULT',
  'BEAM_DOCUMENT_OPENED',
  'BEAM_INK_UPDATE',
  'BEAM_INK_REQUEST',
  'BEAM_ANNOTATION_ACK',
  'BEAM_TEXT_ANNOTATIONS',
  'BEAM_TEXT_ANNOTATIONS_REQUEST',
  'BEAM_SELECTION',
  'BEAM_PAGE_CHANGE',
  'BEAM_VIEW_MODE',
  'BEAM_STEP',
  'BEAM_QUERY_STATE',
  'BEAM_STATE_ANNOUNCE',
  'BEAM_LASER',
  'BEAM_DISCONNECT',
  'BEAM_RTC_OFFER',
  'BEAM_RTC_ANSWER',
  'BEAM_RTC_ICE',
]);

export function isBeamMessage(value: unknown): value is BeamMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown; roomCode?: unknown };
  return (
    typeof candidate.type === 'string' &&
    typeof candidate.roomCode === 'string' &&
    BEAM_MESSAGE_TYPES.has(candidate.type as BeamMessageType)
  );
}

export function saveRecentRoom(roomCode: string): void {
  if (typeof localStorage === 'undefined' || !roomCode) return;
  try {
    const existing = getRecentRooms().filter((room) => room !== roomCode);
    const updated = [roomCode, ...existing].slice(0, 4);
    localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('[Beam] Failed to persist recent room:', err);
  }
}

export function formatBeamBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
