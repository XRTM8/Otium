import { localStorage } from '../../../platform/storage';
import type { Worker } from 'tesseract.js';
import type { OcrWordToken } from '../pdf';

const workers = new Map<string, Promise<Worker>>();
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
export function resolveOcrAssetBase(
  baseURI: string = typeof document !== 'undefined' ? document.baseURI : '',
  locationHref: string = typeof window !== 'undefined' ? window.location?.href ?? '' : ''
): string {
  const anchor = baseURI || locationHref;
  if (anchor) {
    try {
      return new URL('./tesseract', anchor).href.replace(/\/$/, '');
    } catch {
      // Fall through to relative path.
    }
  }
  return './tesseract';
}

function workerOptions() {
  const base = resolveOcrAssetBase();
  return {
    workerPath: `${base}/worker.min.js`,
    corePath: `${base}/core`,
    langPath: `${base}/tessdata`,
  };
}

export function isOcrLanguageCached(lang: string = 'ara+eng'): boolean {
  // Arabic and English traineddata models are bundled locally with Otium
  if (lang === 'ara+eng' || lang === 'ara' || lang === 'eng') return true;
  try {
    return localStorage.getItem(`${OCR_CACHE_KEY_PREFIX}${lang}`) === 'true';
  } catch (error) {
    console.debug('[OCR] Could not read the language cache hint:', error);
    return false;
  }
}

export async function preloadOcrLanguage(
  lang: string = 'ara+eng',
  onProgress?: (progress: number, status: string) => void
): Promise<boolean> {
  try {
    return await runOcrTask(lang, 15_000, async () => true, onProgress);
  } catch (err) {
    console.warn('Failed to preload OCR language pack:', err);
    return false;
  }
}

function getWorker(lang: string, onProgress?: (progress: number, status: string) => void): Promise<Worker> {
  const existing = workers.get(lang);
  if (existing) return existing;
  let reportProgress = onProgress;

  const worker = import('tesseract.js').then(({ createWorker }) => createWorker(lang, 1, {
    ...workerOptions(),
    cacheMethod: 'write',
    gzip: true,
    errorHandler: (error: unknown) => console.debug('[OCR] Worker reported an error:', error),
    logger: ({ progress, status }) => {
      if (typeof progress === 'number' && workers.get(lang) === worker) reportProgress?.(progress, status || '');
    },
  })).then((ready) => {
    reportProgress = undefined;
    try {
      localStorage.setItem(`${OCR_CACHE_KEY_PREFIX}${lang}`, 'true');
    } catch (error) {
      console.debug('[OCR] Could not record the language cache hint:', error);
    }
    return ready;
  });
  workers.set(lang, worker);
  return worker;
}

async function disposeWorker(pending: Promise<Worker>): Promise<void> {
  try {
    const worker = await pending;
    await worker.terminate();
  } catch (error) {
    console.debug('[OCR] Worker cleanup skipped:', error);
  }
}

async function runOcrTask<T>(
  lang: string,
  timeoutMs: number,
  run: (worker: Worker) => Promise<T>,
  onProgress?: (progress: number, status: string) => void,
): Promise<T> {
  const worker = getWorker(lang, onProgress);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const task = worker.then((ready) => {
      if (workers.get(lang) !== worker) throw new Error('OCR worker was replaced');
      return run(ready);
    });
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`OCR timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    return await Promise.race([task, deadline]);
  } catch (error) {
    if (workers.get(lang) === worker) {
      workers.delete(lang);
      void disposeWorker(worker);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extracts full text, bounding boxes, and intelligent document title suggestions from canvas.
 */
export async function extractPageTextAndMetadata(
  canvas: HTMLCanvasElement,
  lang: string = 'ara+eng',
  timeoutMs: number = 25000
): Promise<ExtractedPageTextResult> {
  const isCached = isOcrLanguageCached(lang);
  const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;

  if (!isOnline && !isCached && !workers.has(lang)) {
    throw new Error('OCR language is unavailable offline');
  }

  const effectiveTimeout = !isOnline && !workers.has(lang) ? Math.min(1500, timeoutMs) : timeoutMs;

  return runOcrTask(lang, effectiveTimeout, async (worker) => {
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    const fullText = data.text.trim();

    const words: OcrWordToken[] = [];
    const width = canvas.width;
    const height = canvas.height;
    const rawWords = data.blocks?.flatMap((block) =>
      block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words))
    ) ?? [];

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
      if (targetLine) {
        const cleaned = targetLine
          .replace(/[^\p{L}\p{N}\s\-_]/gu, '')
          .replace(/\s+/g, '_')
          .slice(0, 32);
        if (cleaned.length >= 3) {
          suggestedTitle = cleaned;
        }
      }
    }

    return { text: fullText, words, suggestedTitle };
  });
}

/**
 * Performs optical character recognition on a canvas and extracts
 * word tokens with normalized bounding box coordinates for Searchable PDF embedding.
 */
export async function performOcr(
  canvas: HTMLCanvasElement,
  lang: string = 'ara+eng',
  timeoutMs: number = 25000
): Promise<OcrWordToken[]> {
  try {
    return (await extractPageTextAndMetadata(canvas, lang, timeoutMs)).words;
  } catch (error) {
    console.warn('OCR unavailable; exporting the scanned image:', error);
    return [];
  }
}

export async function terminateOcrWorker(): Promise<void> {
  const pending = [...workers.values()];
  workers.clear();
  await Promise.all(pending.map(disposeWorker));
}
