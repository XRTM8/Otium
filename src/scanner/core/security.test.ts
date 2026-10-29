import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearVaultPin,
  getVaultLockoutRemainingSeconds,
  hasVaultPin,
  resetVaultFailedAttempts,
  setVaultPin,
  verifyVaultPin
} from './security';
import { isSafeUrl } from './nativeBridge';
import { isPdfBuffer } from '../../core/pdf/document';

describe('Vault Security Engine', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reports hasVaultPin = false initially', () => {
    expect(hasVaultPin()).toBe(false);
  });

  it('hashes and sets PIN correctly and verifies successfully', async () => {
    await setVaultPin('1234');
    expect(hasVaultPin()).toBe(true);

    const match = await verifyVaultPin('1234');
    expect(match).toBe(true);

    const wrong = await verifyVaultPin('9999');
    expect(wrong).toBe(false);
  });

  it('clears vault pin cleanly', async () => {
    await setVaultPin('5678');
    expect(hasVaultPin()).toBe(true);

    clearVaultPin();
    expect(hasVaultPin()).toBe(false);
    expect(await verifyVaultPin('5678')).toBe(false);
  });

  it('locks out after 5 consecutive failed attempts', async () => {
    await setVaultPin('4321');
    expect(getVaultLockoutRemainingSeconds()).toBe(0);

    for (let i = 0; i < 4; i++) {
      const ok = await verifyVaultPin('0000');
      expect(ok).toBe(false);
      expect(getVaultLockoutRemainingSeconds()).toBe(0);
    }

    // 5th failed attempt triggers lockout
    const fifth = await verifyVaultPin('0000');
    expect(fifth).toBe(false);
    expect(getVaultLockoutRemainingSeconds()).toBeGreaterThan(0);

    // While locked out, even the correct PIN is rejected
    const blocked = await verifyVaultPin('4321');
    expect(blocked).toBe(false);

    // Resetting attempts clears lockout
    resetVaultFailedAttempts();
    expect(getVaultLockoutRemainingSeconds()).toBe(0);
    const successAfterReset = await verifyVaultPin('4321');
    expect(successAfterReset).toBe(true);
  });

  it('validates safe external URLs strictly', () => {
    expect(isSafeUrl('https://github.com/XRTM8/Otium')).toBe(true);
    expect(isSafeUrl('http://example.com')).toBe(true);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeUrl('')).toBe(false);
  });

  it('verifies PDF magic header in buffer correctly', () => {
    const validPdfBytes = new TextEncoder().encode('%PDF-1.7\n%fake-stream');
    expect(isPdfBuffer(validPdfBytes.buffer)).toBe(true);

    const invalidBytes = new TextEncoder().encode('<html><body>Not a PDF</body></html>');
    expect(isPdfBuffer(invalidBytes.buffer)).toBe(false);

    const empty = new ArrayBuffer(0);
    expect(isPdfBuffer(empty)).toBe(false);
  });
});
