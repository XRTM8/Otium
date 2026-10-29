import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  beamService,
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
  it('generates a clean 4-digit room code with prefix', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^OTM-\d{4}$/);
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
    expect(code1).toMatch(/^OTM-\d{4}$/);

    const code2 = getPersistentReceiverRoomCode();
    expect(code2).toBe(code1);

    const fresh = generateNewReceiverRoomCode();
    expect(fresh).toMatch(/^OTM-\d{4}$/);
    expect(getPersistentReceiverRoomCode()).toBe(fresh);
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

    // The current session is allowed to disconnect.
    await incoming(
      {
        type: 'BEAM_DISCONNECT',
        roomCode: 'OTM-5555',
        sessionId: 'session-current',
        timestamp: Date.now()
      } as BeamMessage,
      'relay'
    );
    expect(beamService.getConnectedRoom()).toBeNull();
    expect(beamService.getRole()).toBeNull();
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
