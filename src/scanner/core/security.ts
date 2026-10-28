/**
 * Cryptographic Security Engine for Otium Scan Vault.
 * Uses SHA-256 with Device-Bound Salt to prevent plaintext PIN exposure.
 */

const SALT_KEY = 'otium_vault_salt';
const HASH_KEY = 'otium_vault_hash';

function getOrCreateDeviceSalt(): string {
  let salt = localStorage.getItem(SALT_KEY);
  if (!salt) {
    const array = new Uint8Array(16);
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(array);
      salt = Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
    } else {
      salt = `fallback_salt_${Date.now()}_${Math.random()}`;
    }
    localStorage.setItem(SALT_KEY, salt);
  }
  return salt;
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

export async function setVaultPin(pin: string): Promise<void> {
  const hashed = await hashPin(pin);
  localStorage.setItem(HASH_KEY, hashed);
  localStorage.removeItem('otium_vault_pin');
}

export async function verifyVaultPin(pin: string): Promise<boolean> {
  const storedHash = localStorage.getItem(HASH_KEY);
  if (!storedHash) {
    const legacy = localStorage.getItem('otium_vault_pin');
    if (legacy && constantTimeEqual(legacy, pin)) {
      await setVaultPin(pin);
      return true;
    }
    return false;
  }
  const currentHash = await hashPin(pin);
  return constantTimeEqual(currentHash, storedHash);
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
  return !!localStorage.getItem(HASH_KEY) || !!localStorage.getItem('otium_vault_pin');
}

export function clearVaultPin(): void {
  localStorage.removeItem(HASH_KEY);
  localStorage.removeItem('otium_vault_pin');
}
