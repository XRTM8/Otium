import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { ThemeMode } from '../core/types';
import { getCanvasPixelRatio } from '../core/reader/device';
import { supportsCanvasFilter, themeFilter } from './pdfPageCanvas';

export function clearSearchHighlightsFromLayer(container: HTMLElement): void {
  container.querySelectorAll('mark.search-highlight').forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
  });
  container.normalize();
}

export function applySearchHighlightsToLayer(
  container: HTMLElement,
  searchQuery: string | undefined,
  isCurrentSearchPage: boolean | undefined
): void {
  clearSearchHighlightsFromLayer(container);

  const term = searchQuery?.trim() ?? '';
  if (term.length < 2) return;

  const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let regex: RegExp;
  try {
    regex = new RegExp(safeTerm, 'gi');
  } catch {
    return;
  }

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let currentNode = walker.nextNode();
  while (currentNode) {
    if (currentNode.nodeValue) textNodes.push(currentNode as Text);
    currentNode = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const text = textNode.nodeValue || '';
    if (!text) continue;

    regex.lastIndex = 0;
    const matches = Array.from(text.matchAll(regex));
    if (matches.length === 0) continue;

    const fragment = document.createDocumentFragment();
    let cursor = 0;

    for (const match of matches) {
      const start = match.index ?? 0;
      if (start > cursor) fragment.appendChild(document.createTextNode(text.slice(cursor, start)));

      const marker = document.createElement('mark');
      marker.className = isCurrentSearchPage
        ? 'search-highlight active-search-highlight'
        : 'search-highlight';
      marker.textContent = match[0];
      fragment.appendChild(marker);
      cursor = start + match[0].length;
    }

    if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)));
    textNode.parentNode?.replaceChild(fragment, textNode);
  }
}

export async function renderPdfPageToCanvas(args: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  rasterScale: number;
  pageSize: { width: number; height: number };
  theme: ThemeMode;
  canvas: HTMLCanvasElement;
  isCancelled: () => boolean;
  setRenderTask: (task: { cancel: () => void } | null) => void;
}): Promise<{ ok: boolean }> {
  const { doc, pageNumber, rasterScale, pageSize, theme, canvas, isCancelled, setRenderTask } = args;
  let page: PDFPageProxy | null = null;
  let staging: HTMLCanvasElement | null = null;

  try {
    page = await doc.getPage(pageNumber);
    if (isCancelled()) return { ok: false };

    const dpr = getCanvasPixelRatio();
    // Safe bitmap ceiling (4.5M pixels = ~18MB buffer) prevents mobile WebView OOM on Retina zoom.
    const MAX_CANVAS_PIXELS = 4_500_000;
    const rawPixels = pageSize.width * rasterScale * dpr * (pageSize.height * rasterScale * dpr);
    const dprAdjustment = rawPixels > MAX_CANVAS_PIXELS ? Math.sqrt(MAX_CANVAS_PIXELS / rawPixels) : 1;
    const effectiveDpr = Math.max(1, dpr * dprAdjustment);

    const viewport = page.getViewport({ scale: rasterScale * effectiveDpr });
    const cssViewport = page.getViewport({ scale: rasterScale });

    staging = document.createElement('canvas');
    staging.width = Math.max(1, Math.floor(viewport.width));
    staging.height = Math.max(1, Math.floor(viewport.height));
    const stagingContext = staging.getContext('2d', { alpha: false, willReadFrequently: false });
    if (!stagingContext) return { ok: false };

    stagingContext.imageSmoothingEnabled = true;
    stagingContext.imageSmoothingQuality = 'high';
    stagingContext.fillStyle = '#ffffff';
    stagingContext.fillRect(0, 0, staging.width, staging.height);

    const task = page.render({ canvas: staging, canvasContext: stagingContext, viewport, intent: 'display' });
    setRenderTask(task);

    try {
      await task.promise;
    } catch (error) {
      const name = (error as { name?: string } | null)?.name;
      if (!isCancelled() && name !== 'RenderingCancelledException') {
        console.warn(`Render notice on page ${pageNumber}:`, error);
      }
      return { ok: false };
    }

    if (isCancelled()) return { ok: false };

    if (canvas.width !== staging.width) canvas.width = staging.width;
    if (canvas.height !== staging.height) canvas.height = staging.height;

    const context = canvas.getContext('2d', { alpha: false });
    if (context) {
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      const filter = themeFilter(theme);
      const canFilter = Boolean(filter && supportsCanvasFilter());
      if (canFilter && filter) context.filter = filter;
      context.drawImage(staging, 0, 0, staging.width, staging.height, 0, 0, canvas.width, canvas.height);
      if (canFilter) context.filter = 'none';
    }

    canvas.dataset.viewportWidth = String(Math.floor(cssViewport.width));
    canvas.dataset.viewportHeight = String(Math.floor(cssViewport.height));
    return { ok: true };
  } finally {
    if (staging) {
      staging.width = 1;
      staging.height = 1;
    }
    try {
      page?.cleanup();
    } catch (err) {
      console.debug('[usePdfPageRender] Page cleanup skipped:', err);
    }
  }
}
