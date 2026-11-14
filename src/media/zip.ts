// Small, read-only ZIP reader for bounded local Open XML previews. It never
// extracts paths to disk and uses the browser's native raw-deflate decoder.
const MAX_ARCHIVE = 40 * 1024 ** 2;
const MAX_PART = 16 * 1024 ** 2;
type Entry = { offset: number; packed: number; size: number; method: number; crc: number; flags: number };
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  return crc >>> 0;
});
export const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ (crcTable[(crc ^ byte) & 255] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
const fail = (): never => { throw new Error('ملف PPTX تالف أو يتجاوز حدود المعاينة المحلية.'); };
export class LocalZip {
  private bytes: Uint8Array;
  private entries = new Map<string, Entry>();
  private directory = 0;
  constructor(buffer: ArrayBuffer) {
    this.bytes = new Uint8Array(buffer);
    if (buffer.byteLength > MAX_ARCHIVE || buffer.byteLength < 22) fail();
    const view = new DataView(buffer);
    let end = -1;
    for (let at = buffer.byteLength - 22; at >= Math.max(0, buffer.byteLength - 65557); at--) {
      if (view.getUint32(at, true) === 0x06054b50 && at + 22 + view.getUint16(at + 20, true) === buffer.byteLength) { end = at; break; }
    }
    if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) fail();
    const count = view.getUint16(end + 10, true);
    const length = view.getUint32(end + 12, true);
    let at = view.getUint32(end + 16, true);
    this.directory = at;
    if (count < 1 || count > 2048 || count !== view.getUint16(end + 8, true) || at + length !== end) fail();
    let total = 0;
    for (let index = 0; index < count; index++) {
      if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50) fail();
      const nameLength = view.getUint16(at + 28, true);
      const next = at + 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
      if (next > end || view.getUint16(at + 34, true)) fail();
      const name = new TextDecoder('utf-8', { fatal: true }).decode(this.bytes.subarray(at + 46, at + 46 + nameLength));
      if (!name || name.startsWith('/') || name.includes('\\') || name.includes('\0') || name.split('/').some(part => part === '..' || part === '.') || this.entries.has(name)) fail();
      const entry: Entry = { flags: view.getUint16(at + 8, true), method: view.getUint16(at + 10, true),
        crc: view.getUint32(at + 16, true), packed: view.getUint32(at + 20, true), size: view.getUint32(at + 24, true), offset: view.getUint32(at + 42, true) };
      total += entry.size;
      if (entry.flags & 1 || ![0, 8].includes(entry.method) || entry.size > MAX_PART || total > 96 * 1024 ** 2 || entry.offset + 30 > end || entry.packed > MAX_ARCHIVE) fail();
      this.entries.set(name, entry);
      at = next;
    }
    if (at !== end) fail();
  }
  has(name: string) { return this.entries.has(name); }
  async read(name: string, limit = MAX_PART, signal?: AbortSignal): Promise<Uint8Array> {
    signal?.throwIfAborted();
    const entry = this.entries.get(name);
    if (!entry) throw new Error('جزء مطلوب مفقود من ملف PPTX.');
    if (entry.size > limit) fail();
    const view = new DataView(this.bytes.buffer);
    const at = entry.offset;
    if (view.getUint32(at, true) !== 0x04034b50 || view.getUint16(at + 8, true) !== entry.method || view.getUint16(at + 6, true) !== entry.flags) fail();
    const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
    if (start + entry.packed > this.directory) fail();
    const localName = new TextDecoder().decode(this.bytes.subarray(at + 30, at + 30 + view.getUint16(at + 26, true)));
    if (localName !== name) fail();
    const packed = this.bytes.subarray(start, start + entry.packed);
    let result: Uint8Array;
    if (entry.method === 0) result = packed;
    else {
      let decoder: DecompressionStream;
      try { decoder = new DecompressionStream('deflate-raw'); }
      catch { throw new Error('المتصفح لا يدعم فك PPTX محلياً. حدّث المتصفح أو افتح نسخة PDF من العرض.'); }
      // Feed small chunks so a lying inflated size can be cancelled before
      // the decoder consumes the whole compressed entry.
      let packedPosition = 0;
      const input = new ReadableStream<BufferSource>({
        pull(controller) {
          if (packedPosition === packed.length) { controller.close(); return; }
          const end = Math.min(packedPosition + 4096, packed.length);
          controller.enqueue(packed.slice(packedPosition, end)); packedPosition = end;
        },
        cancel() { packedPosition = packed.length; },
      }, { highWaterMark: 0 });
      const reader = input.pipeThrough(decoder).getReader();
      const cancel = () => {
        void reader.cancel().then(undefined, (err: unknown) => {
          console.debug('[Zip] Stream reader cancel skipped:', err);
        });
      };
      signal?.addEventListener('abort', cancel, { once: true });
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          signal?.throwIfAborted();
          if (done) break;
          size += value.byteLength;
          if (size > limit || size > entry.size) { cancel(); fail(); }
          chunks.push(value);
        }
      } finally { signal?.removeEventListener('abort', cancel); reader.releaseLock(); }
      result = new Uint8Array(size);
      let position = 0;
      for (const chunk of chunks) { result.set(chunk, position); position += chunk.length; }
    }
    signal?.throwIfAborted();
    if (result.length !== entry.size || crc32(result) !== entry.crc) fail();
    return result;
  }
  async xml(name: string, signal?: AbortSignal): Promise<Document> {
    const text = new TextDecoder().decode(await this.read(name, 2 * 1024 ** 2, signal));
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) fail();
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) fail();
    return doc;
  }
}

export function resolvePart(source: string, target: string): string | null {
  if (!target || /[:\\?#\0]/.test(target)) return null;
  const parts = target.startsWith('/') ? [] : source.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) return null; parts.pop(); }
    else parts.push(part);
  }
  return parts.join('/');
}
