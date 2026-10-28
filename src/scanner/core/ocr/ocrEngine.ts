import { createWorker } from 'tesseract.js';
import type { OcrWordToken } from '../pdf';

const workers = new Map<string, Promise<any>>();
const OCR_CACHE_KEY_PREFIX = 'otium_ocr_cached_';

/**
 * The worker script and the WASM core are staged into `public/tesseract` at
 * build time (see scripts/copy-ocr-assets.mjs). They must be absolute URLs: the
 * worker is spawned from a blob, so a relative path would resolve against the
 * blob origin instead of the app.
 */
function ocrAssetBase(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/tesseract`;
}

function workerOptions() {
  const base = ocrAssetBase();
  return {
    workerPath: `${base}/worker.min.js`,
    corePath: `${base}/core`
  };
}

export function isOcrLanguageCached(lang: string = 'ara+eng'): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(`${OCR_CACHE_KEY_PREFIX}${lang}`) === 'true';
}

export async function preloadOcrLanguage(
  lang: string = 'ara+eng',
  onProgress?: (progress: number, status: string) => void
): Promise<boolean> {
  try {
    const worker = await createWorker(lang, 1, {
      ...workerOptions(),
      cacheMethod: 'write',
      gzip: true,
      logger: (m: any) => {
        if (typeof m.progress === 'number') {
          onProgress?.(m.progress, m.status || '');
        }
      },
    });

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${OCR_CACHE_KEY_PREFIX}${lang}`, 'true');
    }
    workers.set(lang, Promise.resolve(worker));
    return true;
  } catch (err) {
    console.warn('Failed to preload OCR language pack:', err);
    return false;
  }
}

async function getWorker(lang: string = 'ara+eng') {
  if (!workers.has(lang)) {
    const promise = (async () => {
      // Configure local cache persistence so language weights are saved to IndexedDB
      const worker = await createWorker(lang, 1, {
        ...workerOptions(),
        cacheMethod: 'write',
        gzip: true,
        logger: () => {}, // silent
      });
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`${OCR_CACHE_KEY_PREFIX}${lang}`, 'true');
      }
      return worker;
    })();
    workers.set(lang, promise);
  }
  return workers.get(lang)!;
}

/**
 * Performs optical character recognition on a canvas and extracts
 * word tokens with normalized bounding box coordinates for Searchable PDF embedding.
 */
export async function performOcr(
  canvas: HTMLCanvasElement,
  lang: string = 'ara+eng',
  timeoutMs: number = 7000
): Promise<OcrWordToken[]> {
  const isCached = isOcrLanguageCached(lang);
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  // Immediate offline fallback: avoid stalling PDF export if language weights aren't cached locally
  if (!isOnline && !isCached && !workers.has(lang)) {
    return [];
  }

  const effectiveTimeout =
    typeof navigator !== 'undefined' && !navigator.onLine && !workers.has(lang)
      ? 1500
      : timeoutMs;

  const ocrTask = async (): Promise<OcrWordToken[]> => {
    try {
      const worker = await getWorker(lang);
      const ret = await worker.recognize(canvas);
      const words: OcrWordToken[] = [];

      const width = canvas.width;
      const height = canvas.height;

      const dataAny = ret.data as any;
      const rawWords: any[] = dataAny.words || dataAny.lines?.flatMap((l: any) => l.words || []) || [];

      for (const w of rawWords) {
        if (!w || !w.text || typeof w.text !== 'string' || w.text.trim().length === 0) continue;
        const bbox = w.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 };
        words.push({
          text: w.text.trim(),
          x: bbox.x0 / width,
          y: bbox.y0 / height,
          width: Math.max(0.01, (bbox.x1 - bbox.x0) / width),
          height: Math.max(0.01, (bbox.y1 - bbox.y0) / height),
        });
      }

      return words;
    } catch (err) {
      console.warn('OCR processing failed or skipped:', err);
      return [];
    }
  };

  const timeoutPromise = new Promise<OcrWordToken[]>((resolve) =>
    setTimeout(() => {
      console.warn(`OCR timed out after ${effectiveTimeout}ms; proceeding without text layer for this page.`);
      resolve([]);
    }, effectiveTimeout)
  );

  return Promise.race([ocrTask(), timeoutPromise]);
}

export async function terminateOcrWorker() {
  for (const [, promise] of workers.entries()) {
    try {
      const worker = await promise;
      await worker.terminate();
    } catch {}
  }
  workers.clear();
}
