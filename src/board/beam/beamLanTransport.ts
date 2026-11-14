import { Channel, invoke } from '@tauri-apps/api/core';
import { arrayBufferToBase64, base64ToArrayBuffer } from './beamUtils';

export interface BeamDirectChannel {
  readonly readyState: RTCDataChannelState;
  readonly bufferedAmount: number;
  send(data: string | ArrayBuffer): void;
  close(): void;
}

export type LanInvitation = { addresses: string[]; port: number; key: string };
type LanEvent = { type: 'connected' | 'disconnected' } | { type: 'frame'; message: string };
export type LanTarget = { address: string; port: number; key: string };

const LAN_CODE = /^(?:OTIUM-LAN:)?((?:\d{1,3}\.){3}\d{1,3}):(\d{1,5})\/([0-9a-f]{64})$/i;
let lastSessionId = 0;

export function parseLanTarget(code: string): LanTarget | null {
  const match = LAN_CODE.exec(code.trim());
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const address = match[1];
  const [a, b, c, d] = address.split('.').map(Number);
  if (a === undefined || b === undefined || c === undefined || d === undefined ||
      address !== [a, b, c, d].join('.') || Math.max(a, b, c, d) > 255) return null;
  if (a !== 10 && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && b === 168) &&
      !(a === 169 && b === 254) && !(a === 100 && b >= 64 && b < 128)) return null;
  const port = Number(match[2]);
  return port > 0 && port <= 65535 ? { address, port, key: match[3].toUpperCase() } : null;
}

export function lanPairingCode(target: LanTarget): string {
  return `OTIUM-LAN:${target.address}:${target.port}/${target.key}`;
}

export function lanRoomCode(key: string): string {
  return `LAN${key.slice(0, 24)}`;
}

export interface SavedLanTarget {
  address: string;
  port: number;
  key: string;
  code: string;
  timestamp: number;
}

const RECENT_LAN_TARGETS_KEY = 'otium-beam:recent-lan-targets';

export function getRecentLanTargets(): SavedLanTarget[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_LAN_TARGETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is SavedLanTarget => {
        return (
          item &&
          typeof item === 'object' &&
          typeof item.address === 'string' &&
          typeof item.port === 'number' &&
          typeof item.key === 'string' &&
          typeof item.code === 'string'
        );
      })
      .slice(0, 4);
  } catch {
    return [];
  }
}

export function saveRecentLanTarget(target: LanTarget | string): void {
  if (typeof localStorage === 'undefined') return;
  const parsed = typeof target === 'string' ? parseLanTarget(target) : target;
  if (!parsed) return;
  const code = typeof target === 'string' && target.startsWith('OTIUM-LAN:') ? target : lanPairingCode(parsed);
  try {
    const existing = getRecentLanTargets().filter((t) => t.address !== parsed.address || t.port !== parsed.port);
    const updated: SavedLanTarget[] = [
      {
        address: parsed.address,
        port: parsed.port,
        key: parsed.key,
        code,
        timestamp: Date.now(),
      },
      ...existing,
    ].slice(0, 4);
    localStorage.setItem(RECENT_LAN_TARGETS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('[BeamLan] Failed to save recent LAN target:', err);
  }
}

export function clearRecentLanTargets(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(RECENT_LAN_TARGETS_KEY);
  } catch (err) {
    console.warn('[BeamLan] Failed to clear recent LAN targets:', err);
  }
}

class NativeDirectChannel implements BeamDirectChannel {
  readyState: RTCDataChannelState = 'open';
  bufferedAmount = 0;
  private pending = Promise.resolve();
  private readonly id: number;
  private readonly onFailure: () => void;

  constructor(id: number, onFailure: () => void) {
    this.id = id;
    this.onFailure = onFailure;
  }

  send(data: string | ArrayBuffer) {
    if (this.readyState !== 'open') throw new Error('The LAN connection is closed.');
    const frame = typeof data === 'string' ? `j${data}` : `b${arrayBufferToBase64(data)}`;
    this.bufferedAmount += frame.length;
    this.pending = this.pending.then(async () => {
      if (this.readyState === 'open') await invoke('beam_lan_send', { id: this.id, frame });
    }).catch(() => {
      if (this.readyState !== 'open') return;
      this.close();
      this.onFailure();
    }).finally(() => { this.bufferedAmount -= frame.length; });
  }

  close() { this.readyState = 'closed'; }
}

export class BeamLanTransport {
  private readonly id = lastSessionId = Math.max(lastSessionId + 1, Date.now() * 100);
  private stopped = false;
  private currentChannel: NativeDirectChannel | null = null;
  private readonly events: Channel<LanEvent>;

  constructor(onConnection: (channel: BeamDirectChannel | null) => void, onFrame: (frame: string | ArrayBuffer) => void) {
    this.events = new Channel(event => {
      if (this.stopped) return;
      if (event.type === 'connected') {
        const channel = new NativeDirectChannel(this.id, () => {
          if (this.currentChannel === channel) {
            this.stop();
            onConnection(null);
          }
        });
        this.currentChannel = channel;
        onConnection(channel);
      } else if (event.type === 'disconnected') {
        this.currentChannel?.close();
        this.currentChannel = null;
        onConnection(null);
      } else if (event.type === 'frame' && this.currentChannel?.readyState === 'open') {
        if (event.message.startsWith('j')) onFrame(event.message.slice(1));
        else if (event.message.startsWith('b')) {
          try { onFrame(base64ToArrayBuffer(event.message.slice(1))); }
          catch { this.stop(); onConnection(null); }
        }
      }
    });
  }

  listen() { return invoke<LanInvitation>('beam_lan_listen', { id: this.id, events: this.events }); }

  connect(target: LanTarget) {
    return invoke<void>('beam_lan_connect', { ...target, id: this.id, events: this.events });
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.currentChannel?.close();
    this.currentChannel = null;
    void invoke('beam_lan_stop', { id: this.id }).catch(() => {});
  }
}
