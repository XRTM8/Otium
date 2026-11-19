import type { PDFDocumentProxy } from 'pdfjs-dist';

const coverMemoryCache = new Map<string, string>();
const docCoverWeakMap = new WeakMap<PDFDocumentProxy, string>();

/** Retrieve a previously cached cover data URL for a specific document proxy. */
export function getCoverForDoc(doc: PDFDocumentProxy): string | undefined {
  if (!doc) return undefined;
  return docCoverWeakMap.get(doc);
}

/** Associate a cover data URL directly with a document proxy in memory. */
export function setCoverForDoc(doc: PDFDocumentProxy, url: string): void {
  if (!doc || !url) return;
  docCoverWeakMap.set(doc, url);
}

/** Retrieve a previously cached cover data URL from memory. */
export function getCachedCover(id: string): string | undefined {
  if (!id) return undefined;
  return coverMemoryCache.get(id);
}

/** Store a cover data URL in memory cache. */
export function setCachedCover(id: string, url: string): void {
  if (!id || !url) return;
  coverMemoryCache.set(id, url);
}

/** Check whether a cover is already in memory cache. */
export function hasCachedCover(id: string): boolean {
  if (!id) return false;
  return coverMemoryCache.has(id);
}

/** Clears the in-memory cover cache. */
export function clearCoverCache(): void {
  coverMemoryCache.clear();
}

/**
 * Extracts a lightweight cover thumbnail from the first page of a PDF document.
 * Returns a data URL (JPEG) or null if extraction fails or DOM canvas is unavailable.
 */
export async function extractPdfCover(
  doc: PDFDocumentProxy,
  maxWidth = 140,
  maxHeight = 190
): Promise<string | null> {
  if (!doc || typeof document === 'undefined') return null;

  let page: any = null;
  let canvas: HTMLCanvasElement | null = null;

  try {
    page = await doc.getPage(1);
    if (!page || typeof page.getViewport !== 'function' || typeof page.render !== 'function') return null;

    const unscaled = page.getViewport({ scale: 1 });
    if (!unscaled.width || !unscaled.height) return null;

    const targetWidth = Math.max(20, maxWidth);
    const targetHeight = Math.max(20, maxHeight);
    const scale = Math.min(
      targetWidth / Math.max(1, unscaled.width),
      targetHeight / Math.max(1, unscaled.height)
    );

    const viewport = page.getViewport({ scale });
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return null;

    // Solid white background ensures transparent PDF pages render cleanly like book paper
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
      intent: 'display',
    });

    await renderTask.promise;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    setCoverForDoc(doc, dataUrl);
    return dataUrl;
  } catch (err) {
    console.debug('Failed to extract PDF cover:', err);
    return null;
  } finally {
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
    try {
      page?.cleanup();
    } catch {
      // Cleanup skipped
    }
  }
}
