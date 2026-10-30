import type {
  BeamMessage,
  BeamPeerState,
  BeamPayload,
  BeamTransferState,
  BeamTransport
} from '../types';

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

const BEAM_CHANNEL_NAME = 'otium_smart_beam_channel';
const BEAM_STORAGE_KEY = 'otium_beam_last_event';
const RECENT_ROOMS_KEY = 'otium_recent_beam_rooms';
const RECEIVER_ROOM_KEY = 'otium_receiver_room_code';
// ntfy.sh was timing out on the classroom network even though normal HTTPS
// worked. This compatible relay was verified with publish, long-poll and SSE
// before being made the shared default for every newly updated device.
const CLOUD_RELAY_BASE = 'https://ntfy.tedomum.fr';

const SSE_SINCE = '30s';
const HANDSHAKE_INTERVAL_MS = 2000;
const PING_INTERVAL_MS = 5000;
const PEER_TIMEOUT_MS = 20000;
const PEER_WAIT_MS = 20000;
const P2P_WAIT_MS = 8000;
const RTC_RETRY_MS = 6000;
const RTC_MAX_ATTEMPTS = 4;

const RELAY_CHUNK_SIZE = 1.75 * 1024 * 1024;
// ntfy.sh allows 20 MB per visitor/day and 2 MB per attachment. This margin
// leaves room for signaling and retries.
const RELAY_MAX_BYTES = 18 * 1024 * 1024;
const P2P_CHUNK_SIZE = 32 * 1024;
const P2P_HIGH_WATER_MARK = 1024 * 1024;
const MAX_FILE_BYTES = 300 * 1024 * 1024;
const MAX_SEEN_MESSAGES = 600;
// An SSE failure is common on captive Wi-Fi and Android WebView even though
// ordinary HTTPS requests still work. Do not alarm the teacher until both
// signaling transports have actually failed a few times.
const CLOUD_FAILURES_BEFORE_ERROR = 3;

const EMPTY_PEER: BeamPeerState = {
  connected: false,
  peerName: null,
  transport: null,
  docTitle: null,
  pageNumber: null,
  totalPages: null
};

const EMPTY_TRANSFER: BeamTransferState = {
  active: false,
  direction: null,
  mode: null,
  phase: 'idle',
  progress: 0,
  bytesTransferred: 0,
  totalBytes: 0,
  error: null
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

let fallbackRandomCounter = 0;

function randomId(prefix = ''): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}${crypto.randomUUID().replace(/-/g, '')}`;
    }
  } catch {}
  fallbackRandomCounter += 1;
  return `${prefix}${Date.now().toString(36)}${fallbackRandomCounter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      window.setTimeout(resolve, ms);
    } else {
      setTimeout(resolve, ms);
    }
  });
}

function getDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Device';
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Macintosh|Mac OS/i.test(ua)) return 'Mac';
  return 'Browser';
}

function isBrowserNetworkAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.location !== 'undefined' &&
    typeof fetch === 'function'
  );
}

function topicForRoom(roomCode: string): string {
  const clean = roomCode.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return `otium_beam_${clean}`;
}

function safeTopicPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16).toLowerCase();
}

function isPdfHeader(buffer: ArrayBuffer): boolean {
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

function mergeBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const total = buffers.reduce((sum, part) => sum + part.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of buffers) {
    merged.set(new Uint8Array(part), offset);
    offset += part.byteLength;
  }
  return merged.buffer;
}

async function mapWithConcurrency<T>(
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
      await worker(items[index], index);
    }
  };
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, () => runWorker()));
}

async function fetchWithTimeout(
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
      signal: controller ? controller.signal : init?.signal
    });
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

function retryDelayMs(response: Response | null, attempt: number): number {
  const header = response?.headers?.get('Retry-After');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(30000, seconds * 1000);
    }
  }
  return Math.min(15000, 800 * 2 ** attempt);
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function generateRoomCode(): string {
  // 4 easy numeric digits for effortless classroom read-out: OTM-XXXX
  const num = Math.floor(1000 + Math.random() * 9000);
  return `OTM-${num}`;
}

export function getPersistentReceiverRoomCode(): string {
  if (typeof localStorage === 'undefined') return generateRoomCode();
  try {
    const saved = localStorage.getItem(RECEIVER_ROOM_KEY);
    if (saved && /^OTM-\d{4,6}$/.test(saved)) {
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
    } catch {}
  }
  return fresh;
}

export function formatRoomCode(code: string): string {
  const clean = (code || '').trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (clean.startsWith('OTM') && clean.length > 3) {
    return `OTM-${clean.slice(3)}`;
  }
  if (/^\d{4,6}$/.test(clean)) {
    return `OTM-${clean}`;
  }
  return clean || '';
}

/**
 * Reads the room and role from a smart-board link. Both `#/beam?room=...` and
 * legacy query strings are supported. The old code treated every `room=` link
 * as "sender", which meant a PC opening the receiver link never listened.
 */
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
    } catch {}
  };

  const rawHash = (hash || '').replace(/^#/, '');
  const hashQueryIndex = rawHash.indexOf('?');
  const hashPath = hashQueryIndex >= 0 ? rawHash.slice(0, hashQueryIndex) : rawHash;
  readQuery(hashQueryIndex >= 0 ? rawHash.slice(hashQueryIndex + 1) : '');
  readQuery(search || '');

  let roomRaw = sortedValues.get('room') || sortedValues.get('code') || '';
  if (!roomRaw) {
    const legacy = `${rawHash} ${search || ''}`.match(
      /(?:^|[#?&\s])room=([A-Za-z0-9_-]+)/i
    );
    if (legacy) roomRaw = legacy[1];
  }
  if (!roomRaw) {
    const typed = `${rawHash} ${search || ''}`.match(/\bOTM-\d{4,6}\b/i);
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
  return `https://is.gd/otium#/beam?room=${encodeURIComponent(room)}&role=${roleValue}`;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 0x8000;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
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

export function saveRecentRoom(roomCode: string): void {
  if (typeof localStorage === 'undefined' || !roomCode) return;
  try {
    const existing = getRecentRooms().filter((room) => room !== roomCode);
    const updated = [roomCode, ...existing].slice(0, 4);
    localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(updated));
  } catch {}
}

interface LocalDocState {
  title: string | null;
  page: number;
  total: number;
}

interface IncomingFileState {
  transferId: string;
  title: string;
  name: string;
  size: number;
  sha256?: string;
  pageNumber: number;
  totalPages: number;
  theme: BeamPayload['theme'];
  parts: ArrayBuffer[];
  received: number;
  lastProgressAt: number;
}

interface FileCompletion {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface SendDocumentOptions {
  roomCode: string;
  buffer: ArrayBuffer;
  title: string;
  pageNumber: number;
  totalPages: number;
  theme: BeamPayload['theme'];
}

export class BeamService {
  private broadcastChannel: BroadcastChannel | null = null;
  private listeners: Set<(msg: BeamMessage, transport: BeamTransport) => void | Promise<void>> = new Set();
  private stateListeners: Set<
    (state: { room: string | null; role: 'receiver' | 'sender' | null }) => void
  > = new Set();
  private statusListeners: Set<(status: BeamConnectionStatus) => void> = new Set();
  private peerListeners: Set<(state: BeamPeerState) => void> = new Set();
  private transferListeners: Set<(state: BeamTransferState) => void> = new Set();

  private activeEventSource: EventSource | null = null;
  private activeRoomCode: string | null = null;
  private connectedRoom: string | null = null;
  private role: 'receiver' | 'sender' | null = null;
  private connectionStatus: BeamConnectionStatus = 'disconnected';
  private lastNotifiedState = '';

  // Deliberately per tab/window: two Otium tabs on the same PC must be able to
  // pair with each other, while an SSE echo of our own POST must be ignored.
  private readonly deviceId = randomId('d');
  private sessionId: string | null = null;
  private peerSessionId: string | null = null;
  private closedSessions = new Set<string>();
  private localDoc: LocalDocState = { title: null, page: 1, total: 0 };
  private peerState: BeamPeerState = { ...EMPTY_PEER };
  private transferState: BeamTransferState = { ...EMPTY_TRANSFER };

  private rtcPeer: RTCPeerConnection | null = null;
  private rtcDataChannel: RTCDataChannel | null = null;
  private readonly isRtcSupported = typeof RTCPeerConnection !== 'undefined';
  private remoteDescriptionSet = false;
  private queuedIce: RTCIceCandidateInit[] = [];
  private rtcAttempt = 0;
  private rtcRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastOfferSdp: string | null = null;

  private maintenanceTimer: number | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private relayCursor: string = SSE_SINCE;
  private pollingGeneration: number | null = null;
  private reconnectAttempt = 0;
  private sourceGeneration = 0;
  private lastPeerSeen = 0;
  private lastPingAt = 0;

  private seenMessages = new Map<string, number>();
  private lastPageBroadcast: { page: number; at: number } = { page: 0, at: 0 };
  private sendingDocument = false;
  private incomingFile: IncomingFileState | null = null;
  private fileCompletion: FileCompletion | null = null;
  private fileCompletionId: string | null = null;

  constructor() {
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel(BEAM_CHANNEL_NAME);
        this.broadcastChannel.onmessage = (event) => {
          void this.handleIncoming(event.data, 'local');
        };
      } catch (error) {
        console.warn('BroadcastChannel not available, using fallback:', error);
      }
    }

    if (
      typeof window !== 'undefined' &&
      typeof window.addEventListener === 'function'
    ) {
      window.addEventListener('storage', (event) => {
        if (event.key === BEAM_STORAGE_KEY && event.newValue) {
          try {
            void this.handleIncoming(JSON.parse(event.newValue), 'local');
          } catch {}
        }
      });
      // Do not tear down a paired session on pagehide: Android WebView can
      // emit it while rotating/recreating its surface. The peer timeout and
      // explicit Disconnect action handle genuinely ended sessions.
      window.addEventListener('online', () => this.retryCloudConnection());
      window.addEventListener('offline', () => {
        if (this.connectedRoom) this.setConnectionStatus('error');
      });
    }
  }

  public getDeviceId(): string {
    return this.deviceId;
  }

  public isOwnMessage(msg: BeamMessage): boolean {
    return Boolean(msg.origin && msg.origin === this.deviceId);
  }

  public normalizeRoom(code: string): string {
    return (code || '').trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  }

  public isMatchingRoom(a: string, b: string): boolean {
    return this.normalizeRoom(a) === this.normalizeRoom(b);
  }

  public getConnectedRoom(): string | null {
    return this.connectedRoom;
  }

  public getRole(): 'receiver' | 'sender' | null {
    return this.role;
  }

  public getConnectionStatus(): BeamConnectionStatus {
    return this.connectionStatus;
  }

  public getPeerState(): BeamPeerState {
    return { ...this.peerState };
  }

  public getTransferState(): BeamTransferState {
    return { ...this.transferState };
  }

  /**
   * Reopens cloud signaling without throwing away the room, pairing role, or
   * direct-channel state. This is deliberately public for the visible Retry
   * button and for the browser's online event.
   */
  public retryCloudConnection(): void {
    if (!this.connectedRoom || !this.activeRoomCode || !this.role) return;
    this.reconnectAttempt = 0;
    this.closeEventSource();
    this.setConnectionStatus('connecting');
    this.openEventSource();
    if (this.role === 'sender') this.sendHandshake();
  }

  public getLocalDocumentState(): LocalDocState {
    return { ...this.localDoc };
  }

  public startReceiver(roomCode: string, force = false): void {
    const formatted = formatRoomCode(roomCode);
    if (!formatted) return;

    const sameRoom =
      this.role === 'receiver' &&
      this.connectedRoom !== null &&
      this.isMatchingRoom(this.connectedRoom, formatted);

    if (sameRoom) {
      this.connectedRoom = formatted;
      if (force || (!this.activeEventSource && this.pollingGeneration === null)) {
        this.openEventSource();
      }
      this.startMaintenance();
      this.notifyStateListeners();
      return;
    }

    if (this.role && this.connectedRoom) {
      this.sendDisconnectBestEffort();
    }

    this.stopMaintenance();
    this.closeRtc();
    this.closeEventSource();
    this.resetTransfer();
    this.resetPeer();
    this.role = 'receiver';
    this.connectedRoom = formatted;
    this.sessionId = null;
    this.peerSessionId = null;
    this.localDoc = { title: null, page: 1, total: 0 };
    saveRecentRoom(formatted);
    this.listenToRoom(formatted);
    this.startMaintenance();
    this.notifyStateListeners();
  }

  public startSender(roomCode: string, force = false): void {
    const formatted = formatRoomCode(roomCode);
    if (!formatted) return;

    const sameRoom =
      this.role === 'sender' &&
      this.connectedRoom !== null &&
      this.isMatchingRoom(this.connectedRoom, formatted);

    if (sameRoom) {
      this.connectedRoom = formatted;
      if (force || (!this.activeEventSource && this.pollingGeneration === null)) {
        this.openEventSource();
      }
      this.startMaintenance();
      if (this.peerState.connected) {
        this.sendPing();
      } else {
        this.sendHandshake();
      }
      this.notifyStateListeners();
      return;
    }

    if (this.role && this.connectedRoom) {
      this.sendDisconnectBestEffort();
    }

    this.stopMaintenance();
    this.closeRtc();
    this.closeEventSource();
    this.resetTransfer();
    this.resetPeer();
    this.role = 'sender';
    this.connectedRoom = formatted;
    this.sessionId = randomId('s');
    this.peerSessionId = null;
    this.localDoc = { title: null, page: 1, total: 0 };
    saveRecentRoom(formatted);
    this.listenToRoom(formatted);
    this.startMaintenance();
    this.notifyStateListeners();
    this.sendHandshake();
  }

  public disconnect(): void {
    this.sendDisconnectBestEffort();
    this.finishDisconnect();
  }

  public onConnectionStatusChange(callback: (status: BeamConnectionStatus) => void): () => void {
    this.statusListeners.add(callback);
    callback(this.connectionStatus);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  public onStateChange(
    callback: (state: { room: string | null; role: 'receiver' | 'sender' | null }) => void
  ): () => void {
    this.stateListeners.add(callback);
    callback({ room: this.connectedRoom, role: this.role });
    return () => {
      this.stateListeners.delete(callback);
    };
  }

  public onPeerChange(callback: (state: BeamPeerState) => void): () => void {
    this.peerListeners.add(callback);
    callback({ ...this.peerState });
    return () => {
      this.peerListeners.delete(callback);
    };
  }

  public onTransferProgress(callback: (state: BeamTransferState) => void): () => void {
    this.transferListeners.add(callback);
    callback({ ...this.transferState });
    return () => {
      this.transferListeners.delete(callback);
    };
  }

  public subscribe(
    callback: (msg: BeamMessage, transport: BeamTransport) => void | Promise<void>
  ): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  public setLocalDocumentState(docTitle: string, currentPage: number, totalPages: number): void {
    this.localDoc = {
      title: docTitle || null,
      page: currentPage || 1,
      total: totalPages || 0
    };
  }

  public broadcastPageChange(pageNumber: number): void {
    if (!this.connectedRoom || this.role !== 'sender' || !this.sessionId || !this.peerSessionId) {
      return;
    }
    const page = Math.max(1, Math.round(pageNumber));
    const now = Date.now();
    if (
      this.lastPageBroadcast.page === page &&
      now - this.lastPageBroadcast.at < 600
    ) {
      return;
    }
    this.lastPageBroadcast = { page, at: now };
    void this.broadcast({
      type: 'BEAM_PAGE_CHANGE',
      roomCode: this.connectedRoom,
      sessionId: this.sessionId,
      pageNumber: page,
      timestamp: now
    });
  }

  public sendStep(direction: 'next' | 'prev'): void {
    if (!this.connectedRoom || !this.sessionId || !this.peerSessionId) return;
    void this.broadcast({
      type: 'BEAM_STEP',
      roomCode: this.connectedRoom,
      sessionId: this.sessionId,
      direction,
      timestamp: Date.now()
    });
  }

  public sendViewMode(viewMode: 'continuous' | 'dual' | 'single'): void {
    if (!this.connectedRoom || !this.sessionId || !this.peerSessionId) return;
    void this.broadcast({ type: 'BEAM_VIEW_MODE', roomCode: this.connectedRoom, sessionId: this.sessionId, viewMode, timestamp: Date.now() });
  }

  public queryReceiverState(roomCode?: string): void {
    const code = roomCode || this.connectedRoom;
    if (!code || !this.sessionId || !this.peerSessionId) return;
    void this.broadcast({
      type: 'BEAM_QUERY_STATE',
      roomCode: code,
      sessionId: this.sessionId,
      timestamp: Date.now()
    });
  }

  public announceState(
    roomCode: string,
    docTitle: string,
    currentPage: number,
    totalPages: number
  ): void {
    if (!roomCode) return;
    this.setLocalDocumentState(docTitle, currentPage, totalPages);
    if (this.role !== 'receiver' || !this.peerSessionId) return;
    void this.broadcast({
      type: 'BEAM_STATE_ANNOUNCE',
      roomCode,
      sessionId: this.peerSessionId,
      docTitle,
      pageNumber: currentPage,
      totalPages,
      timestamp: Date.now()
    });
  }

  /**
   * Sends a full PDF. It first waits for the receiver handshake, then tries a
   * direct WebRTC DataChannel. If P2P is impossible (different NATs, WebView
   * restrictions), it falls back to chunked ntfy attachments for files within
   * the public relay quota.
   */
  public async sendDocument(options: SendDocumentOptions): Promise<{ mode: BeamTransport }> {
    if (this.sendingDocument) {
      throw new BeamSendError(
        'busy',
        'Another document transfer is already in progress.'
      );
    }

    const roomCode = formatRoomCode(options.roomCode);
    if (!roomCode) {
      throw new BeamSendError('peer-unreachable', 'A valid room code is required.');
    }
    if (!options.buffer || options.buffer.byteLength === 0) {
      throw new BeamSendError('invalid-document', 'The document is empty.');
    }
    if (options.buffer.byteLength > MAX_FILE_BYTES) {
      throw new BeamSendError(
        'too-large',
        'The document is larger than the 300 MB transfer limit.'
      );
    }
    if (!isPdfHeader(options.buffer)) {
      throw new BeamSendError('invalid-document', 'The selected file is not a valid PDF.');
    }

    this.sendingDocument = true;
    let sendingSession: string | null = null;
    const assertActive = () => {
      if (!sendingSession || this.sessionId !== sendingSession || this.role !== 'sender') {
        throw new Error('The transfer was cancelled.');
      }
    };
    try {
      this.startSender(roomCode);
      sendingSession = this.sessionId;
      this.setLocalDocumentState(options.title, options.pageNumber, options.totalPages);

      this.updateTransfer({
        active: true,
        direction: 'send',
        mode: null,
        phase: 'waiting-peer',
        progress: 0,
        bytesTransferred: 0,
        totalBytes: options.buffer.byteLength,
        error: null
      });

      const peerReady = await this.waitForPeer(PEER_WAIT_MS);
      assertActive();
      if (!peerReady) {
        throw new BeamSendError(
          'peer-unreachable',
          'The receiver did not answer. Open Otium on the other device, choose Receiver, and make sure the code matches.'
        );
      }

      this.updateTransfer({ phase: 'preparing', mode: 'p2p', progress: 2 });
      const channel = await this.waitForDataChannel(P2P_WAIT_MS);
      assertActive();
      if (channel) {
        try {
          await this.sendFileOverDataChannel(options);
          assertActive();
          return { mode: 'p2p' };
        } catch (error) {
          assertActive();
          if (error instanceof BeamSendError && error.code === 'invalid-document') throw error;
          console.warn('P2P transfer failed, trying cloud relay:', error);
          this.updateTransfer({ phase: 'preparing', mode: 'relay', progress: 5 });
        }
      }

      if (options.buffer.byteLength > RELAY_MAX_BYTES) {
        throw new BeamSendError(
          'too-large',
          'This PDF is too large for the cloud relay. Keep both devices on the same Wi-Fi or phone hotspot so the direct connection can be used.'
        );
      }

      await this.sendFileOverRelay(options);
      assertActive();
      return { mode: 'relay' };
    } catch (error) {
      if (sendingSession !== this.sessionId) throw error;
      const message = error instanceof Error ? error.message : 'Document transfer failed.';
      this.updateTransfer({
        active: false,
        phase: 'error',
        error: message
      });
      throw error;
    } finally {
      this.sendingDocument = false;
    }
  }

  public async downloadRelayChunks(
    chunks: string[],
    expectedSize?: number,
    expectedSha256?: string
  ): Promise<ArrayBuffer> {
    if (!Array.isArray(chunks) || chunks.length === 0) {
      throw new Error('The relay payload contains no chunks.');
    }

    this.updateTransfer({
      active: true,
      direction: 'receive',
      mode: 'relay',
      phase: 'transferring',
      progress: 0,
      bytesTransferred: 0,
      totalBytes: expectedSize || 0,
      error: null
    });

    try {
      const parts: ArrayBuffer[] = new Array(chunks.length);
      let downloaded = 0;
      let completed = 0;

      const downloadOne = async (url: string, index: number): Promise<void> => {
        const buffer = await this.fetchAttachmentBuffer(url);
        parts[index] = buffer;
        downloaded += buffer.byteLength;
        completed += 1;
        const total = expectedSize || downloaded;
        this.updateTransfer({
          phase: 'transferring',
          progress: Math.min(96, Math.round((downloaded / Math.max(1, total)) * 100)),
          bytesTransferred: downloaded,
          totalBytes: total
        });
        if (completed === chunks.length && downloaded === total) {
          // Progress is finalised after hash verification.
        }
      };

      await mapWithConcurrency(chunks, 3, downloadOne);

      const merged = mergeBuffers(parts);
      if (expectedSize && merged.byteLength !== expectedSize) {
        throw new Error(
          `Relay size mismatch (expected ${expectedSize} bytes, got ${merged.byteLength}).`
        );
      }
      if (!isPdfHeader(merged)) {
        throw new Error('The relay payload is not a valid PDF.');
      }
      if (expectedSha256) {
        const actual = await computeSha256(merged);
        if (actual && actual !== expectedSha256) {
          throw new Error('Relay checksum mismatch. Please retry the transfer.');
        }
      }

      this.updateTransfer({
        active: true,
        phase: 'finalizing',
        progress: 98,
        bytesTransferred: merged.byteLength,
        totalBytes: merged.byteLength
      });
      return merged;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Relay download failed.';
      this.updateTransfer({ active: false, phase: 'error', error: message });
      throw error;
    }
  }

  private notifyStatusListeners(): void {
    for (const listener of this.statusListeners) {
      try {
        listener(this.connectionStatus);
      } catch (error) {
        console.error('Error in beam status listener:', error);
      }
    }
  }

  private setConnectionStatus(status: BeamConnectionStatus): void {
    if (this.connectionStatus === status) return;
    this.connectionStatus = status;
    this.notifyStatusListeners();
  }

  private notifyStateListeners(): void {
    const state = { room: this.connectedRoom, role: this.role };
    const key = `${state.room ?? ''}|${state.role ?? ''}`;
    if (key === this.lastNotifiedState) return;
    this.lastNotifiedState = key;
    for (const listener of this.stateListeners) {
      try {
        listener(state);
      } catch (error) {
        console.error('Error in beam state listener:', error);
      }
    }
  }

  private notifyPeerListeners(): void {
    for (const listener of this.peerListeners) {
      try {
        listener({ ...this.peerState });
      } catch (error) {
        console.error('Error in beam peer listener:', error);
      }
    }
  }

  private notifyTransferListeners(): void {
    for (const listener of this.transferListeners) {
      try {
        listener({ ...this.transferState });
      } catch (error) {
        console.error('Error in beam transfer listener:', error);
      }
    }
  }

  private updateTransfer(patch: Partial<BeamTransferState>): void {
    this.transferState = { ...this.transferState, ...patch };
    this.notifyTransferListeners();
  }

  private resetTransfer(): void {
    this.incomingFile = null;
    this.resolveFileCompletion(new Error('The transfer was cancelled.'));
    if (
      this.transferState.phase !== 'idle' ||
      this.transferState.active ||
      this.transferState.error
    ) {
      this.transferState = { ...EMPTY_TRANSFER };
      this.notifyTransferListeners();
    }
  }

  private resetPeer(): void {
    this.lastPeerSeen = 0;
    this.lastPingAt = 0;
    this.peerState = { ...EMPTY_PEER };
    this.notifyPeerListeners();
  }

  private setPeerConnected(connected: boolean, peerName?: string | null): void {
    const next: BeamPeerState = {
      ...this.peerState,
      connected,
      peerName: connected ? peerName ?? this.peerState.peerName : null,
      transport: connected ? this.peerState.transport : null
    };
    if (
      next.connected === this.peerState.connected &&
      next.peerName === this.peerState.peerName &&
      next.transport === this.peerState.transport
    ) {
      return;
    }
    this.peerState = next;
    this.notifyPeerListeners();
  }

  private setPeerTransport(transport: BeamTransport | null): void {
    if (this.peerState.transport === transport) return;
    this.peerState = { ...this.peerState, transport };
    this.notifyPeerListeners();
  }

  private setPeerDocument(
    docTitle: string | null | undefined,
    pageNumber: number | null | undefined,
    totalPages: number | null | undefined
  ): void {
    const nextTitle = docTitle || null;
    const nextPage = typeof pageNumber === 'number' ? pageNumber : null;
    const nextTotal = typeof totalPages === 'number' ? totalPages : null;
    if (
      this.peerState.docTitle === nextTitle &&
      this.peerState.pageNumber === nextPage &&
      this.peerState.totalPages === nextTotal
    ) {
      return;
    }
    this.peerState = {
      ...this.peerState,
      docTitle: nextTitle,
      pageNumber: nextPage,
      totalPages: nextTotal
    };
    this.notifyPeerListeners();
  }

  private listenToRoom(roomCode: string): void {
    const clean = roomCode.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    this.activeRoomCode = clean;
    this.relayCursor = SSE_SINCE;
    this.openEventSource();
  }

  private openEventSource(): void {
    this.closeEventSource();
    if (!this.activeRoomCode) return;
    if (typeof EventSource === 'undefined') {
      // Older Android WebViews may not provide EventSource but can still use
      // ordinary HTTPS. Start polling instead of making cloud pairing vanish.
      this.setConnectionStatus('connecting');
      void this.pollRoom(this.sourceGeneration);
      return;
    }

    const generation = this.sourceGeneration;
    this.setConnectionStatus('connecting');

    try {
      const topic = topicForRoom(this.activeRoomCode);
      const source = new EventSource(
        `${CLOUD_RELAY_BASE}/${topic}/sse?since=${SSE_SINCE}`
      );
      this.activeEventSource = source;
      this.connectionTimer = setTimeout(() => {
        if (generation !== this.sourceGeneration) return;
        source.close();
        this.activeEventSource = null;
        // Try short polling before presenting a cloud failure. Many school
        // routers permit fetch but buffer long-lived SSE connections.
        this.setConnectionStatus('connecting');
        void this.pollRoom(generation);
      }, 15000);

      source.onopen = () => {
        if (generation !== this.sourceGeneration || this.activeEventSource !== source) return;
        if (this.connectionTimer !== null) clearTimeout(this.connectionTimer);
        this.connectionTimer = null;
        this.reconnectAttempt = 0;
        this.setConnectionStatus('connected');
        if (this.role === 'sender') {
          this.sendHandshake();
        }
      };

      source.onmessage = (event) => {
        if (generation !== this.sourceGeneration || this.activeEventSource !== source) return;
        void this.handleRelayEvent(event.data, generation);
      };

      source.onerror = () => {
        if (generation !== this.sourceGeneration || this.activeEventSource !== source) return;
        if (this.connectionTimer !== null) clearTimeout(this.connectionTimer);
        this.connectionTimer = null;
        this.setConnectionStatus('connecting');
        source.close();
        this.activeEventSource = null;
        void this.pollRoom(generation);
      };
    } catch (error) {
      console.warn('Cloud EventSource signaling fallback:', error);
      this.setConnectionStatus('connecting');
      this.scheduleReconnect(generation);
    }
  }

  private closeEventSource(): void {
    this.sourceGeneration += 1;
    this.pollingGeneration = null;
    if (this.pollTimer !== null) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    if (this.connectionTimer !== null) clearTimeout(this.connectionTimer);
    this.connectionTimer = null;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.activeEventSource) {
      try {
        this.activeEventSource.close();
      } catch {}
      this.activeEventSource = null;
    }
  }

  // Some routers and WebViews buffer long-lived SSE responses. Short requests
  // provide the same signaling protocol without requiring a streaming connection.
  private async pollRoom(generation: number): Promise<void> {
    if (generation !== this.sourceGeneration || !this.activeRoomCode) return;
    this.pollingGeneration = generation;
    try {
      const topic = topicForRoom(this.activeRoomCode);
      const response = await fetchWithTimeout(
        `${CLOUD_RELAY_BASE}/${topic}/json?poll=1&since=${encodeURIComponent(this.relayCursor)}`,
        undefined, 10000
      );
      if (generation !== this.sourceGeneration) return;
      if (!response.ok) throw new Error(`Signaling returned HTTP ${response.status}`);
      const body = await response.text();
      if (generation !== this.sourceGeneration) return;
      this.setConnectionStatus('connected');
      this.reconnectAttempt = 0;
      for (const line of body.split('\n')) {
        if (generation !== this.sourceGeneration) return;
        if (line.trim()) await this.handleRelayEvent(line, generation);
      }
    } catch {
      if (generation !== this.sourceGeneration) return;
      this.reconnectAttempt += 1;
      if (this.reconnectAttempt >= CLOUD_FAILURES_BEFORE_ERROR) {
        this.setConnectionStatus('error');
      } else {
        this.setConnectionStatus('connecting');
      }
    }
    if (generation !== this.sourceGeneration) return;
    const delay = this.reconnectAttempt === 0
      ? 5000
      : Math.min(30000, 1500 * 2 ** Math.min(4, this.reconnectAttempt));
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.pollRoom(generation);
    }, delay);
  }

  private scheduleReconnect(generation: number): void {
    if (this.reconnectTimer !== null) return;
    if (!this.activeRoomCode) return;
    const delay = Math.min(30000, 1000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (generation !== this.sourceGeneration) return;
      if (!this.activeRoomCode) return;
      this.openEventSource();
    }, delay);
  }

  private startMaintenance(): void {
    this.stopMaintenance();
    if (
      typeof window === 'undefined' ||
      typeof window.setInterval !== 'function'
    ) {
      return;
    }

    this.maintenanceTimer = window.setInterval(() => {
      const now = Date.now();

      if (this.role === 'sender' && this.sessionId) {
        if (!this.peerState.connected) {
          this.sendHandshake();
        } else if (now - this.lastPingAt >= PING_INTERVAL_MS) {
          this.sendPing();
        }
      }

      if (this.peerState.connected && this.lastPeerSeen > 0) {
        if (now - this.lastPeerSeen > PEER_TIMEOUT_MS) {
          this.setPeerConnected(false);
          this.setPeerTransport(null);
          if (this.role === 'receiver') {
            this.closeRtc();
          } else if (this.sessionId) {
            this.sendHandshake();
          }
        }
      }
    }, HANDSHAKE_INTERVAL_MS);
  }

  private stopMaintenance(): void {
    if (this.maintenanceTimer !== null) {
      clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = null;
    }
  }

  private sendHandshake(): void {
    if (!this.connectedRoom || this.role !== 'sender' || !this.sessionId) return;
    void this.broadcast({
      type: 'BEAM_HANDSHAKE',
      roomCode: this.connectedRoom,
      sessionId: this.sessionId,
      senderName: getDeviceLabel(),
      timestamp: Date.now()
    });
  }

  private sendPing(): void {
    if (!this.connectedRoom || !this.sessionId || !this.peerSessionId) return;
    this.lastPingAt = Date.now();
    void this.broadcast({
      type: 'BEAM_PING',
      roomCode: this.connectedRoom,
      sessionId: this.sessionId,
      timestamp: this.lastPingAt
    });
  }

  private sendReady(sessionId: string): void {
    if (!this.connectedRoom || this.role !== 'receiver') return;
    void this.broadcast({
      type: 'BEAM_READY',
      roomCode: this.connectedRoom,
      sessionId,
      receiverName: getDeviceLabel(),
      docTitle: this.localDoc.title || undefined,
      pageNumber: this.localDoc.title ? this.localDoc.page : undefined,
      totalPages: this.localDoc.title ? this.localDoc.total : undefined,
      timestamp: Date.now()
    });
  }

  private sendPong(sessionId: string): void {
    if (!this.connectedRoom || !this.peerSessionId) return;
    void this.broadcast({
      type: 'BEAM_PONG',
      roomCode: this.connectedRoom,
      sessionId,
      timestamp: Date.now()
    });
  }

  private sendDisconnectBestEffort(): void {
    if (!this.connectedRoom || !this.role) return;
    const sessionId =
      this.role === 'sender' ? this.sessionId : this.peerSessionId;
    if (!sessionId) return;
    void this.broadcast({
      type: 'BEAM_DISCONNECT',
      roomCode: this.connectedRoom,
      sessionId,
      senderName: getDeviceLabel(),
      timestamp: Date.now()
    }).catch(() => {});
  }

  private finishDisconnect(): void {
    this.stopMaintenance();
    this.closeRtc();
    this.closeEventSource();
    this.resetTransfer();
    this.resetPeer();
    this.activeRoomCode = null;
    this.connectedRoom = null;
    this.role = null;
    this.sessionId = null;
    this.peerSessionId = null;
    this.setConnectionStatus('disconnected');
    this.notifyStateListeners();
  }

  private async handleRelayEvent(raw: string, generation = this.sourceGeneration): Promise<void> {
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!parsed) return;

    const messages = await this.extractRelayMessages(parsed);
    if (generation !== this.sourceGeneration) return;
    for (const message of messages) {
      if (generation !== this.sourceGeneration) return;
      await this.handleIncoming(message, 'relay');
    }
    if (generation === this.sourceGeneration && parsed.event === 'message' && typeof parsed.id === 'string') {
      this.relayCursor = parsed.id;
    }
  }

  private async extractRelayMessages(parsed: any): Promise<BeamMessage[]> {
    // Some private relays deliver the raw message object.
    if (parsed.type && parsed.roomCode && !parsed.message) {
      return [parsed as BeamMessage];
    }

    if (typeof parsed.message === 'string' && parsed.message.length > 0) {
      try {
        const inner = JSON.parse(parsed.message);
        if (inner && inner.type && inner.roomCode) {
          return [inner as BeamMessage];
        }
      } catch {
        // ntfy stores bodies larger than 4 KB as an attachment.
      }
    }

    const attachment = parsed.attachment;
    if (attachment?.url) {
      const name = String(attachment.name || '').toLowerCase();
      const isJsonLike =
        name.endsWith('.json') ||
        name.endsWith('.txt') ||
        name.endsWith('.bin') ||
        name === 'attachment' ||
        name === '';
      if (isJsonLike) {
        try {
          const text = await this.fetchAttachmentText(attachment.url);
          const inner = JSON.parse(text);
          if (inner && inner.type && inner.roomCode) {
            return [inner as BeamMessage];
          }
        } catch (error) {
          console.warn('Failed to read beam relay attachment:', error);
        }
      } else if (name.includes('.pdf')) {
        // Backwards compatibility with v1 senders. There is no session id here;
        // accept it only when this receiver has not paired a session yet.
        if (this.role !== 'receiver' || this.peerSessionId) return [];
        let title = 'document';
        try {
          title = decodeURIComponent(attachment.name).replace(/\.pdf$/i, '');
        } catch {
          title = String(attachment.name).replace(/\.pdf$/i, '');
        }
        return [
          {
            type: 'BEAM_PAYLOAD',
            roomCode: this.connectedRoom || 'BEAM',
            payload: {
              title,
              pageNumber: 1,
              totalPages: 1,
              theme: 'midnight',
              pdfUrl: attachment.url
            },
            timestamp: typeof parsed.time === 'number' ? parsed.time * 1000 : Date.now()
          }
        ];
      }
    }

    return [];
  }

  private async fetchAttachmentText(url: string): Promise<string> {
    const response = await this.fetchWithRetry(url);
    return await response.text();
  }

  private async fetchAttachmentBuffer(url: string): Promise<ArrayBuffer> {
    const response = await this.fetchWithRetry(url);
    return await response.arrayBuffer();
  }

  private async fetchWithRetry(url: string, attempts = 3): Promise<Response> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const response = await fetchWithTimeout(url, undefined, 45000);
        if (response.ok) return response;
        if (isRetryableStatus(response.status) && attempt < attempts - 1) {
          await sleep(retryDelayMs(response, attempt));
          continue;
        }
        throw new Error(`Relay returned HTTP ${response.status}.`);
      } catch (error) {
        lastError = error;
        if (attempt < attempts - 1) {
          await sleep(retryDelayMs(null, attempt));
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('Failed to download the relay attachment.');
  }

  private rememberMessage(msg: BeamMessage): boolean {
    if (!msg.msgId) return true;
    const now = Date.now();
    for (const [id, at] of this.seenMessages) {
      if (now - at > 90000) this.seenMessages.delete(id);
    }
    if (this.seenMessages.has(msg.msgId)) return false;
    this.seenMessages.set(msg.msgId, now);
    if (this.seenMessages.size > MAX_SEEN_MESSAGES) {
      const oldest = this.seenMessages.keys().next().value;
      if (typeof oldest === 'string') this.seenMessages.delete(oldest);
    }
    return true;
  }

  private async handleIncoming(message: BeamMessage, transport: BeamTransport): Promise<void> {
    if (!message || !message.type || !message.roomCode) return;
    if (!this.connectedRoom || !this.isMatchingRoom(message.roomCode, this.connectedRoom)) {
      return;
    }
    if (message.origin && message.origin === this.deviceId) return;
    if (!this.rememberMessage(message)) return;

    if (this.role === 'receiver') {
      await this.handleReceiverMessage(message, transport);
    } else if (this.role === 'sender') {
      await this.handleSenderMessage(message, transport);
    }
  }

  private async handleReceiverMessage(
    message: BeamMessage,
    transport: BeamTransport
  ): Promise<void> {
    switch (message.type) {
      case 'BEAM_HANDSHAKE': {
        if (!message.sessionId) return;
        if (this.closedSessions.has(message.sessionId)) return;
        const isNewSession =
          !this.peerSessionId || this.peerSessionId !== message.sessionId;
        if (isNewSession) {
          this.peerSessionId = message.sessionId;
          this.closeRtc();
          this.resetTransfer();
          this.rtcAttempt = 0;
          this.setPeerDocument(null, null, null);
        }
        this.lastPeerSeen = Date.now();
        this.setPeerConnected(true, message.senderName || 'Remote');
        if (this.rtcDataChannel?.readyState === 'open') {
          this.setPeerTransport('p2p');
        } else {
          this.setPeerTransport('relay');
        }
        this.sendReady(message.sessionId);
        this.notifyListeners(message, transport);
        return;
      }

      case 'BEAM_PING': {
        if (!this.isCurrentSession(message.sessionId)) return;
        this.lastPeerSeen = Date.now();
        this.setPeerConnected(true);
        this.sendPong(message.sessionId!);
        return;
      }

      case 'BEAM_RTC_OFFER': {
        if (!this.isCurrentSession(message.sessionId)) return;
        this.lastPeerSeen = Date.now();
        await this.handleRtcOffer(message);
        return;
      }

      case 'BEAM_RTC_ICE': {
        if (!this.isCurrentSession(message.sessionId)) return;
        this.lastPeerSeen = Date.now();
        await this.handleRtcIce(message);
        return;
      }

      case 'BEAM_QUERY_STATE': {
        if (!this.isCurrentSession(message.sessionId)) return;
        this.lastPeerSeen = Date.now();
        if (message.sessionId) this.sendReady(message.sessionId);
        return;
      }

      case 'BEAM_DISCONNECT': {
        if (!this.isCurrentSession(message.sessionId)) return;
        this.closedSessions.add(message.sessionId!);
        if (this.closedSessions.size > 40) this.closedSessions.delete(this.closedSessions.values().next().value!);
        this.closeRtc();
        this.resetTransfer();
        this.resetPeer();
        this.peerSessionId = null;
        this.notifyListeners(message, transport);
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
        if (!this.isCurrentSession(message.sessionId)) return;
        this.lastPeerSeen = Date.now();
        this.setPeerConnected(true);
        if (message.type === 'BEAM_PAYLOAD') {
          this.resetTransfer();
          try {
            await this.deliverDocument(message, transport);
            if (!this.isCurrentSession(message.sessionId)) return;
            this.updateTransfer({ active: false, phase: 'done', progress: 100 });
            await this.broadcast({ type: 'BEAM_DOCUMENT_RESULT', roomCode: message.roomCode,
              sessionId: message.sessionId, transferId: message.payload?.transferId, ok: true, timestamp: Date.now() });
          } catch (error) {
            if (!this.isCurrentSession(message.sessionId)) return;
            const reason = error instanceof Error ? error.message : 'The receiver could not open the PDF.';
            this.updateTransfer({ active: false, phase: 'error', error: reason });
            await this.broadcast({ type: 'BEAM_DOCUMENT_RESULT', roomCode: message.roomCode,
              sessionId: message.sessionId, transferId: message.payload?.transferId, ok: false, error: reason, timestamp: Date.now() });
          }
          return;
        }
        this.notifyListeners(message, transport);
        return;
      }

      default:
        return;
    }
  }

  private async handleSenderMessage(
    message: BeamMessage,
    _transport: BeamTransport
  ): Promise<void> {
    switch (message.type) {
      case 'BEAM_ANNOTATION_ACK':
      case 'BEAM_INK_UPDATE':
      case 'BEAM_INK_REQUEST': {
        if (!message.sessionId || message.sessionId !== this.sessionId || !this.peerState.connected) return;
        this.notifyListeners(message, _transport);
        return;
      }
      case 'BEAM_TEXT_ANNOTATIONS':
      case 'BEAM_TEXT_ANNOTATIONS_REQUEST':
      case 'BEAM_SELECTION': {
        if (!message.sessionId || message.sessionId !== this.sessionId || !this.peerState.connected) return;
        this.notifyListeners(message, _transport);
        return;
      }
      case 'BEAM_DOCUMENT_RESULT': {
        if (message.sessionId !== this.sessionId || !message.transferId) return;
        this.handleFileCompletion(message.transferId, message.ok === true, message.error);
        return;
      }
      case 'BEAM_READY': {
        if (!message.sessionId || message.sessionId !== this.sessionId) return;
        this.peerSessionId = message.sessionId;
        this.lastPeerSeen = Date.now();
        this.setPeerConnected(true, message.receiverName || 'Receiver');
        this.setPeerTransport(this.rtcDataChannel?.readyState === 'open' ? 'p2p' : 'relay');
        this.setPeerDocument(message.docTitle, message.pageNumber, message.totalPages);
        if (!this.rtcPeer) {
          void this.initiateRtc();
        }
        return;
      }

      case 'BEAM_PONG': {
        if (!message.sessionId || message.sessionId !== this.sessionId) return;
        this.lastPeerSeen = Date.now();
        this.setPeerConnected(true);
        if (!this.peerSessionId) this.peerSessionId = message.sessionId;
        return;
      }

      case 'BEAM_STATE_ANNOUNCE': {
        if (!message.sessionId || message.sessionId !== this.sessionId) return;
        this.lastPeerSeen = Date.now();
        this.setPeerConnected(true);
        this.setPeerDocument(message.docTitle, message.pageNumber, message.totalPages);
        return;
      }

      case 'BEAM_RTC_ANSWER': {
        if (!message.sessionId || message.sessionId !== this.sessionId) return;
        await this.handleRtcAnswer(message);
        return;
      }

      case 'BEAM_RTC_ICE': {
        if (!message.sessionId || message.sessionId !== this.sessionId) return;
        await this.handleRtcIce(message);
        return;
      }

      case 'BEAM_DISCONNECT': {
        if (!message.sessionId || message.sessionId !== this.sessionId) return;
        this.finishDisconnect();
        return;
      }

      case 'BEAM_HANDSHAKE':
      case 'BEAM_QUERY_STATE':
        return;

      default:
        return;
    }
  }

  private isCurrentSession(sessionId?: string): boolean {
    return Boolean(sessionId && this.peerSessionId && sessionId === this.peerSessionId);
  }

  private notifyListeners(message: BeamMessage, transport: BeamTransport): void {
    for (const listener of this.listeners) {
      try {
        const result = listener(message, transport);
        if (result) void result.catch(error => console.error('Error in beam listener:', error));
      } catch (error) {
        console.error('Error in beam listener:', error);
      }
    }
  }

  private async deliverDocument(message: BeamMessage, transport: BeamTransport): Promise<void> {
    const pending: Promise<void>[] = [];
    for (const listener of this.listeners) {
      const result = listener(message, transport);
      if (result) pending.push(result);
    }
    if (!pending.length) throw new Error('The receiving reader is not ready. Reopen Receiver and retry.');
    await Promise.all(pending);
    if (!this.isCurrentSession(message.sessionId)) throw new Error('The receiving session was cancelled.');
    this.notifyListeners({ ...message, type: 'BEAM_DOCUMENT_OPENED' }, transport);
  }

  private closeRtc(): void {
    if (this.rtcRetryTimer !== null) {
      clearTimeout(this.rtcRetryTimer);
      this.rtcRetryTimer = null;
    }
    this.remoteDescriptionSet = false;
    this.queuedIce = [];
    this.lastOfferSdp = null;

    if (this.rtcDataChannel) {
      try {
        this.rtcDataChannel.close();
      } catch {}
      this.rtcDataChannel = null;
    }
    if (this.rtcPeer) {
      try {
        this.rtcPeer.close();
      } catch {}
      this.rtcPeer = null;
    }
    this.setPeerTransport(this.peerState.connected ? 'relay' : null);
  }

  private createPeerConnection(): RTCPeerConnection | null {
    if (!this.isRtcSupported) return null;
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peer.onicecandidate = (event) => {
      if (peer !== this.rtcPeer || !event.candidate || !this.connectedRoom) return;
      const sessionId =
        this.role === 'sender' ? this.sessionId : this.peerSessionId;
      if (!sessionId) return;
      void this.broadcast({
        type: 'BEAM_RTC_ICE',
        roomCode: this.connectedRoom,
        sessionId,
        candidate: event.candidate.toJSON(),
        timestamp: Date.now()
      });
    };
    peer.onconnectionstatechange = () => {
      if (peer !== this.rtcPeer) return;
      if (peer.connectionState === 'connected') {
        this.setPeerTransport(this.rtcDataChannel?.readyState === 'open' ? 'p2p' : 'relay');
      } else if (peer.connectionState === 'failed') {
        this.setPeerTransport(this.peerState.connected ? 'relay' : null);
        this.scheduleRtcRetry();
      }
    };
    peer.oniceconnectionstatechange = () => {
      if (peer !== this.rtcPeer) return;
      if (peer.iceConnectionState === 'failed') {
        this.scheduleRtcRetry();
      }
    };
    return peer;
  }

  private scheduleRtcRetry(): void {
    if (this.role !== 'sender' || !this.peerState.connected) return;
    if (this.rtcAttempt >= RTC_MAX_ATTEMPTS) return;
    if (this.rtcRetryTimer !== null) return;
    this.rtcRetryTimer = setTimeout(() => {
      this.rtcRetryTimer = null;
      if (this.role !== 'sender' || !this.peerState.connected) return;
      void this.initiateRtc();
    }, RTC_RETRY_MS);
  }

  private async initiateRtc(): Promise<void> {
    if (!this.isRtcSupported || this.role !== 'sender' || !this.connectedRoom) return;
    if (!this.sessionId || !this.peerSessionId) return;

    this.rtcAttempt += 1;
    this.closeRtc();

    try {
      const peer = this.createPeerConnection();
      if (!peer) return;
      this.rtcPeer = peer;
      this.remoteDescriptionSet = false;
      this.queuedIce = [];

      const channel = peer.createDataChannel('otium_p2p_channel', { ordered: true });
      this.setupDataChannel(channel);

      const offer = await peer.createOffer();
      if (peer !== this.rtcPeer) return;
      await peer.setLocalDescription(offer);
      if (peer !== this.rtcPeer || peer.signalingState === 'closed') return;
      const description = peer.localDescription || offer;

      await this.broadcast({
        type: 'BEAM_RTC_OFFER',
        roomCode: this.connectedRoom,
        sessionId: this.sessionId,
        sdp: description,
        timestamp: Date.now()
      });
    } catch (error) {
      console.debug('WebRTC initiate note:', error);
      this.scheduleRtcRetry();
    }
  }

  private async handleRtcOffer(message: BeamMessage): Promise<void> {
    if (!this.isRtcSupported || !message.sdp || this.role !== 'receiver') return;
    if (!message.sessionId || message.sessionId !== this.peerSessionId) return;

    const sdp = message.sdp.sdp || '';
    if (this.rtcPeer && this.lastOfferSdp === sdp) return;
    this.lastOfferSdp = sdp;

    const earlyIce = this.queuedIce;
    this.closeRtc();
    this.queuedIce = earlyIce;
    this.lastOfferSdp = sdp;

    try {
      const peer = this.createPeerConnection();
      if (!peer) return;
      this.rtcPeer = peer;
      this.remoteDescriptionSet = false;

      peer.ondatachannel = (event) => {
        if (peer !== this.rtcPeer) return;
        this.setupDataChannel(event.channel);
      };

      await peer.setRemoteDescription(new RTCSessionDescription(message.sdp));
      if (peer !== this.rtcPeer) return;
      this.remoteDescriptionSet = true;
      await this.flushQueuedIce();

      const answer = await peer.createAnswer();
      if (peer !== this.rtcPeer) return;
      await peer.setLocalDescription(answer);
      if (peer !== this.rtcPeer || peer.signalingState === 'closed') return;
      const description = peer.localDescription || answer;

      await this.broadcast({
        type: 'BEAM_RTC_ANSWER',
        roomCode: this.connectedRoom!,
        sessionId: message.sessionId,
        sdp: description,
        timestamp: Date.now()
      });
    } catch (error) {
      console.debug('WebRTC offer handle note:', error);
    }
  }

  private async handleRtcAnswer(message: BeamMessage): Promise<void> {
    if (!this.isRtcSupported || !this.rtcPeer || !message.sdp) return;
    try {
      if (this.rtcPeer.signalingState === 'have-local-offer') {
        await this.rtcPeer.setRemoteDescription(new RTCSessionDescription(message.sdp));
        this.remoteDescriptionSet = true;
        await this.flushQueuedIce();
      }
    } catch (error) {
      console.debug('WebRTC answer handle note:', error);
    }
  }

  private async handleRtcIce(message: BeamMessage): Promise<void> {
    if (!this.isRtcSupported || !message.candidate) return;
    if (!this.rtcPeer || !this.remoteDescriptionSet) {
      if (this.queuedIce.length < 200) {
        this.queuedIce.push(message.candidate);
      }
      return;
    }
    try {
      await this.rtcPeer.addIceCandidate(new RTCIceCandidate(message.candidate));
    } catch (error) {
      console.debug('WebRTC ice candidate note:', error);
    }
  }

  private async flushQueuedIce(): Promise<void> {
    if (!this.rtcPeer || !this.remoteDescriptionSet) return;
    const queued = this.queuedIce;
    this.queuedIce = [];
    for (const candidate of queued) {
      try {
        await this.rtcPeer.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.debug('WebRTC queued ice note:', error);
      }
    }
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    this.rtcDataChannel = channel;
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = 256 * 1024;

    channel.onopen = () => {
      if (this.rtcDataChannel !== channel) return;
      this.rtcAttempt = 0;
      this.setPeerTransport('p2p');
    };

    channel.onclose = () => {
      if (this.rtcDataChannel !== channel) return;
      this.rtcDataChannel = null;
      this.setPeerTransport(this.peerState.connected ? 'relay' : null);
    };

    channel.onerror = () => {
      console.debug('Otium Beam P2P channel error; relay remains available.');
    };

    channel.onmessage = (event) => {
      if (this.rtcDataChannel !== channel) return;
      void this.handleDataChannelPayload(event.data);
    };
  }

  private async handleDataChannelPayload(data: unknown): Promise<void> {
    if (typeof data === 'string') {
      let parsed: any;
      try {
        parsed = JSON.parse(data);
      } catch {
        return;
      }
      if (!parsed) return;

      if (parsed.kind === 'file-begin') {
        this.beginIncomingFile(parsed);
        return;
      }
      if (parsed.kind === 'file-end') {
        await this.finishIncomingFile(parsed.transferId);
        return;
      }
      if (parsed.kind === 'file-cancel') {
        this.incomingFile = null;
        this.updateTransfer({ active: false, phase: 'error', error: 'The sender cancelled the transfer.' });
        return;
      }
      if (parsed.kind === 'file-complete') {
        this.handleFileCompletion(parsed.transferId, parsed.ok === true, parsed.message);
        return;
      }
      if (parsed.kind === 'file-error') {
        this.handleFileCompletion(parsed.transferId, false, parsed.message);
        return;
      }

      if (parsed.type && parsed.roomCode) {
        await this.handleIncoming(parsed as BeamMessage, 'p2p');
      }
      return;
    }

    let buffer: ArrayBuffer | null = null;
    if (data instanceof ArrayBuffer) {
      buffer = data;
    } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
      buffer = await data.arrayBuffer();
    }
    if (!buffer || !this.incomingFile) return;

    const file = this.incomingFile;
    file.parts.push(buffer);
    file.received += buffer.byteLength;

    if (file.size > 0) {
      const now = Date.now();
      if (now - file.lastProgressAt > 120 || file.received >= file.size) {
        file.lastProgressAt = now;
        this.updateTransfer({
          active: true,
          direction: 'receive',
          mode: 'p2p',
          phase: 'transferring',
          progress: Math.min(96, Math.round((file.received / file.size) * 96)),
          bytesTransferred: file.received,
          totalBytes: file.size
        });
      }
    }
  }

  private beginIncomingFile(meta: any): void {
    if (!meta || meta.sessionId !== this.peerSessionId) return;
    const size = Number(meta.size);
    if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES) {
      this.updateTransfer({
        active: false,
        phase: 'error',
        error: 'The incoming file size is invalid.'
      });
      return;
    }

    this.incomingFile = {
      transferId: String(meta.transferId || randomId('r')),
      title: String(meta.title || 'Beamed Document'),
      name: String(meta.name || 'document.pdf'),
      size,
      sha256: typeof meta.sha256 === 'string' ? meta.sha256 : undefined,
      pageNumber: Number(meta.pageNumber) || 1,
      totalPages: Number(meta.totalPages) || 1,
      theme: meta.theme || 'midnight',
      parts: [],
      received: 0,
      lastProgressAt: 0
    };

    this.updateTransfer({
      active: true,
      direction: 'receive',
      mode: 'p2p',
      phase: 'transferring',
      progress: 0,
      bytesTransferred: 0,
      totalBytes: size,
      error: null
    });
  }

  private async finishIncomingFile(transferId: string): Promise<void> {
    const file = this.incomingFile;
    if (!file || file.transferId !== transferId) return;
    this.incomingFile = null;
    const session = this.peerSessionId;

    try {
      this.updateTransfer({
        active: true,
        phase: 'finalizing',
        progress: 98,
        bytesTransferred: file.received,
        totalBytes: file.size
      });

      if (file.received !== file.size) {
        throw new Error(
          `P2P size mismatch (expected ${file.size} bytes, got ${file.received}).`
        );
      }

      const merged = mergeBuffers(file.parts);
      if (!isPdfHeader(merged)) {
        throw new Error('The received file is not a valid PDF.');
      }
      if (file.sha256) {
        const actual = await computeSha256(merged);
        if (actual && actual !== file.sha256) {
          throw new Error('P2P checksum mismatch.');
        }
      }

      const payloadMessage: BeamMessage = {
        type: 'BEAM_PAYLOAD',
        roomCode: this.connectedRoom || '',
        msgId: randomId('m'),
        sessionId: this.peerSessionId || undefined,
        origin: this.deviceId,
        payload: {
          title: file.title,
          pageNumber: file.pageNumber,
          totalPages: file.totalPages,
          theme: file.theme,
          pdfData: merged,
          totalSize: merged.byteLength,
          sha256: file.sha256,
          transferId: file.transferId
        },
        timestamp: Date.now()
      };

      if (this.peerSessionId !== session || this.role !== 'receiver') return;
      await this.deliverDocument(payloadMessage, 'p2p');
      if (this.peerSessionId !== session || this.role !== 'receiver') return;

      this.updateTransfer({
        active: false,
        phase: 'done',
        progress: 100,
        bytesTransferred: file.size,
        totalBytes: file.size
      });

      this.sendDataChannelControl({
        kind: 'file-complete',
        transferId: file.transferId,
        ok: true
      });

    } catch (error) {
      if (this.peerSessionId !== session || this.role !== 'receiver') return;
      const message = error instanceof Error ? error.message : 'P2P receive failed.';
      this.updateTransfer({ active: false, phase: 'error', error: message });
      this.sendDataChannelControl({
        kind: 'file-error',
        transferId: file.transferId,
        message
      });
    }
  }

  private sendDataChannelControl(message: Record<string, unknown>): void {
    if (!this.rtcDataChannel || this.rtcDataChannel.readyState !== 'open') return;
    try {
      this.rtcDataChannel.send(JSON.stringify(message));
    } catch {}
  }

  private handleFileCompletion(transferId: string, ok: boolean, message?: string): void {
    if (!this.fileCompletion || this.fileCompletionId !== transferId) return;
    const completion = this.fileCompletion;
    this.fileCompletion = null;
    this.fileCompletionId = null;
    clearTimeout(completion.timer);
    if (ok) {
      completion.resolve();
    } else {
      completion.reject(new BeamSendError('invalid-document', message || 'The receiver could not open the PDF.'));
    }
  }

  private resolveFileCompletion(error: Error | null): void {
    if (!this.fileCompletion) return;
    const completion = this.fileCompletion;
    this.fileCompletion = null;
    this.fileCompletionId = null;
    clearTimeout(completion.timer);
    if (error) completion.reject(error);
    else completion.resolve();
  }

  private waitForPeer(timeoutMs: number): Promise<boolean> {
    if (this.peerState.connected) return Promise.resolve(true);
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const timer = setInterval(() => {
        if (this.peerState.connected) {
          clearInterval(timer);
          resolve(true);
        } else if (Date.now() >= deadline) {
          clearInterval(timer);
          resolve(false);
        }
      }, 120);
    });
  }

  private async waitForDataChannel(timeoutMs: number): Promise<RTCDataChannel | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.rtcDataChannel?.readyState === 'open') {
        return this.rtcDataChannel;
      }
      await sleep(120);
    }
    return this.rtcDataChannel?.readyState === 'open' ? this.rtcDataChannel : null;
  }

  private async sendFileOverDataChannel(options: SendDocumentOptions): Promise<void> {
    const session = this.sessionId;
    const channel = this.rtcDataChannel;
    if (!channel || channel.readyState !== 'open') {
      throw new Error('The direct channel is not open yet.');
    }

    const transferId = randomId('t');
    const sha256 = await computeSha256(options.buffer);
    const completion = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.fileCompletionId === transferId) {
          this.fileCompletion = null;
          this.fileCompletionId = null;
          reject(new Error('The receiver did not confirm the direct transfer.'));
        }
      }, 90000);
      this.fileCompletion = { resolve, reject, timer };
      this.fileCompletionId = transferId;
    });
    void completion.catch(() => {});

    try {
      channel.send(
        JSON.stringify({
          kind: 'file-begin',
          transferId,
          sessionId: this.sessionId,
          name: options.title ? `${options.title}.pdf` : 'document.pdf',
          title: options.title,
          size: options.buffer.byteLength,
          sha256,
          pageNumber: options.pageNumber,
          totalPages: options.totalPages,
          theme: options.theme
        })
      );

      this.updateTransfer({
        active: true,
        direction: 'send',
        mode: 'p2p',
        phase: 'transferring',
        progress: 4,
        bytesTransferred: 0,
        totalBytes: options.buffer.byteLength,
        error: null
      });

      let offset = 0;
      while (offset < options.buffer.byteLength) {
        if (channel.readyState !== 'open') {
          throw new Error('The direct channel closed during transfer.');
        }
        await this.waitForChannelCapacity(channel);
        const end = Math.min(offset + P2P_CHUNK_SIZE, options.buffer.byteLength);
        channel.send(options.buffer.slice(offset, end));
        offset = end;
        this.updateTransfer({
          phase: 'transferring',
          progress: Math.min(94, 4 + Math.round((offset / options.buffer.byteLength) * 90)),
          bytesTransferred: offset
        });
      }

      channel.send(JSON.stringify({ kind: 'file-end', transferId }));
      this.updateTransfer({ phase: 'finalizing', progress: 96 });
      await completion;
      if (this.sessionId !== session || this.rtcDataChannel !== channel) {
        throw new Error('The transfer was cancelled.');
      }
      this.updateTransfer({
        active: false,
        phase: 'done',
        progress: 100,
        bytesTransferred: options.buffer.byteLength,
        totalBytes: options.buffer.byteLength
      });
    } catch (error) {
      if (this.fileCompletionId === transferId) {
        this.resolveFileCompletion(null);
      }
      this.sendDataChannelControl({ kind: 'file-cancel', transferId });
      throw error;
    }
  }

  private async waitForChannelCapacity(channel: RTCDataChannel): Promise<void> {
    while (channel.readyState === 'open' && channel.bufferedAmount > P2P_HIGH_WATER_MARK) {
      await sleep(40);
    }
  }

  private async sendFileOverRelay(options: SendDocumentOptions): Promise<void> {
    if (!this.connectedRoom) throw new Error('No active beam room.');
    const session = this.sessionId;
    const assertActive = () => {
      if (!session || this.sessionId !== session) throw new Error('The transfer was cancelled.');
    };
    const totalBytes = options.buffer.byteLength;
    const sha256 = await computeSha256(options.buffer);
    assertActive();
    const transferId = randomId('t');
    const chunkCount = Math.ceil(totalBytes / RELAY_CHUNK_SIZE);
    const baseTopic = topicForRoom(this.connectedRoom);
    const safeName = encodeURIComponent(
      (options.title || 'document').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60)
    );
    const chunks: string[] = [];

    this.updateTransfer({
      active: true,
      direction: 'send',
      mode: 'relay',
      phase: 'transferring',
      progress: 2,
      bytesTransferred: 0,
      totalBytes,
      error: null
    });

    for (let index = 0; index < chunkCount; index++) {
      const start = index * RELAY_CHUNK_SIZE;
      const end = Math.min(start + RELAY_CHUNK_SIZE, totalBytes);
      const chunk = options.buffer.slice(start, end);
      const topic = `${baseTopic}_${safeTopicPart(transferId)}_c${index}`;
      const filename = `${safeName}.part${index}`;
      const url = await this.putAttachment(topic, chunk, filename);
      assertActive();
      chunks.push(url);
      this.updateTransfer({
        phase: 'transferring',
        progress: Math.min(88, 2 + Math.round(((index + 1) / chunkCount) * 86)),
        bytesTransferred: end
      });
    }

    this.updateTransfer({ phase: 'finalizing', progress: 92 });
    const completion = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.fileCompletionId === transferId) {
          this.fileCompletion = null;
          this.fileCompletionId = null;
          reject(new Error('The receiver did not confirm opening the PDF.'));
        }
      }, 90000);
      this.fileCompletion = { resolve, reject, timer };
      this.fileCompletionId = transferId;
    });
    void completion.catch(() => {});
    await this.broadcast({
      type: 'BEAM_PAYLOAD',
      roomCode: this.connectedRoom,
      sessionId: this.sessionId || undefined,
      senderName: getDeviceLabel(),
      payload: {
        title: options.title,
        pageNumber: options.pageNumber,
        totalPages: options.totalPages,
        theme: options.theme,
        chunks,
        totalSize: totalBytes,
        sha256: sha256 || undefined,
        transferId
      },
      timestamp: Date.now()
    });

    await completion;
    assertActive();

    this.updateTransfer({
      active: false,
      phase: 'done',
      progress: 100,
      bytesTransferred: totalBytes,
      totalBytes
    });
  }

  private async putAttachment(
    topic: string,
    data: ArrayBuffer,
    filename: string
  ): Promise<string> {
    const encodedName = encodeURIComponent(filename);
    const url = `${CLOUD_RELAY_BASE}/${topic}?filename=${encodedName}`;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await fetchWithTimeout(
          url,
          {
            method: 'PUT',
            headers: {
              Filename: encodedName,
              'Content-Type': 'application/octet-stream'
            },
            body: data
          },
          60000
        );

        if (response.ok) {
          const parsed = await response.json();
          const attachmentUrl = parsed?.attachment?.url;
          if (typeof attachmentUrl === 'string' && attachmentUrl.length > 0) {
            return attachmentUrl;
          }
          throw new Error('The relay did not return an attachment URL.');
        }

        if (isRetryableStatus(response.status) && attempt < 3) {
          await sleep(retryDelayMs(response, attempt));
          continue;
        }

        if (response.status === 413) {
          throw new Error(
            'The cloud relay rejected a file chunk. The PDF may be too large for relay mode.'
          );
        }
        if (response.status === 429) {
          throw new Error(
            'The public relay is rate-limiting uploads. Wait a few seconds and retry, or keep both devices on the same Wi-Fi.'
          );
        }
        throw new Error(`The cloud relay returned HTTP ${response.status}.`);
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          await sleep(retryDelayMs(null, attempt));
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Failed to upload a file chunk to the relay.');
  }

  private async publishMessage(message: BeamMessage): Promise<boolean> {
    if (!this.connectedRoom || !isBrowserNetworkAvailable()) return false;
    const topic = topicForRoom(message.roomCode);
    const body: BeamMessage = {
      ...message,
      msgId: message.msgId || randomId('m'),
      origin: message.origin || this.deviceId,
      timestamp: message.timestamp || Date.now()
    };

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetchWithTimeout(
          `${CLOUD_RELAY_BASE}/${topic}`,
          {
            method: 'POST',
            keepalive: body.type === 'BEAM_DISCONNECT',
            headers: {
              'Content-Type': 'application/json',
              'X-Title': 'Otium Beam'
            },
            body: JSON.stringify(body)
          },
          15000
        );
        if (response.ok) return true;
        if (isRetryableStatus(response.status) && attempt === 0) {
          await sleep(retryDelayMs(response, attempt));
          continue;
        }
        return false;
      } catch (error) {
        if (attempt === 0) {
          await sleep(retryDelayMs(null, attempt));
        } else {
          console.debug('Cloud signaling transport note:', error);
        }
      }
    }
    // A failed POST used to be silently ignored; the receiver then waited
    // forever although the UI still looked connected. Surface it and kick the
    // SSE/polling recovery path immediately.
    if (this.connectedRoom) {
      this.setConnectionStatus('error');
      this.scheduleReconnect(this.sourceGeneration);
    }
    return false;
  }

  public async broadcast(message: BeamMessage): Promise<void> {
    if (!message || !message.roomCode || !message.type) return;
    const outgoing: BeamMessage = {
      ...message,
      msgId: message.msgId || randomId('m'),
      origin: message.origin || this.deviceId,
      sessionId:
        message.sessionId ||
        (this.role === 'sender' ? this.sessionId || undefined : this.peerSessionId || undefined),
      timestamp: message.timestamp || Date.now()
    };

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(outgoing);
      } catch (error) {
        console.warn('Failed to broadcast via channel:', error);
      }
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(BEAM_STORAGE_KEY, JSON.stringify(outgoing));
      } catch {}
    }

    if (
      this.rtcDataChannel?.readyState === 'open' &&
      !outgoing.type.startsWith('BEAM_RTC_')
    ) {
      try {
        this.rtcDataChannel.send(JSON.stringify(outgoing));
        // Once the direct channel is open, control traffic needs no relay.
        // Heartbeats otherwise consume the public relay quota continuously.
        if (outgoing.type !== 'BEAM_DISCONNECT') return;
      } catch (error) {
        console.debug('P2P channel send note, relay fallback active:', error);
      }
    }

    await this.publishMessage(outgoing);
  }
}

export const beamService = new BeamService();
