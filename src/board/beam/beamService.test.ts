import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  beamService,
  BeamService,
  buildBeamLink,
  computeSha256,
  formatRoomCode,
  generateNewReceiverRoomCode,
  generateRoomCode,
  getPersistentReceiverRoomCode,
  getRecentRooms,
  looksLikePdfBuffer,
  mergeArrayBuffers,
  parseBeamLaunch,
  saveRecentRoom
} from './beamService';
import type { BeamMessage } from '../types';

const PDF_BYTES = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3
]);

function pdfBuffer(): ArrayBuffer {
  return PDF_BYTES.slice().buffer;
}

function resetService(): void {
  beamService.disconnect();
  // Private runtime state is reset by disconnect; clear any test-only session.
  (beamService as any).seenMessages.clear();
}

afterEach(() => {
  resetService();
});

describe('Otium Smart Beam room codes', () => {
  it('generates a cryptographically random room code with 60 bits of entropy', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^OTM-[A-HJ-NP-Z2-9]{12}$/);
  });

  it('formats raw codes and numbers into standardized OTM-XXXX', () => {
    expect(formatRoomCode('5678')).toBe('OTM-5678');
    expect(formatRoomCode('otm5678')).toBe('OTM-5678');
    expect(formatRoomCode('OTM-5678')).toBe('OTM-5678');
    expect(formatRoomCode(' room-123 ')).toBe('ROOM123');
    expect(formatRoomCode('')).toBe('');
  });

  it('accurately matches room codes case-insensitively ignoring dashes', () => {
    expect(beamService.isMatchingRoom('otm-1234', 'OTM1234')).toBe(true);
    expect(beamService.isMatchingRoom('OTM-4567', 'otm-4567')).toBe(true);
    expect(beamService.isMatchingRoom('OTM-1111', 'OTM-2222')).toBe(false);
  });

  it('maintains persistent receiver room code across invocations and regenerates on request', () => {
    const code1 = getPersistentReceiverRoomCode();
    expect(code1).toMatch(/^OTM-[A-HJ-NP-Z2-9]{12}$/);

    const code2 = getPersistentReceiverRoomCode();
    expect(code2).toBe(code1);

    const fresh = generateNewReceiverRoomCode();
    expect(fresh).toMatch(/^OTM-[A-HJ-NP-Z2-9]{12}$/);
    expect(getPersistentReceiverRoomCode()).toBe(fresh);
  });
  it('replaces weak saved defaults while still accepting manually entered legacy codes', () => {
    localStorage.setItem('otium_receiver_room_code', 'OTM-1234');
    expect(getPersistentReceiverRoomCode()).toMatch(/^OTM-[A-HJ-NP-Z2-9]{12}$/);
    expect(formatRoomCode('1234')).toBe('OTM-1234');
  });
  it('does not let a second session replace an actively paired presenter', async () => {
    const receiver = new BeamService() as any;
    receiver.connectedRoom = 'OTM-1234'; receiver.role = 'receiver'; receiver.peerSessionId = 'paired'; receiver.peerState.connected = true;
    try {
      await receiver.handleIncoming({ type: 'BEAM_HANDSHAKE', roomCode: 'OTM-1234', sessionId: 'different', timestamp: Date.now() }, 'relay');
      expect(receiver.peerSessionId).toBe('paired');
    } finally { receiver.disconnect(); }
  });
  it('rejects oversized or untrusted relay manifests before fetching anything', async () => {
    await expect(beamService.downloadRelayChunks(['https://127.0.0.1/private'])).rejects.toThrow('Untrusted');
    await expect(beamService.downloadRelayChunks(Array(500).fill('https://ntfy.tedomum.fr/file/a'))).rejects.toThrow();
    await expect(beamService.downloadRelayChunks(['https://ntfy.tedomum.fr/file/a'], 999_000_000)).rejects.toThrow('size');
  });
});

describe('Otium Smart Beam launch links', () => {
  it('parses a receiver link from the hash without treating it as a sender', () => {
    expect(parseBeamLaunch('#/beam?room=OTM-1234&role=receive', '')).toEqual({
      room: 'OTM-1234',
      role: 'receiver',
      auto: true
    });
  });

  it('parses sender links from a legacy query string', () => {
    expect(parseBeamLaunch('', '?room=5678&role=send')).toEqual({
      room: 'OTM-5678',
      role: 'sender',
      auto: true
    });
  });

  it('understands mode/target aliases and bare typed codes', () => {
    expect(parseBeamLaunch('#/beam?room=1234&mode=board', '').role).toBe('receiver');
    expect(parseBeamLaunch('#/beam?room=1234&target=phone', '').role).toBe('sender');
    expect(parseBeamLaunch('#/beam?OTM-9876', '').room).toBe('OTM-9876');
  });

  it('recognizes a beam route without parameters', () => {
    expect(parseBeamLaunch('#/beam', '')).toEqual({
      room: null,
      role: null,
      auto: true
    });
    expect(parseBeamLaunch('', '')).toEqual({ room: null, role: null, auto: false });
  });

  it('builds an explicit smartboard receiver link', () => {
    const link = buildBeamLink('otm1234', 'sender');
    expect(link).toContain('#/beam?room=OTM-1234');
    expect(link).toContain('role=send');
    expect(buildBeamLink('OTM-1234', 'receiver')).toContain('role=receive');
  });
});

describe('Otium Smart Beam binary helpers', () => {
  it('preserves binary byte integrity across base64 round-trip', () => {
    const originalBytes = new Uint8Array([0, 1, 2, 255, 128, 64, 32, 16, 8, 4, 2, 1]);
    const base64 = arrayBufferToBase64(originalBytes.buffer);
    const restoredBuffer = base64ToArrayBuffer(base64);
    const restoredBytes = new Uint8Array(restoredBuffer);

    expect(restoredBytes.length).toBe(originalBytes.length);
    for (let i = 0; i < originalBytes.length; i++) {
      expect(restoredBytes[i]).toBe(originalBytes[i]);
    }
  });

  it('merges relay chunks in order', () => {
    const first = new Uint8Array([1, 2, 3]).buffer;
    const second = new Uint8Array([4, 5]).buffer;
    expect(Array.from(new Uint8Array(mergeArrayBuffers([first, second])))).toEqual([
      1, 2, 3, 4, 5
    ]);
  });

  it('detects PDF headers and computes a stable sha256', async () => {
    expect(looksLikePdfBuffer(pdfBuffer())).toBe(true);
    expect(looksLikePdfBuffer(new Uint8Array([1, 2, 3, 4, 5]).buffer)).toBe(false);

    const hash = await computeSha256(pdfBuffer());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await computeSha256(pdfBuffer())).toBe(hash);
  });
});

describe('Otium Smart Beam session routing', () => {
  it('also relays an explicit disconnect before closing an open direct channel', async () => {
    const sender = new BeamService() as any;
    sender.connectedRoom = 'OTM-1234'; sender.role = 'sender'; sender.sessionId = 'paired';
    sender.rtcDataChannel = { readyState: 'open', send: vi.fn(), close: vi.fn() };
    const publish = vi.spyOn(sender, 'publishMessage').mockResolvedValue(true);
    try {
      await sender.broadcast({ type: 'BEAM_DISCONNECT', roomCode: 'OTM-1234', sessionId: 'paired', timestamp: Date.now() });
      expect(sender.rtcDataChannel.send).toHaveBeenCalledOnce();
      expect(publish).toHaveBeenCalledOnce();
    } finally { publish.mockRestore(); sender.disconnect(); }
  });

  it.each(['BEAM_INK_UPDATE', 'BEAM_TEXT_ANNOTATIONS', 'BEAM_SELECTION', 'BEAM_ANNOTATION_ACK'])('routes %s only within the active paired session', async (type) => {
    const sender = new BeamService() as any;
    sender.connectedRoom = 'OTM-1234'; sender.role = 'sender'; sender.sessionId = 'paired';
    sender.peerState = { ...sender.peerState, connected: true };
    const listener = vi.fn();
    sender.subscribe(listener);
    const message = { type, roomCode: 'OTM-1234', timestamp: Date.now(), ink: { documentId: 'book', upsert: [] } };
    try {
      await sender.handleIncoming({ ...message, sessionId: 'old' }, 'p2p');
      expect(listener).not.toHaveBeenCalled();
      await sender.handleIncoming({ ...message, sessionId: 'paired' }, 'p2p');
      expect(listener).toHaveBeenCalledOnce();
    } finally { sender.disconnect(); }
  });

  it('keeps relay sending pending until the receiver confirms opening', async () => {
    const sender = new BeamService() as any;
    sender.connectedRoom = 'OTM-1234'; sender.role = 'sender'; sender.sessionId = 'paired';
    const upload = vi.spyOn(sender, 'putAttachment').mockResolvedValue('https://ntfy.sh/test.pdf');
    let published!: () => void;
    const reachedReceiver = new Promise<void>(resolve => { published = resolve; });
    const broadcast = vi.spyOn(sender, 'broadcast').mockImplementation(async () => { published(); });
    try {
      const sending = sender.sendFileOverRelay({ buffer: pdfBuffer(), title: 'Test', pageNumber: 1, totalPages: 1, theme: 'midnight' });
      await reachedReceiver;
      expect(sender.getTransferState().phase).toBe('finalizing');
      expect(sender.getTransferState().progress).toBeLessThan(100);
      sender.handleFileCompletion(sender.fileCompletionId, true);
      await sending;
      expect(sender.getTransferState().phase).toBe('done');
    } finally { upload.mockRestore(); broadcast.mockRestore(); sender.disconnect(); }
  });

  it('does not acknowledge PDF bytes until the receiving reader opens them', async () => {
    const receiver = new BeamService() as any;
    receiver.connectedRoom = 'OTM-1234'; receiver.role = 'receiver'; receiver.peerSessionId = 'paired';
    const send = vi.fn();
    receiver.rtcDataChannel = { readyState: 'open', close: vi.fn(), send };
    let opened!: () => void;
    receiver.subscribe((message: BeamMessage) => message.type === 'BEAM_PAYLOAD'
      ? new Promise<void>(resolve => { opened = resolve; }) : undefined);
    receiver.incomingFile = { transferId: 'file', title: 'Test', size: PDF_BYTES.length,
      received: PDF_BYTES.length, parts: [pdfBuffer()], pageNumber: 1, totalPages: 1, theme: 'midnight' };
    try {
      const pending = receiver.finishIncomingFile('file');
      expect(send).not.toHaveBeenCalled();
      expect(receiver.getTransferState().phase).toBe('finalizing');
      opened();
      await pending;
      expect(JSON.parse(send.mock.calls[0][0])).toMatchObject({ kind: 'file-complete', ok: true });
      expect(receiver.getTransferState().phase).toBe('done');
    } finally { receiver.disconnect(); }
  });

  it('reports reader failure to a relay sender instead of success', async () => {
    const receiver = new BeamService() as any;
    receiver.connectedRoom = 'OTM-1234'; receiver.role = 'receiver'; receiver.peerSessionId = 'paired';
    const broadcast = vi.spyOn(receiver, 'broadcast').mockResolvedValue(undefined);
    receiver.subscribe(async () => { throw new Error('PDF cannot be opened'); });
    try {
      await receiver.handleIncoming({ type: 'BEAM_PAYLOAD', roomCode: 'OTM-1234', sessionId: 'paired',
        timestamp: Date.now(), payload: { title: 'Test', transferId: 'file' } }, 'relay');
      expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({
        type: 'BEAM_DOCUMENT_RESULT', transferId: 'file', ok: false, error: 'PDF cannot be opened'
      }));
      expect(receiver.getTransferState().phase).toBe('error');
    } finally { broadcast.mockRestore(); receiver.disconnect(); }
  });

  it('does not claim success when no receiving reader is mounted', async () => {
    const receiver = new BeamService() as any;
    receiver.connectedRoom = 'OTM-1234'; receiver.role = 'receiver'; receiver.peerSessionId = 'paired';
    try {
      await expect(receiver.deliverDocument({ type: 'BEAM_PAYLOAD', sessionId: 'paired' }, 'p2p'))
        .rejects.toThrow('not ready');
    } finally { receiver.disconnect(); }
  });

  it('transfers PDF bytes and waits for receiver confirmation over a direct channel', async () => {
    const sender = new BeamService() as any;
    const receiver = new BeamService() as any;
    sender.connectedRoom = receiver.connectedRoom = 'OTM-1234';
    sender.role = 'sender'; receiver.role = 'receiver';
    sender.sessionId = receiver.peerSessionId = 'paired';
    sender.rtcDataChannel = {
      readyState: 'open', bufferedAmount: 0, close: vi.fn(),
      send: (data: unknown) => { void receiver.handleDataChannelPayload(data); }
    };
    receiver.rtcDataChannel = {
      readyState: 'open', close: vi.fn(),
      send: (data: unknown) => { void sender.handleDataChannelPayload(data); }
    };
    const received = vi.fn(async () => {});
    receiver.subscribe(received);
    try {
      await sender.sendFileOverDataChannel({ buffer: pdfBuffer(), title: 'Test', pageNumber: 1, totalPages: 1, theme: 'midnight' });
      expect(received).toHaveBeenCalledTimes(2);
      const payload = received.mock.calls[0][0].payload;
      expect(new Uint8Array(payload.pdfData)).toEqual(PDF_BYTES);
      expect(sender.getTransferState().phase).toBe('done');
    } finally { sender.disconnect(); receiver.disconnect(); }
  });

  it('does not start a relay upload after cancellation while waiting for a peer', async () => {
    const service = beamService as any;
    let release!: (ready: boolean) => void;
    const waiting = vi.spyOn(service, 'waitForPeer').mockReturnValue(new Promise<boolean>(resolve => { release = resolve; }));
    const relay = vi.spyOn(service, 'sendFileOverRelay');
    try {
      const pending = beamService.sendDocument({ roomCode: 'OTM-1234', buffer: pdfBuffer(), title: 'Test', pageNumber: 1, totalPages: 1, theme: 'midnight' });
      const rejected = expect(pending).rejects.toThrow('cancelled');
      beamService.disconnect();
      release(true);
      await rejected;
      expect(relay).not.toHaveBeenCalled();
      expect(beamService.getTransferState().phase).toBe('idle');
    } finally { waiting.mockRestore(); relay.mockRestore(); }
  });

  it('preserves candidates delivered before the RTC offer', async () => {
    const service = beamService as any;
    const supported = service.isRtcSupported;
    service.isRtcSupported = true;
    beamService.startReceiver('OTM-1234');
    service.peerSessionId = 'live';
    const candidate = { candidate: 'candidate:early' };
    const peer = {
      setRemoteDescription: vi.fn().mockResolvedValue(undefined),
      addIceCandidate: vi.fn().mockResolvedValue(undefined),
      createAnswer: vi.fn().mockResolvedValue({ type: 'answer', sdp: 'answer' }),
      setLocalDescription: vi.fn().mockResolvedValue(undefined), close: vi.fn()
    };
    const create = vi.spyOn(service, 'createPeerConnection').mockReturnValue(peer);
    const broadcast = vi.spyOn(beamService, 'broadcast').mockResolvedValue(undefined);
    vi.stubGlobal('RTCSessionDescription', class { constructor(value: unknown) { return value as any; } });
    vi.stubGlobal('RTCIceCandidate', class { constructor(value: unknown) { return value as any; } });
    try {
      await service.handleRtcIce({ candidate });
      await service.handleRtcOffer({ sessionId: 'live', sdp: { sdp: 'offer' } });
      expect(peer.addIceCandidate).toHaveBeenCalledWith(candidate);
      expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: 'BEAM_RTC_ANSWER' }));
    } finally {
      create.mockRestore(); broadcast.mockRestore();
      service.isRtcSupported = supported;
      vi.unstubAllGlobals();
    }
  });

  it('ignores relay downloads that finish after cancellation', async () => {
    const service = beamService as any;
    beamService.startReceiver('OTM-1234');
    let release!: (messages: BeamMessage[]) => void;
    const extract = vi.spyOn(service, 'extractRelayMessages').mockReturnValue(
      new Promise<BeamMessage[]>((resolve) => { release = resolve; })
    );
    const incoming = vi.spyOn(service, 'handleIncoming');
    try {
      const pending = service.handleRelayEvent('{}');
      beamService.disconnect();
      beamService.startReceiver('OTM-1234');
      release([{ type: 'BEAM_HANDSHAKE', roomCode: 'OTM-1234', sessionId: 'old', timestamp: Date.now() }]);
      await pending;
      expect(incoming).not.toHaveBeenCalled();
      expect(beamService.getPeerState().connected).toBe(false);
    } finally { extract.mockRestore(); incoming.mockRestore(); }
  });

  it('polls buffered signaling and advances its cursor without replaying the cache', async () => {
    vi.useFakeTimers();
    const service = beamService as any;
    service.activeRoomCode = 'otm1234';
    service.connectedRoom = 'OTM-1234';
    service.role = 'receiver';
    service.relayCursor = '30s';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () =>
      JSON.stringify({ event: 'message', id: 'cursor-1', message: '{}' })
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await service.pollRoom(service.sourceGeneration);
      expect(beamService.getConnectionStatus()).toBe('connected');
      await vi.advanceTimersByTimeAsync(5000);
      expect(fetchMock.mock.calls[1][0]).toContain('since=cursor-1');
      beamService.disconnect();
      await vi.advanceTimersByTimeAsync(10000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      beamService.disconnect(); vi.unstubAllGlobals(); vi.useRealTimers();
    }
  });

  it('times out a stalled signaling connection and ignores callbacks after cancel', () => {
    vi.useFakeTimers();
    const sources: any[] = [];
    class FakeEventSource {
      onopen: (() => void) | null = null;
      onmessage: unknown = null;
      onerror: unknown = null;
      close = vi.fn();
      constructor() { sources.push(this); }
    }
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '' }));
    try {
      beamService.startReceiver('OTM-1234');
      expect(beamService.getConnectionStatus()).toBe('connecting');
      vi.advanceTimersByTime(15000);
      expect(beamService.getConnectionStatus()).toBe('connecting');
      expect(sources[0].close).toHaveBeenCalled();
      beamService.disconnect();
      sources[0].onopen();
      vi.advanceTimersByTime(30000);
      expect(beamService.getConnectionStatus()).toBe('disconnected');
      expect(sources).toHaveLength(1);
    } finally {
      beamService.disconnect();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('keeps the cloud in recovery while early polling retries fail, then reports a real failure', async () => {
    vi.useFakeTimers();
    const service = new BeamService() as any;
    service.activeRoomCode = 'otm1234'; service.connectedRoom = 'OTM-1234'; service.role = 'receiver';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));
    try {
      await service.pollRoom(service.sourceGeneration);
      expect(service.getConnectionStatus()).toBe('connecting');
      await service.pollRoom(service.sourceGeneration);
      expect(service.getConnectionStatus()).toBe('connecting');
      await service.pollRoom(service.sourceGeneration);
      expect(service.getConnectionStatus()).toBe('error');
    } finally { service.disconnect(); vi.unstubAllGlobals(); vi.useRealTimers(); }
  });

  it('retries cloud signaling without discarding the active room or role', () => {
    const service = new BeamService() as any;
    service.activeRoomCode = 'otm1234'; service.connectedRoom = 'OTM-1234'; service.role = 'receiver';
    const open = vi.spyOn(service, 'openEventSource').mockImplementation(() => {});
    const close = vi.spyOn(service, 'closeEventSource').mockImplementation(() => {});
    try {
      service.retryCloudConnection();
      expect(close).toHaveBeenCalledOnce();
      expect(open).toHaveBeenCalledOnce();
      expect(service.getConnectionStatus()).toBe('connecting');
      expect(service.connectedRoom).toBe('OTM-1234');
      expect(service.role).toBe('receiver');
    } finally { open.mockRestore(); close.mockRestore(); service.disconnect(); }
  });

  it('falls back to HTTPS polling when an older WebView has no EventSource', async () => {
    const service = new BeamService() as any;
    service.activeRoomCode = 'otm1234'; service.connectedRoom = 'OTM-1234'; service.role = 'receiver';
    const poll = vi.spyOn(service, 'pollRoom').mockResolvedValue(undefined);
    const original = (globalThis as any).EventSource;
    try {
      vi.stubGlobal('EventSource', undefined);
      service.openEventSource();
      expect(service.getConnectionStatus()).toBe('connecting');
      expect(poll).toHaveBeenCalledWith(service.sourceGeneration);
    } finally {
      poll.mockRestore();
      if (original === undefined) vi.unstubAllGlobals(); else vi.stubGlobal('EventSource', original);
      service.disconnect();
    }
  });

  it('sends disconnect over the direct channel before closing it', () => {
    const service = beamService as any;
    service.connectedRoom = 'OTM-1234';
    service.role = 'sender';
    service.sessionId = 'current-session';
    const send = vi.fn();
    const close = vi.fn();
    service.rtcDataChannel = { readyState: 'open', send, close };

    beamService.disconnect();

    expect(send).toHaveBeenCalledOnce();
    expect(JSON.parse(send.mock.calls[0][0])).toMatchObject({
      type: 'BEAM_DISCONNECT', sessionId: 'current-session'
    });
    expect(close).toHaveBeenCalledOnce();
    expect(beamService.getConnectionStatus()).toBe('disconnected');
    expect(beamService.getPeerState().connected).toBe(false);
  });

  it('does not publish direct heartbeats to the cloud relay', async () => {
    const service = beamService as any;
    const publish = vi.spyOn(service, 'publishMessage');
    service.rtcDataChannel = { readyState: 'open', send: vi.fn(), close: vi.fn() };
    try {
      await beamService.broadcast({
        type: 'BEAM_PING', roomCode: 'OTM-1234', timestamp: Date.now()
      });
      expect(publish).not.toHaveBeenCalled();
    } finally {
      publish.mockRestore();
    }
  });

  it('manages sender and receiver roles and notifies state listeners', () => {
    const states: Array<{ room: string | null; role: string | null }> = [];
    const unsub = beamService.onStateChange((st) => states.push(st));

    beamService.startReceiver('OTM-1234');
    expect(beamService.getConnectedRoom()).toBe('OTM-1234');
    expect(beamService.getRole()).toBe('receiver');

    beamService.startSender('OTM-9999');
    expect(beamService.getConnectedRoom()).toBe('OTM-9999');
    expect(beamService.getRole()).toBe('sender');

    beamService.disconnect();
    expect(beamService.getConnectedRoom()).toBeNull();
    expect(beamService.getRole()).toBeNull();

    expect(states.length).toBeGreaterThanOrEqual(4);
    unsub();
  });

  it('starts the receiver only once when the same room is requested repeatedly', () => {
    const states: Array<{ room: string | null; role: string | null }> = [];
    const unsub = beamService.onStateChange((st) => states.push(st));

    beamService.startReceiver('OTM-1234');
    const afterFirst = states.length;
    beamService.startReceiver('OTM-1234');
    beamService.startReceiver('otm-1234');
    expect(states.length).toBe(afterFirst);
    expect(beamService.getRole()).toBe('receiver');

    unsub();
  });

  it('broadcasts page changes only for an established sender session', async () => {
    const spy = vi.spyOn(beamService, 'broadcast').mockResolvedValue(undefined);

    beamService.startReceiver('OTM-1234');
    beamService.broadcastPageChange(5);
    expect(spy).not.toHaveBeenCalled();

    resetService();
    beamService.startSender('OTM-1234');
    spy.mockClear();
    // No acknowledged peer yet: page changes must not be sent.
    beamService.broadcastPageChange(5);
    expect(spy).not.toHaveBeenCalled();

    (beamService as any).peerSessionId = 'peer-session';
    beamService.broadcastPageChange(5);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'BEAM_PAGE_CHANGE',
        roomCode: 'OTM-1234',
        pageNumber: 5
      })
    );

    spy.mockRestore();
  });

  it('ignores stale BEAM_DISCONNECT messages from an old session', async () => {
    beamService.startReceiver('OTM-5555');
    const incoming = (beamService as any).handleIncoming.bind(beamService);

    await incoming(
      {
        type: 'BEAM_HANDSHAKE',
        roomCode: 'OTM-5555',
        sessionId: 'session-current',
        senderName: 'Android',
        timestamp: Date.now()
      } as BeamMessage,
      'relay'
    );
    expect(beamService.getPeerState().connected).toBe(true);

    // A replay from the previous session must not tear down the live pairing.
    await incoming(
      {
        type: 'BEAM_DISCONNECT',
        roomCode: 'OTM-5555',
        sessionId: 'session-old',
        timestamp: Date.now()
      } as BeamMessage,
      'relay'
    );
    expect(beamService.getConnectedRoom()).toBe('OTM-5555');
    expect(beamService.getPeerState().connected).toBe(true);

    // Disconnect clears the phone while the board remains available to pair.
    await incoming(
      {
        type: 'BEAM_DISCONNECT',
        roomCode: 'OTM-5555',
        sessionId: 'session-current',
        timestamp: Date.now()
      } as BeamMessage,
      'relay'
    );
    expect(beamService.getConnectedRoom()).toBe('OTM-5555');
    expect(beamService.getRole()).toBe('receiver');
    expect(beamService.getPeerState()).toMatchObject({ connected: false, peerName: null });
    await incoming({ type: 'BEAM_HANDSHAKE', roomCode: 'OTM-5555', sessionId: 'session-current', timestamp: Date.now() }, 'relay');
    expect(beamService.getPeerState().connected).toBe(false);
    await incoming({ type: 'BEAM_HANDSHAKE', roomCode: 'OTM-5555', sessionId: 'session-new', senderName: 'New phone', timestamp: Date.now() }, 'relay');
    expect(beamService.getPeerState()).toMatchObject({ connected: true, peerName: 'New phone' });
  });

  it('drops duplicate relay messages by msgId', async () => {
    beamService.startReceiver('OTM-7777');
    const listener = vi.fn();
    const unsub = beamService.subscribe(listener);
    const incoming = (beamService as any).handleIncoming.bind(beamService);

    const handshake: BeamMessage = {
      type: 'BEAM_HANDSHAKE',
      roomCode: 'OTM-7777',
      sessionId: 'session-dupe',
      msgId: 'same-message',
      senderName: 'iPhone',
      timestamp: Date.now()
    };

    await incoming(handshake, 'relay');
    await incoming(handshake, 'relay');

    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('rejects payloads from a different session', async () => {
    beamService.startReceiver('OTM-8888');
    const listener = vi.fn();
    const unsub = beamService.subscribe(listener);
    const incoming = (beamService as any).handleIncoming.bind(beamService);

    await incoming(
      {
        type: 'BEAM_HANDSHAKE',
        roomCode: 'OTM-8888',
        sessionId: 'session-live',
        timestamp: Date.now()
      } as BeamMessage,
      'relay'
    );
    listener.mockClear();

    await incoming(
      {
        type: 'BEAM_PAYLOAD',
        roomCode: 'OTM-8888',
        sessionId: 'session-other',
        msgId: 'payload-other',
        payload: {
          title: 'Old file',
          pageNumber: 1,
          totalPages: 2,
          theme: 'midnight',
          pdfUrl: 'https://example.com/old.pdf'
        },
        timestamp: Date.now()
      } as BeamMessage,
      'relay'
    );

    expect(listener).not.toHaveBeenCalled();

    await incoming(
      {
        type: 'BEAM_PAYLOAD',
        roomCode: 'OTM-8888',
        sessionId: 'session-live',
        msgId: 'payload-live',
        payload: {
          title: 'Current file',
          pageNumber: 3,
          totalPages: 9,
          theme: 'midnight',
          pdfUrl: 'https://example.com/current.pdf'
        },
        timestamp: Date.now()
      } as BeamMessage,
      'relay'
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toEqual(
      expect.objectContaining({ type: 'BEAM_PAYLOAD', sessionId: 'session-live' })
    );
    unsub();
  });
});

describe('Otium Smart Beam recent rooms', () => {
  it('saves and retrieves recent rooms in order', () => {
    saveRecentRoom('OTM-1111');
    saveRecentRoom('OTM-2222');
    const recents = getRecentRooms();
    expect(recents[0]).toBe('OTM-2222');
    expect(recents).toContain('OTM-1111');
  });
});
