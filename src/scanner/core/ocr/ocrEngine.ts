import type { OcrWordToken } from '../pdf';

const workers = new Map<string, Promise<any>>();
const OCR_CACHE_KEY_PREFIX = 'otium_ocr_cached_';

export interface ExtractedPageTextResult {
  text: string;
  words: OcrWordToken[];
  suggestedTitle?: string;
}

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
    corePath: `${base}/core`,
    langPath: `${base}/tessdata`,
  };
}

export function isOcrLanguageCached(lang: string = 'ara+eng'): boolean {
  // Arabic and English traineddata models are bundled locally with Otium
  if (lang === 'ara+eng' || lang === 'ara' || lang === 'eng') return true;
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(`${OCR_CACHE_KEY_PREFIX}${lang}`) === 'true';
}

export async function preloadOcrLanguage(
  lang: string = 'ara+eng',
  onProgress?: (progress: number, status: string) => void
): Promise<boolean> {
  try {
    const { createWorker } = await import('tesseract.js');
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
      const { createWorker } = await import('tesseract.js');
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
 * Extracts full text, bounding boxes, and intelligent document title suggestions from canvas.
 */
export async function extractPageTextAndMetadata(
  canvas: HTMLCanvasElement,
  lang: string = 'ara+eng',
  timeoutMs: number = 8000
): Promise<ExtractedPageTextResult> {
  const isCached = isOcrLanguageCached(lang);
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (!isOnline && !isCached && !workers.has(lang)) {
    return { text: '', words: [] };
  }

  const effectiveTimeout =
    typeof navigator !== 'undefined' && !navigator.onLine && !workers.has(lang)
      ? 1500
      : timeoutMs;

  const task = async (): Promise<ExtractedPageTextResult> => {
    try {
      const worker = await getWorker(lang);
      const ret = await worker.recognize(canvas);
      const dataAny = ret.data as any;
      const fullText = typeof dataAny.text === 'string' ? dataAny.text.trim() : '';

      const words: OcrWordToken[] = [];
      const width = canvas.width;
      const height = canvas.height;
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

      // Smart title extraction from recognized lines:
      let suggestedTitle: string | undefined = undefined;
      const lines: string[] = fullText.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length >= 3);
      if (lines.length > 0) {
        const keywordLine = lines.find((l: string) =>
          /(فاتورة|تقرير|عقد|شهادة|وصل|كشف|طلب|بيان|وثيقة|invoice|receipt|report|contract|statement)/i.test(l)
        );
        const targetLine = keywordLine || lines[0];
        const cleaned = targetLine
          .replace(/[^\p{L}\p{N}\s\-_]/gu, '')
          .replace(/\s+/g, '_')
          .slice(0, 32);
        if (cleaned.length >= 3) {
          suggestedTitle = cleaned;
        }
      }

      return { text: fullText, words, suggestedTitle };
    } catch (err) {
      console.warn('OCR text extraction failed:', err);
      return { text: '', words: [] };
    }
  };

  const timeoutPromise = new Promise<ExtractedPageTextResult>((resolve) =>
    setTimeout(() => {
      console.warn(`OCR timed out after ${effectiveTimeout}ms; proceeding.`);
      resolve({ text: '', words: [] });
    }, effectiveTimeout)
  );

  return Promise.race([task(), timeoutPromise]);
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
  const result = await extractPageTextAndMetadata(canvas, lang, timeoutMs);
  return result.words;
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
