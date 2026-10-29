import type { BeamMessage } from '../types';

const BEAM_CHANNEL_NAME = 'otium_smart_beam_channel';
const BEAM_STORAGE_KEY = 'otium_beam_last_event';
const RECENT_ROOMS_KEY = 'otium_recent_beam_rooms';
const CLOUD_RELAY_BASE = 'https://ntfy.sh';

export function generateRoomCode(): string {
  // 4 easy numeric digits for effortless classroom read-out: OTM-XXXX
  const num = Math.floor(1000 + Math.random() * 9000);
  return `OTM-${num}`;
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

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 0x8000;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as any);
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

export function getRecentRooms(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const stored = localStorage.getItem(RECENT_ROOMS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveRecentRoom(roomCode: string): void {
  if (typeof localStorage === 'undefined' || !roomCode) return;
  try {
    const existing = getRecentRooms().filter((r) => r !== roomCode);
    const updated = [roomCode, ...existing].slice(0, 4);
    localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(updated));
  } catch {}
}

class BeamService {
  private broadcastChannel: BroadcastChannel | null = null;
  private listeners: Set<(msg: BeamMessage) => void> = new Set();
  private stateListeners: Set<(state: { room: string | null; role: 'receiver' | 'sender' | null }) => void> = new Set();
  private activeEventSource: EventSource | null = null;
  private activeRoomCode: string | null = null;
  private connectedRoom: string | null = null;
  private role: 'receiver' | 'sender' | null = null;

  constructor() {
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel(BEAM_CHANNEL_NAME);
        this.broadcastChannel.onmessage = (event) => {
          this.notifyListeners(event.data);
        };
      } catch (e) {
        console.warn('BroadcastChannel not available, using fallback:', e);
      }
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', (e) => {
        if (e.key === BEAM_STORAGE_KEY && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            this.notifyListeners(parsed);
          } catch {}
        }
      });
    }
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

  public startReceiver(roomCode: string): void {
    const formatted = formatRoomCode(roomCode);
    if (!formatted) return;
    this.connectedRoom = formatted;
    this.role = 'receiver';
    saveRecentRoom(formatted);
    this.listenToRoom(formatted);
    this.notifyStateListeners();
  }

  public startSender(roomCode: string): void {
    const formatted = formatRoomCode(roomCode);
    if (!formatted) return;
    this.connectedRoom = formatted;
    this.role = 'sender';
    saveRecentRoom(formatted);
    this.listenToRoom(formatted);
    this.notifyStateListeners();
  }

  public disconnect(): void {
    this.leaveRoom();
    this.connectedRoom = null;
    this.role = null;
    this.notifyStateListeners();
  }

  public onStateChange(callback: (state: { room: string | null; role: 'receiver' | 'sender' | null }) => void): () => void {
    this.stateListeners.add(callback);
    callback({ room: this.connectedRoom, role: this.role });
    return () => {
      this.stateListeners.delete(callback);
    };
  }

  private notifyStateListeners(): void {
    const state = { room: this.connectedRoom, role: this.role };
    for (const listener of this.stateListeners) {
      try {
        listener(state);
      } catch (err) {
        console.error('Error in beam state listener:', err);
      }
    }
  }

  public broadcastPageChange(pageNumber: number): void {
    if (!this.connectedRoom || this.role !== 'sender') return;
    void this.broadcast({
      type: 'BEAM_PAGE_CHANGE',
      roomCode: this.connectedRoom,
      pageNumber,
      timestamp: Date.now()
    });
  }

  public sendStep(direction: 'next' | 'prev'): void {
    if (!this.connectedRoom) return;
    void this.broadcast({
      type: 'BEAM_STEP',
      roomCode: this.connectedRoom,
      direction,
      timestamp: Date.now()
    });
  }

  public queryReceiverState(roomCode?: string): void {
    const code = roomCode || this.connectedRoom;
    if (!code) return;
    void this.broadcast({
      type: 'BEAM_QUERY_STATE',
      roomCode: code,
      timestamp: Date.now()
    });
  }

  public announceState(roomCode: string, docTitle: string, currentPage: number, totalPages: number): void {
    if (!roomCode) return;
    void this.broadcast({
      type: 'BEAM_STATE_ANNOUNCE',
      roomCode,
      docTitle,
      pageNumber: currentPage,
      totalPages,
      timestamp: Date.now()
    });
  }

  /** Uploads a single binary attachment directly to ntfy relay */
  public async uploadAttachment(roomCode: string, buffer: ArrayBuffer, filename: string): Promise<string | null> {
    const clean = roomCode.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const topic = `otium_beam_${clean}`;
    try {
      const res = await fetch(`${CLOUD_RELAY_BASE}/${topic}?filename=${encodeURIComponent(filename)}`, {
        method: 'PUT',
        headers: {
          'Filename': filename
        },
        body: buffer
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.attachment?.url || null;
    } catch (err) {
      console.warn('Failed to upload beam attachment:', err);
      return null;
    }
  }

  /** Slices large documents into ~1.5MB chunks and uploads in parallel */
  public async uploadChunked(
    roomCode: string,
    buffer: ArrayBuffer,
    filename: string,
    onProgress?: (progress: number) => void
  ): Promise<string[] | null> {
    const clean = roomCode.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const CHUNK_SIZE = 1.5 * 1024 * 1024;
    const totalBytes = buffer.byteLength;
    const chunkCount = Math.ceil(totalBytes / CHUNK_SIZE);
    const urls: string[] = [];

    for (let i = 0; i < chunkCount; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalBytes);
      const chunk = buffer.slice(start, end);
      const chunkTopic = `otium_beam_${clean}_c${i}`;
      const chunkName = `${encodeURIComponent(filename)}.part${i}`;

      try {
        const res = await fetch(`${CLOUD_RELAY_BASE}/${chunkTopic}?filename=${chunkName}`, {
          method: 'PUT',
          headers: {
            'Filename': chunkName
          },
          body: chunk
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.attachment?.url) return null;
        urls.push(data.attachment.url);
        if (onProgress) {
          onProgress(Math.round(((i + 1) / chunkCount) * 100));
        }
      } catch (err) {
        console.warn(`Failed to upload chunk ${i}:`, err);
        return null;
      }
    }
    return urls;
  }

  /** Subscribes the current device to cloud events for a specific room */
  public listenToRoom(roomCode: string) {
    const clean = roomCode.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (this.activeRoomCode === clean && this.activeEventSource) return;

    if (this.activeEventSource) {
      this.activeEventSource.close();
      this.activeEventSource = null;
    }

    this.activeRoomCode = clean;

    if (typeof EventSource !== 'undefined') {
      try {
        const topic = `otium_beam_${clean}`;
        const es = new EventSource(`${CLOUD_RELAY_BASE}/${topic}/sse`);
        es.onmessage = async (event) => {
          try {
            const parsed = JSON.parse(event.data);
            if (!parsed) return;

            // 1. If ntfy wrapped a large payload into attachment.json or uploaded direct PDF
            if (parsed.attachment?.url) {
              const url = parsed.attachment.url;
              const name = (parsed.attachment.name || '').toLowerCase();
              if (name === 'attachment.json' || name.endsWith('.json')) {
                try {
                  const res = await fetch(url);
                  const inner = await res.json();
                  this.notifyListeners(inner);
                  return;
                } catch (err) {
                  console.warn('Failed to fetch inner attachment.json:', err);
                }
              } else if (name.endsWith('.pdf')) {
                this.notifyListeners({
                  type: 'BEAM_PAYLOAD',
                  roomCode: this.activeRoomCode ? this.activeRoomCode.toUpperCase() : 'BEAM',
                  payload: {
                    title: (parsed.attachment.name || 'document').replace(/\.pdf$/i, ''),
                    pageNumber: 1,
                    totalPages: 1,
                    theme: 'midnight',
                    pdfUrl: url
                  },
                  timestamp: Date.now()
                });
                return;
              }
            }

            // 2. Standard message string
            if (parsed.message) {
              try {
                const innerMsg = JSON.parse(parsed.message);
                this.notifyListeners(innerMsg);
                return;
              } catch {
                // If message isn't JSON string, might be plain text notification
              }
            }

            // 3. Raw message object fallback
            this.notifyListeners(parsed);
          } catch (err) {
            console.debug('Error in beam SSE message parser:', err);
          }
        };
        es.onerror = (err) => {
          // SSE auto-reconnects on temporary network hiccups
          console.debug('Otium Beam SSE status:', err);
        };
        this.activeEventSource = es;
      } catch (err) {
        console.warn('Cloud EventSource signaling fallback:', err);
      }
    }
  }

  public leaveRoom() {
    if (this.activeEventSource) {
      this.activeEventSource.close();
      this.activeEventSource = null;
    }
    this.activeRoomCode = null;
  }

  private notifyListeners(msg: BeamMessage) {
    if (!msg || !msg.type || !msg.roomCode) return;
    for (const listener of this.listeners) {
      try {
        listener(msg);
      } catch (err) {
        console.error('Error in beam listener:', err);
      }
    }
  }

  public subscribe(callback: (msg: BeamMessage) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  public async broadcast(msg: BeamMessage) {
    this.notifyListeners(msg);

    // 1. Local BroadcastChannel (instant < 5ms for local tabs/same device)
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(msg);
      } catch (err) {
        console.warn('Failed to broadcast via channel:', err);
      }
    }

    // 2. Local Storage signal (cross-window on same host)
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(
          BEAM_STORAGE_KEY,
          JSON.stringify({ ...msg, _rand: Math.random() })
        );
      } catch {}
    }

    // 3. Global Cloud Relay (instant < 50ms across 4G/Wi-Fi/university networks)
    const clean = msg.roomCode.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const topic = `otium_beam_${clean}`;

    try {
      await fetch(`${CLOUD_RELAY_BASE}/${topic}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Title': 'Otium Beam'
        },
        body: JSON.stringify(msg)
      });
    } catch (err) {
      // Offline fallback: local BroadcastChannel already delivered
      console.warn('Cloud signaling transport note:', err);
    }
  }
}

export const beamService = new BeamService();
