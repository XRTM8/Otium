import type { BeamMessage } from '../types';

export type BeamConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

const BEAM_CHANNEL_NAME = 'otium_smart_beam_channel';
const BEAM_STORAGE_KEY = 'otium_beam_last_event';
const RECENT_ROOMS_KEY = 'otium_recent_beam_rooms';
const RECEIVER_ROOM_KEY = 'otium_receiver_room_code';
const CLOUD_RELAY_BASE = 'https://ntfy.sh';

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
  private connectionStatus: BeamConnectionStatus = 'disconnected';
  private statusListeners: Set<(status: BeamConnectionStatus) => void> = new Set();
  private rtcPeer: RTCPeerConnection | null = null;
  private rtcDataChannel: RTCDataChannel | null = null;
  private isRtcSupported: boolean = typeof RTCPeerConnection !== 'undefined';

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
    void this.initiateRtc(formatted);
  }

  public disconnect(): void {
    const room = this.connectedRoom;
    if (room) {
      void this.broadcast({
        type: 'BEAM_DISCONNECT',
        roomCode: room,
        timestamp: Date.now()
      });
    }
    this.closeRtc();
    this.leaveRoom();
    this.connectedRoom = null;
    this.role = null;
    this.connectionStatus = 'disconnected';
    this.notifyStatusListeners();
    this.notifyStateListeners();
  }

  public getConnectionStatus(): BeamConnectionStatus {
    return this.connectionStatus;
  }

  public onConnectionStatusChange(callback: (status: BeamConnectionStatus) => void): () => void {
    this.statusListeners.add(callback);
    callback(this.connectionStatus);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  private notifyStatusListeners(): void {
    for (const listener of this.statusListeners) {
      try {
        listener(this.connectionStatus);
      } catch (err) {
        console.error('Error in beam status listener:', err);
      }
    }
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
    const cleanName = filename.replace(/\.pdf$/i, '').trim() || 'document';
    const safeFilename = encodeURIComponent(cleanName) + '.pdf';
    try {
      const res = await fetch(`${CLOUD_RELAY_BASE}/${topic}?filename=${safeFilename}`, {
        method: 'PUT',
        headers: {
          'Filename': safeFilename,
          'Content-Type': 'application/pdf'
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
    const cleanName = filename.replace(/\.pdf$/i, '').trim() || 'document';
    const safeName = encodeURIComponent(cleanName);

    for (let i = 0; i < chunkCount; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalBytes);
      const chunk = buffer.slice(start, end);
      const chunkTopic = `otium_beam_${clean}_c${i}`;
      const chunkName = `${safeName}.part${i}`;

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
        this.connectionStatus = 'connecting';
        this.notifyStatusListeners();

        const topic = `otium_beam_${clean}`;
        const es = new EventSource(`${CLOUD_RELAY_BASE}/${topic}/sse?since=5m`);

        es.onopen = () => {
          this.connectionStatus = 'connected';
          this.notifyStatusListeners();
          if (this.role === 'sender' && this.connectedRoom) {
            this.queryReceiverState(this.connectedRoom);
          }
        };

        es.onmessage = async (event) => {
          try {
            const parsed = JSON.parse(event.data);
            if (!parsed) return;

            // 1. Direct control message JSON (instant < 1ms, zero secondary fetch)
            if (parsed.message) {
              try {
                const innerMsg = JSON.parse(parsed.message);
                if (innerMsg && innerMsg.type && innerMsg.roomCode) {
                  this.notifyListeners(innerMsg);
                  return;
                }
              } catch {
                // If message isn't JSON string, continue to attachments
              }
            }

            // 2. Binary attachment / PDF or fallback attachment.json
            if (parsed.attachment?.url) {
              const url = parsed.attachment.url;
              const name = (parsed.attachment.name || '').toLowerCase();
              if (
                name === 'attachment.json' ||
                name.endsWith('.json') ||
                name === 'attachment.txt' ||
                name.endsWith('.txt') ||
                name === 'attachment.bin' ||
                name.endsWith('.bin')
              ) {
                try {
                  const res = await fetch(url);
                  const text = await res.text();
                  try {
                    const inner = JSON.parse(text);
                    if (inner && inner.type && inner.roomCode) {
                      this.notifyListeners(inner);
                      return;
                    }
                  } catch {}
                } catch (err) {
                  console.warn('Failed to fetch inner attachment:', err);
                }
              } else if (name.endsWith('.pdf') || name.includes('.pdf')) {
                let docTitle = 'document';
                try {
                  const rawName = parsed.attachment.name || 'document';
                  docTitle = decodeURIComponent(rawName).replace(/\.pdf$/i, '');
                } catch {
                  docTitle = (parsed.attachment.name || 'document').replace(/\.pdf$/i, '');
                }
                this.notifyListeners({
                  type: 'BEAM_PAYLOAD',
                  roomCode: this.activeRoomCode ? this.activeRoomCode.toUpperCase() : 'BEAM',
                  payload: {
                    title: docTitle,
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

            // 3. Raw message object fallback
            this.notifyListeners(parsed);
          } catch (err) {
            console.debug('Error in beam SSE message parser:', err);
          }
        };
        es.onerror = (err) => {
          this.connectionStatus = 'error';
          this.notifyStatusListeners();
          console.debug('Otium Beam SSE status:', err);
        };
        this.activeEventSource = es;
      } catch (err) {
        this.connectionStatus = 'error';
        this.notifyStatusListeners();
        console.warn('Cloud EventSource signaling fallback:', err);
      }
    }
  }

  public leaveRoom() {
    this.closeRtc();
    if (this.activeEventSource) {
      this.activeEventSource.close();
      this.activeEventSource = null;
    }
    this.activeRoomCode = null;
    this.connectionStatus = 'disconnected';
    this.notifyStatusListeners();
  }

  private closeRtc(): void {
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
  }

  private setupDataChannel(dc: RTCDataChannel): void {
    this.rtcDataChannel = dc;
    dc.onopen = () => {
      console.log('⚡ Otium Beam: Local P2P DataChannel active across Wi-Fi!');
    };
    dc.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed && parsed.type && parsed.roomCode) {
          this.notifyListeners(parsed);
        }
      } catch (err) {
        console.debug('Error in P2P message parsing:', err);
      }
    };
    dc.onclose = () => {
      if (this.rtcDataChannel === dc) {
        this.rtcDataChannel = null;
      }
    };
  }

  private async initiateRtc(roomCode: string): Promise<void> {
    if (!this.isRtcSupported) return;
    try {
      this.closeRtc();
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      this.rtcPeer = pc;

      const dc = pc.createDataChannel('otium_p2p_channel', { ordered: true });
      this.setupDataChannel(dc);

      pc.onicecandidate = (e) => {
        if (e.candidate && this.connectedRoom) {
          void this.sendRelayMessage({
            type: 'BEAM_RTC_ICE',
            roomCode: this.connectedRoom,
            candidate: e.candidate.toJSON(),
            timestamp: Date.now()
          });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await this.sendRelayMessage({
        type: 'BEAM_RTC_OFFER',
        roomCode,
        sdp: offer,
        timestamp: Date.now()
      });
    } catch (err) {
      console.debug('WebRTC initiate note:', err);
    }
  }

  private async handleRtcOffer(msg: BeamMessage): Promise<void> {
    if (!this.isRtcSupported || !msg.sdp) return;
    try {
      this.closeRtc();
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      this.rtcPeer = pc;

      pc.ondatachannel = (e) => {
        this.setupDataChannel(e.channel);
      };

      pc.onicecandidate = (e) => {
        if (e.candidate && this.connectedRoom) {
          void this.sendRelayMessage({
            type: 'BEAM_RTC_ICE',
            roomCode: this.connectedRoom,
            candidate: e.candidate.toJSON(),
            timestamp: Date.now()
          });
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (this.connectedRoom) {
        await this.sendRelayMessage({
          type: 'BEAM_RTC_ANSWER',
          roomCode: this.connectedRoom,
          sdp: answer,
          timestamp: Date.now()
        });
      }
    } catch (err) {
      console.debug('WebRTC offer handle note:', err);
    }
  }

  private async handleRtcAnswer(msg: BeamMessage): Promise<void> {
    if (!this.isRtcSupported || !this.rtcPeer || !msg.sdp) return;
    try {
      if (this.rtcPeer.signalingState === 'have-local-offer') {
        await this.rtcPeer.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      }
    } catch (err) {
      console.debug('WebRTC answer handle note:', err);
    }
  }

  private async handleRtcIce(msg: BeamMessage): Promise<void> {
    if (!this.isRtcSupported || !this.rtcPeer || !msg.candidate) return;
    try {
      await this.rtcPeer.addIceCandidate(new RTCIceCandidate(msg.candidate));
    } catch (err) {
      console.debug('WebRTC ice candidate note:', err);
    }
  }

  private async sendRelayMessage(msg: BeamMessage): Promise<void> {
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
    } catch {}
  }

  private notifyListeners(msg: BeamMessage) {
    if (!msg || !msg.type || !msg.roomCode) return;
    if (msg.type === 'BEAM_DISCONNECT' && this.connectedRoom && this.isMatchingRoom(msg.roomCode, this.connectedRoom)) {
      this.leaveRoom();
      this.connectedRoom = null;
      this.role = null;
      this.connectionStatus = 'disconnected';
      this.notifyStatusListeners();
      this.notifyStateListeners();
    }
    if (msg.type === 'BEAM_RTC_OFFER' && this.role === 'receiver' && this.isMatchingRoom(msg.roomCode, this.connectedRoom || '')) {
      void this.handleRtcOffer(msg);
    } else if (msg.type === 'BEAM_RTC_ANSWER' && this.role === 'sender' && this.isMatchingRoom(msg.roomCode, this.connectedRoom || '')) {
      void this.handleRtcAnswer(msg);
    } else if (msg.type === 'BEAM_RTC_ICE' && this.isMatchingRoom(msg.roomCode, this.connectedRoom || '')) {
      void this.handleRtcIce(msg);
    }
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

    // 0. Direct Local Wi-Fi WebRTC P2P (instant < 1ms, zero internet / quota consumed)
    if (
      this.rtcDataChannel &&
      this.rtcDataChannel.readyState === 'open' &&
      !msg.type.startsWith('BEAM_RTC_')
    ) {
      try {
        this.rtcDataChannel.send(JSON.stringify(msg));
      } catch (err) {
        console.debug('P2P channel send note, relay fallback active:', err);
      }
    }

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
