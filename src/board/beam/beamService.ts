import type { BeamMessage } from '../types';

const BEAM_CHANNEL_NAME = 'otium_smart_beam_channel';
const BEAM_STORAGE_KEY = 'otium_beam_last_event';

export function generateRoomCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `OTM-${code.slice(0, 3)}-${code.slice(3)}`;
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

class BeamService {
  private broadcastChannel: BroadcastChannel | null = null;
  private listeners: Set<(msg: BeamMessage) => void> = new Set();

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

  public broadcast(msg: BeamMessage) {
    this.notifyListeners(msg);

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(msg);
      } catch (err) {
        console.warn('Failed to broadcast via channel:', err);
      }
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(
          BEAM_STORAGE_KEY,
          JSON.stringify({ ...msg, _rand: Math.random() })
        );
      } catch {}
    }
  }
}

export const beamService = new BeamService();
