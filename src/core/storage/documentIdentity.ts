/**
 * Stable document identity.
 *
 * Browsers and Android WebViews can reach the same PDF through different
 * filenames (share sheets rename files, two books can share a title). Reading
 * progress, highlights and bookmarks must follow the bytes, not the label.
 * A SHA-256 digest of the file provides that content identity.
 */

export const DOCUMENT_ID_PREFIX = 'sha256:';

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * FNV-1a over the full byte stream. Web Crypto is available on every target
 * platform, but a private WebView can disable `crypto.subtle`. The fallback is
 * deliberately slower and not cryptographic; it only keeps document identity
 * working in that edge case.
 */
function fallbackDigest(bytes: Uint8Array): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9 ^ bytes.length;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    a ^= byte;
    a = Math.imul(a, 0x01000193) >>> 0;
    b ^= byte + index;
    b = Math.imul(b, 0x85ebca6b) >>> 0;
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

export async function fingerprintDocument(data: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(data);
  const subtle = globalThis.crypto?.subtle;

  if (subtle) {
    try {
      const digest = await subtle.digest('SHA-256', bytes);
      return `${DOCUMENT_ID_PREFIX}${toHex(new Uint8Array(digest))}`;
    } catch {
      // Fall through to the deterministic fallback below.
    }
  }

  return `${DOCUMENT_ID_PREFIX}${fallbackDigest(bytes)}`;
}

export function isDocumentId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(DOCUMENT_ID_PREFIX) && value.length > DOCUMENT_ID_PREFIX.length;
}
