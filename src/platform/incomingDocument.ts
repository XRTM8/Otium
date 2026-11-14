import { invoke } from '@tauri-apps/api/core';
import { getPlatformId, isTauriRuntime } from './runtime';

export interface IncomingDocument {
  data: ArrayBuffer;
  name: string;
  id?: string;
}

export type IncomingDocumentHandler = (document: IncomingDocument) => void | boolean | Promise<void | boolean>;
export const MAX_INCOMING_PDF_BYTES = 64 * 1024 * 1024;
type NativeDocumentInfo = { id?: string; hasDocument?: boolean; size?: number; name?: string; loading?: boolean; error?: string };
interface AndroidFileBridge {
  getPendingDocumentInfo(): string;
  readPendingDocumentChunkV2?: (id: string, offset: number, size: number) => string;
  acknowledgeDocument?: (id: string) => boolean;
}

/**
 * Connects the platform launch path to the shared reader.
 *
 * Android hands documents over through the native WebView bridge, which can
 * arrive before React has finished mounting. Desktop reads the path Windows
 * passed to the executable. Both paths end in the same handler.
 */
export function registerIncomingDocumentHandler(handler: IncomingDocumentHandler, onError: (message: string) => void = () => {}, onReading: (reading: boolean, id?: string) => void = () => {}): () => void {
  const platform = getPlatformId();

  if (platform === 'android') {
    let isReading = false, cancelled = false;
    let lastAttempt = '';
    const timers = new Set<number>();
    const delay = () => new Promise<void>(resolve => { const timer = window.setTimeout(() => { timers.delete(timer); resolve(); }, 0); timers.add(timer); });

    // High-performance chunked reader from native cache file (safe against Telegram OOM on large booklets)
    const checkIncomingFromNativeBridge = async () => {
      if (isReading || cancelled) return;
      let started = false;
      let requestId: string | undefined;
      try {
        const otiumFile = (window as Window & { OtiumFile?: AndroidFileBridge }).OtiumFile;
        if (!otiumFile || typeof otiumFile.getPendingDocumentInfo !== 'function') return;

        const infoStr = otiumFile.getPendingDocumentInfo();
        if (!infoStr) return;

        const info = JSON.parse(infoStr) as NativeDocumentInfo;
        requestId = info.id;
        if (info.loading) { onReading(true, info.id); return; }
        if (!info.hasDocument && !info.error) { onReading(false); lastAttempt = ''; return; }
        const id = info.id ?? `${info.name}:${info.size}`;
        if (lastAttempt === id) return;
        lastAttempt = id;
        if (info.error) {
          onReading(false, info.id); onError(info.error);
          if (info.id) otiumFile.acknowledgeDocument?.(info.id);
          return;
        }
        const totalSize = Number(info.size);
        if (!Number.isSafeInteger(totalSize) || totalSize <= 0 || totalSize > MAX_INCOMING_PDF_BYTES) throw new Error('الملف فارغ أو أكبر من حد الفتح المباشر (64 MB). افتح نسخة PDF أصغر.');

        isReading = true;
        started = true;
        onReading(true, info.id);
        // Let React paint the loading state before allocating or crossing JNI.
        await delay();
        if (cancelled) return;
        const name = typeof info.name === 'string' ? info.name.slice(0, 180) : 'document.pdf';
        const CHUNK_SIZE = 128 * 1024;

        const buffer = new ArrayBuffer(totalSize);
        const uint8 = new Uint8Array(buffer);
        let offset = 0;

        while (offset < totalSize) {
          if (cancelled) return;
          const current = JSON.parse(otiumFile.getPendingDocumentInfo()) as NativeDocumentInfo;
          if (info.id && current.id !== info.id) return;
          const count = Math.min(CHUNK_SIZE, totalSize - offset);
          const chunkBase64 = info.id && otiumFile.readPendingDocumentChunkV2
            ? otiumFile.readPendingDocumentChunkV2(info.id, offset, count)
            : '';
          if (!chunkBase64) throw new Error('توقفت قراءة ملف PDF قبل اكتماله. أعد فتح الملف من تلغرام.');
          const binary = atob(chunkBase64);
          const chunkLen = binary.length;
          if (!chunkLen || chunkLen > count) throw new Error('بيانات الملف المستلم غير مكتملة أو غير صالحة.');
          for (let i = 0; i < chunkLen; i++) {
            uint8[offset + i] = binary.charCodeAt(i);
          }
          offset += chunkLen;
          await delay();
        }
        if (cancelled) return;
        const latest = JSON.parse(otiumFile.getPendingDocumentInfo()) as NativeDocumentInfo;
        if (info.id && latest.id !== info.id) return;
        if (!new TextDecoder('latin1').decode(uint8.subarray(0, 1024)).includes('%PDF-')) throw new Error('الملف المستلم ليس PDF صالحاً أو لم يكتمل تنزيله.');
        const accepted = await handler({ data: buffer, name, id: info.id });
        if (!cancelled && accepted !== false && info.id) {
          otiumFile.acknowledgeDocument?.(info.id);
        }
      } catch (err) {
        if (!cancelled) { onReading(false, requestId); onError(err instanceof Error ? err.message : 'تعذر قراءة ملف PDF القادم من التطبيق الآخر.'); }
        console.error('Failed to read incoming PDF via Android native bridge:', err);
      } finally { if (started) { isReading = false; if (!cancelled) onReading(false, requestId); } }
    };

    window.__OTIUM_CHECK_INCOMING_PDF__ = checkIncomingFromNativeBridge;

    // Probe native bridge immediately on mount and after brief delay for cold launch
    void checkIncomingFromNativeBridge();
    const probeTimer = window.setInterval(() => { void checkIncomingFromNativeBridge(); }, 750);

    return () => {
      cancelled = true;
      window.clearInterval(probeTimer);
      // Outstanding yield timers resolve so cancelled readers release buffers.
      if (window.__OTIUM_CHECK_INCOMING_PDF__ === checkIncomingFromNativeBridge) {
        delete window.__OTIUM_CHECK_INCOMING_PDF__;
      }
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

        await handler({ data, name: initial.name || 'document.pdf' });
      } catch (error) {
        console.error('Failed to read the document passed by Windows:', error);
        if (!cancelled) onError(error instanceof Error ? error.message : 'تعذر فتح الملف.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }

  return () => {};
}
