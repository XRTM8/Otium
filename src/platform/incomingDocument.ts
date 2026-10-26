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
    const bridge = (base64: string, name: string) => {
      try {
        handler({ data: decodeBase64(base64), name: name || 'document.pdf' });
      } catch (error) {
        console.error('Failed to decode an incoming Android document:', error);
      }
    };

    (window as unknown as Record<string, unknown>).__OTIUM_LOAD_PDF_BASE64__ = bridge;
    return () => {
      const target = window as unknown as Record<string, unknown>;
      if (target.__OTIUM_LOAD_PDF_BASE64__ === bridge) {
        delete target.__OTIUM_LOAD_PDF_BASE64__;
      }
    };
  }

  if (platform === 'windows' && isTauriRuntime()) {
    let cancelled = false;

    void (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
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
