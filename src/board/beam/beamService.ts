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
  private activeEventSource: EventSource | null = null;
  private activeRoomCode: string | null = null;

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
        es.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data);
            if (parsed && parsed.message) {
              const innerMsg = JSON.parse(parsed.message);
              this.notifyListeners(innerMsg);
            }
          } catch {
            // Raw message fallback
            try {
              const rawMsg = JSON.parse(event.data);
              this.notifyListeners(rawMsg);
            } catch {}
          }
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
