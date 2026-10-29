import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearVaultPin,
  constantTimeEqual,
  generateCryptographicSalt,
  getVaultLockoutRemainingSeconds,
  hasVaultPin,
  PBKDF2_ITERATIONS,
  resetVaultFailedAttempts,
  setVaultPin,
  verifyVaultPin
} from './security';
import { isSafeUrl, sanitizeFilename } from './nativeBridge';
import { isPdfBuffer } from '../../core/pdf/document';

describe('Vault Security Engine', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reports hasVaultPin = false initially', () => {
    expect(hasVaultPin()).toBe(false);
  });

  it('hashes and sets PIN using hardened PBKDF2 format and verifies successfully', async () => {
    await setVaultPin('1234');
    expect(hasVaultPin()).toBe(true);

    const storedHash = localStorage.getItem('otium_vault_hash');
    expect(storedHash).toBeDefined();
    expect(storedHash?.startsWith(`pbkdf2:${PBKDF2_ITERATIONS}:`)).toBe(true);

    const match = await verifyVaultPin('1234');
    expect(match).toBe(true);

    const wrong = await verifyVaultPin('9999');
    expect(wrong).toBe(false);
  });

  it('migrates legacy plaintext PIN transparently to PBKDF2 upon successful verification', async () => {
    localStorage.setItem('otium_vault_pin', '7788');
    expect(hasVaultPin()).toBe(true);

    const match = await verifyVaultPin('7788');
    expect(match).toBe(true);

    // Old plaintext key removed
    expect(localStorage.getItem('otium_vault_pin')).toBeNull();
    // New PBKDF2 hash stored
    const upgraded = localStorage.getItem('otium_vault_hash');
    expect(upgraded?.startsWith(`pbkdf2:${PBKDF2_ITERATIONS}:`)).toBe(true);

    // Subsequent verification uses PBKDF2
    expect(await verifyVaultPin('7788')).toBe(true);
  });

  it('clears vault pin cleanly', async () => {
    await setVaultPin('5678');
    expect(hasVaultPin()).toBe(true);

    clearVaultPin();
    expect(hasVaultPin()).toBe(false);
    expect(await verifyVaultPin('5678')).toBe(false);
  });

  it('locks out after 5 consecutive failed attempts and rejects valid PIN while locked', async () => {
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

  it('performs constant-time comparison without leaking length or early termination', () => {
    expect(constantTimeEqual('secret123', 'secret123')).toBe(true);
    expect(constantTimeEqual('secret123', 'secret999')).toBe(false);
    expect(constantTimeEqual('short', 'longer_string')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
    expect(constantTimeEqual('', 'non-empty')).toBe(false);
  });

  it('generates cryptographic random hex salt with correct length', () => {
    const salt16 = generateCryptographicSalt(16);
    expect(salt16).toHaveLength(32); // 16 bytes = 32 hex chars
    const salt32 = generateCryptographicSalt(32);
    expect(salt32).toHaveLength(64);
    expect(salt16).not.toBe(generateCryptographicSalt(16));
  });

  it('validates safe external URLs strictly and blocks injection schemes', () => {
    expect(isSafeUrl('https://github.com/XRTM8/Otium')).toBe(true);
    expect(isSafeUrl('http://example.com')).toBe(true);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeUrl('blob:https://example.com/uuid')).toBe(false);
    expect(isSafeUrl('https://user:password@malicious.com')).toBe(false);
    expect(isSafeUrl('')).toBe(false);
    expect(isSafeUrl('   ')).toBe(false);
  });

  it('sanitizes filenames against path traversal and dangerous characters', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('etc_passwd');
    expect(sanitizeFilename('..\\..\\windows\\system32')).toBe('windows_system32');
    expect(sanitizeFilename('file\x00with\x08nulls.pdf')).toBe('filewithnulls.pdf');
    expect(sanitizeFilename('normal-doc_2026.pdf')).toBe('normal-doc_2026.pdf');
    expect(sanitizeFilename('')).toBe('document');
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
