import { describe, expect, it, vi } from 'vitest';
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  beamService,
  generateRoomCode,
  getRecentRooms,
  saveRecentRoom
} from './beamService';
import type { BeamMessage } from '../types';

describe('Otium Smart Beam Service', () => {
  it('generates a clean 4-digit room code with prefix', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^OTM-\d{4}$/);
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
});
