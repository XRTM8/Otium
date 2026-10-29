import { describe, expect, it, vi } from 'vitest';
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  beamService,
  formatRoomCode,
  generateNewReceiverRoomCode,
  generateRoomCode,
  getPersistentReceiverRoomCode,
  getRecentRooms,
  saveRecentRoom
} from './beamService';
import type { BeamMessage } from '../types';

describe('Otium Smart Beam Service', () => {
  it('generates a clean 4-digit room code with prefix', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^OTM-\d{4}$/);
  });

  it('formats raw codes and numbers into standardized OTM-XXXX', () => {
    expect(formatRoomCode('5678')).toBe('OTM-5678');
    expect(formatRoomCode('otm5678')).toBe('OTM-5678');
    expect(formatRoomCode('OTM-5678')).toBe('OTM-5678');
    expect(formatRoomCode(' room-123 ')).toBe('ROOM123');
  });

  it('accurately matches room codes case-insensitively ignoring dashes', () => {
    expect(beamService.isMatchingRoom('otm-1234', 'OTM1234')).toBe(true);
    expect(beamService.isMatchingRoom('OTM-4567', 'otm-4567')).toBe(true);
    expect(beamService.isMatchingRoom('OTM-1111', 'OTM-2222')).toBe(false);
  });

  it('manages sender and receiver roles and notifies state listeners', () => {
    const states: any[] = [];
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

  it('broadcasts page change only when in sender role with active room', () => {
    const listener = vi.fn();
    const unsub = beamService.subscribe(listener);

    // Receiver should NOT broadcast page changes
    beamService.startReceiver('OTM-1234');
    beamService.broadcastPageChange(5);
    expect(listener).not.toHaveBeenCalled();

    // Sender DOES broadcast page change
    beamService.startSender('OTM-1234');
    beamService.broadcastPageChange(5);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'BEAM_PAGE_CHANGE',
        roomCode: 'OTM-1234',
        pageNumber: 5
      })
    );

    beamService.disconnect();
    unsub();
  });

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

  it('notifies subscribers on broadcast', () => {
    const listener = vi.fn();
    const unsubscribe = beamService.subscribe(listener);

    const testMsg: BeamMessage = {
      type: 'BEAM_HANDSHAKE',
      roomCode: 'OTM-TEST-123',
      timestamp: Date.now()
    };

    beamService.broadcast(testMsg);

    expect(listener).toHaveBeenCalledWith(testMsg);

    unsubscribe();
  });

  it('saves and retrieves recent rooms in order', () => {
    saveRecentRoom('OTM-1111');
    saveRecentRoom('OTM-2222');
    const recents = getRecentRooms();
    expect(recents[0]).toBe('OTM-2222');
    expect(recents).toContain('OTM-1111');
  });

  it('automatically disconnects when BEAM_DISCONNECT is received for active room', () => {
    beamService.startReceiver('OTM-5555');
    expect(beamService.getConnectedRoom()).toBe('OTM-5555');

    beamService.broadcast({
      type: 'BEAM_DISCONNECT',
      roomCode: 'OTM-5555',
      timestamp: Date.now()
    });

    expect(beamService.getConnectedRoom()).toBeNull();
    expect(beamService.getRole()).toBeNull();
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
