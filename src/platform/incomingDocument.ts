import { invoke } from '@tauri-apps/api/core';
import { getPlatformId, isTauriRuntime } from './runtime';

export interface IncomingDocument {
  data: ArrayBuffer;
  name: string;
}

export type IncomingDocumentHandler = (document: IncomingDocument) => void;

function decodeBase64(base64: string): ArrayBuffer {
  let cleaned = base64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const remainder = cleaned.length % 4;
  if (remainder === 2) cleaned += '==';
  else if (remainder === 3) cleaned += '=';

  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

/**
 * Connects the platform launch path to the shared reader.
 *
 * Android hands documents over through the native WebView bridge, which can
 * arrive before React has finished mounting. Desktop reads the path Windows
 * passed to the executable. Both paths end in the same handler.
 */
export function registerIncomingDocumentHandler(handler: IncomingDocumentHandler): () => void {
  const platform = getPlatformId();

  if (platform === 'android') {
    let isReading = false;

    // High-performance chunked reader from native cache file (safe against Telegram OOM on large booklets)
    const checkIncomingFromNativeBridge = () => {
      if (isReading) return;
      try {
        const otiumFile = (window as any).OtiumFile;
        if (!otiumFile || typeof otiumFile.getPendingDocumentInfo !== 'function') return;

        const infoStr = otiumFile.getPendingDocumentInfo();
        if (!infoStr) return;

        const info = JSON.parse(infoStr);
        if (!info.hasDocument || !info.size || info.size <= 0) return;

        isReading = true;
        const totalSize = Number(info.size);
        const name = info.name || 'document.pdf';
        const CHUNK_SIZE = 512 * 1024; // 512KB safe binary chunks

        const buffer = new ArrayBuffer(totalSize);
        const uint8 = new Uint8Array(buffer);
        let offset = 0;

        while (offset < totalSize) {
          const chunkBase64 = otiumFile.readPendingDocumentChunk(offset, CHUNK_SIZE);
          if (!chunkBase64) break;
          const binary = atob(chunkBase64);
          const chunkLen = binary.length;
          for (let i = 0; i < chunkLen; i++) {
            uint8[offset + i] = binary.charCodeAt(i);
          }
          offset += chunkLen;
        }

        if (typeof otiumFile.clearPendingDocument === 'function') {
          otiumFile.clearPendingDocument();
        }

        isReading = false;
        if (offset === totalSize && totalSize > 0) {
          handler({ data: buffer, name });
        }
      } catch (err) {
        isReading = false;
        console.error('Failed to read incoming PDF via Android native bridge:', err);
      }
    };

    const legacyBridge = (base64: string, name: string) => {
      try {
        if (!base64 || typeof base64 !== 'string') return;
        handler({ data: decodeBase64(base64), name: name || 'document.pdf' });
      } catch (error) {
        console.error('Failed to decode an incoming Android document:', error);
      }
    };

    (window as any).__OTIUM_CHECK_INCOMING_PDF__ = checkIncomingFromNativeBridge;
    (window as any).__OTIUM_LOAD_PDF_BASE64__ = legacyBridge;

    // Probe native bridge immediately on mount and after brief delay for cold launch
    checkIncomingFromNativeBridge();
    const probeTimer = window.setTimeout(checkIncomingFromNativeBridge, 250);

    return () => {
      window.clearTimeout(probeTimer);
      delete (window as any).__OTIUM_CHECK_INCOMING_PDF__;
      delete (window as any).__OTIUM_LOAD_PDF_BASE64__;
    };
  }

  if (platform === 'windows' && isTauriRuntime()) {
    let cancelled = false;

    void (async () => {
      try {
        const initial = await invoke<{ name: string; path: string } | null>('get_initial_pdf');
        if (!initial?.path || cancelled) return;

        const bytes = await invoke<ArrayBuffer | number[]>('read_pdf_bytes', {
          path: initial.path
        });
        if (cancelled) return;

        const data =
          bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes as number[]).buffer;
        if (data.byteLength === 0) return;

        handler({ data, name: initial.name || 'document.pdf' });
      } catch (error) {
        console.error('Failed to read the document passed by Windows:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }

  return () => {};
}
