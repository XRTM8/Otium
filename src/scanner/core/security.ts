/**
 * Cryptographic Security Engine for Otium Scan Vault.
 * Uses SHA-256 with Device-Bound Salt to prevent plaintext PIN exposure,
 * constant-time string comparison to prevent timing side-channels,
 * and progressive exponential back-off rate limiting to prevent brute-force attacks.
 */

const SALT_KEY = 'otium_vault_salt';
const HASH_KEY = 'otium_vault_hash';
const FAIL_COUNT_KEY = 'otium_vault_fail_count';
const LOCKOUT_KEY = 'otium_vault_lockout_until';

function getOrCreateDeviceSalt(): string {
  try {
    let salt = localStorage.getItem(SALT_KEY);
    if (!salt) {
      const array = new Uint8Array(16);
      if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(array);
        salt = Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
      } else {
        salt = `fallback_salt_${Date.now()}_${Math.random()}`;
      }
      try {
        localStorage.setItem(SALT_KEY, salt);
      } catch {}
    }
    return salt;
  } catch {
    return `fallback_salt_${Date.now()}`;
  }
}

async function hashPin(pin: string): Promise<string> {
  const salt = getOrCreateDeviceSalt();
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${pin.trim()}`);
  
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback simple hash for non-crypto environments
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = (hash << 5) - hash + data[i];
    hash |= 0;
  }
  return `h_${hash}`;
}

export function getVaultLockoutRemainingSeconds(): number {
  if (typeof localStorage === 'undefined') return 0;
  try {
    const rawLockout = localStorage.getItem(LOCKOUT_KEY);
    if (!rawLockout) return 0;
    const lockoutUntil = parseInt(rawLockout, 10);
    if (Number.isNaN(lockoutUntil)) {
      try {
        localStorage.removeItem(LOCKOUT_KEY);
      } catch {}
      return 0;
    }
    const diff = lockoutUntil - Date.now();
    if (diff <= 0) {
      try {
        localStorage.removeItem(LOCKOUT_KEY);
      } catch {}
      return 0;
    }
    return Math.ceil(diff / 1000);
  } catch {
    return 0;
  }
}

export function recordVaultFailedAttempt(): { locked: boolean; remainingSeconds: number; attempts: number } {
  if (typeof localStorage === 'undefined') return { locked: false, remainingSeconds: 0, attempts: 0 };
  try {
    const currentFails = parseInt(localStorage.getItem(FAIL_COUNT_KEY) || '0', 10) + 1;
    localStorage.setItem(FAIL_COUNT_KEY, currentFails.toString());

    if (currentFails >= 5) {
      // Progressive lockout: 30s at 5-7, 60s at 8-9, 120s at 10+
      let lockoutDurationMs = 30000;
      if (currentFails >= 10) {
        lockoutDurationMs = 120000;
      } else if (currentFails >= 8) {
        lockoutDurationMs = 60000;
      }
      const lockoutUntil = Date.now() + lockoutDurationMs;
      localStorage.setItem(LOCKOUT_KEY, lockoutUntil.toString());
      return { locked: true, remainingSeconds: Math.ceil(lockoutDurationMs / 1000), attempts: currentFails };
    }

    return { locked: false, remainingSeconds: 0, attempts: currentFails };
  } catch {
    return { locked: false, remainingSeconds: 0, attempts: 0 };
  }
}

export function resetVaultFailedAttempts(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(FAIL_COUNT_KEY);
    localStorage.removeItem(LOCKOUT_KEY);
  } catch {}
}

export async function setVaultPin(pin: string): Promise<void> {
  const hashed = await hashPin(pin);
  try {
    localStorage.setItem(HASH_KEY, hashed);
    localStorage.removeItem('otium_vault_pin');
  } catch {}
  resetVaultFailedAttempts();
}

export async function verifyVaultPin(pin: string): Promise<boolean> {
  // If actively locked out, reject immediately to prevent brute-forcing
  if (getVaultLockoutRemainingSeconds() > 0) {
    return false;
  }

  let storedHash: string | null = null;
  let legacy: string | null = null;
  try {
    storedHash = localStorage.getItem(HASH_KEY);
    legacy = localStorage.getItem('otium_vault_pin');
  } catch {}

  if (!storedHash) {
    if (legacy && constantTimeEqual(legacy, pin)) {
      await setVaultPin(pin);
      resetVaultFailedAttempts();
      return true;
    }
    recordVaultFailedAttempt();
    return false;
  }

  const currentHash = await hashPin(pin);
  const isValid = constantTimeEqual(currentHash, storedHash);
  if (isValid) {
    resetVaultFailedAttempts();
  } else {
    recordVaultFailedAttempt();
  }
  return isValid;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function hasVaultPin(): boolean {
  try {
    return !!localStorage.getItem(HASH_KEY) || !!localStorage.getItem('otium_vault_pin');
  } catch {
    return false;
  }
}

export function clearVaultPin(): void {
  try {
    localStorage.removeItem(HASH_KEY);
    localStorage.removeItem('otium_vault_pin');
  } catch {}
  resetVaultFailedAttempts();
}
