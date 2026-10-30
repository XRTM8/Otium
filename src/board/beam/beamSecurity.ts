export const BEAM_RELAY_ORIGIN = 'https://ntfy.tedomum.fr';
const RELAY_ORIGINS = new Set([BEAM_RELAY_ORIGIN, 'https://ntfy.sh']);

/** Incoming peers cannot direct the app to local networks or arbitrary sites. */
export function trustedRelayUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid relay attachment URL.');
  const url = new URL(value);
  if (url.username || url.password || !RELAY_ORIGINS.has(url.origin) || url.protocol !== 'https:') throw new Error('Untrusted relay attachment URL.');
  return url.href;
}

/** Bound allocations even when an attachment omits Content-Length. */
export async function boundedResponseBytes(response: Response, maxBytes: number): Promise<ArrayBuffer> {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) { await response.body?.cancel(); throw new Error('Relay attachment exceeds the transfer limit.'); }
  if (!response.body?.getReader) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) throw new Error('Relay attachment exceeds the transfer limit.');
    return buffer;
  }
  const reader = response.body.getReader();
  const parts: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new Error('Relay attachment exceeds the transfer limit.'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return bytes.buffer;
}
