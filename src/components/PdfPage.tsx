import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import { StickyNote, Trash2, X } from 'lucide-react';
import type { ThemeMode, TextAnnotation } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { getCanvasPixelRatio } from '../core/reader/device';
import { scheduleIdleWork, scheduleRender } from '../core/reader/renderScheduler';
import { normalizeAnnotationRects } from '../core/annotations/geometry';

interface PdfPageProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  theme: ThemeMode;
  annotations?: TextAnnotation[];
  onDeleteAnnotation?: (id: string) => void;
  baseAspectRatio: number;
  searchQuery?: string;
  isCurrentSearchPage?: boolean;
  lang?: Language;
  /** Lower values render first. Distant pages are deferred while scrolling. */
  renderPriority?: number;
}

interface ActiveAnnotation {
  id: string;
  type: string;
  note?: string;
  text: string;
  x: number;
  y: number;
}

const PAGE_BACKGROUND: Record<ThemeMode, string> = {
  amoled: '#000000',
  midnight: '#06090f',
  amber: '#140f0c',
  parchment: '#fbf6ea',
  eink: '#e5e7eb',
  pure: '#ffffff',
  paper: '#fdfcf8'
};

const THEME_FILTERS: Partial<Record<ThemeMode, string>> = {
  amoled: 'invert(1) hue-rotate(180deg) contrast(1.06) brightness(0.96)',
  midnight: 'invert(0.92) hue-rotate(185deg) contrast(1.02) brightness(0.94)',
  amber: 'invert(0.92) sepia(0.65) hue-rotate(-25deg) contrast(1.05)',
  eink: 'grayscale(1) contrast(1.1)'
};

function themeFilter(theme: ThemeMode): string | null {
  return THEME_FILTERS[theme] ?? null;
}

/**
 * A full-page CSS filter is repainted on every scroll frame in Android's
 * WebView and is the main reason dark themes felt like 30 fps. Applying the
 * same filter once while copying the finished raster into the visible canvas
 * gives identical colours with no per-frame cost. The CSS path remains as a
 * fallback for a WebView whose Canvas2D implementation ignores `filter`.
 */
let canvasFilterSupport: boolean | null = null;

function supportsCanvasFilter(): boolean {
  if (canvasFilterSupport !== null) return canvasFilterSupport;

  try {
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    const context = probe.getContext('2d');
    if (!context) {
      canvasFilterSupport = false;
      return false;
    }
    context.filter = 'invert(1)';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 1, 1);
    canvasFilterSupport = context.getImageData(0, 0, 1, 1).data[0] < 64;
  } catch {
    canvasFilterSupport = false;
  }

  return canvasFilterSupport;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '').trim();
  const full = value.length === 3
    ? value.split('').map((character) => character + character).join('')
    : value;
  if (/^[0-9a-f]{6}$/i.test(full)) {
    return [
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16)
    ];
  }
  return [253, 224, 71];
}

function drawAnnotationLayer(
  canvas: HTMLCanvasElement,
  annotations: TextAnnotation[],
  width: number,
  height: number,
  dark: boolean
): void {
  const ratio = Math.min(
    getCanvasPixelRatio(1.5),
    Math.sqrt(2_500_000 / Math.max(1, width * height))
  );
  const backingWidth = Math.max(1, Math.round(width * ratio));
  const backingHeight = Math.max(1, Math.round(height * ratio));

  if (canvas.width !== backingWidth) canvas.width = backingWidth;
  if (canvas.height !== backingHeight) canvas.height = backingHeight;

  const context = canvas.getContext('2d');
  if (!context) return;

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  for (const annotation of annotations) {
    const [red, green, blue] = hexToRgb(annotation.color);
    const rects = normalizeAnnotationRects(annotation.rects);

    if (annotation.type === 'underline') {
      context.strokeStyle = `rgba(${red}, ${green}, ${blue}, 0.88)`;
      context.lineWidth = 1.8;
      context.lineCap = 'round';
      for (const rect of rects) {
        const x = rect.xPct * width;
        const y = (rect.yPct + rect.heightPct) * height - 1;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + rect.widthPct * width, y);
        context.stroke();
      }
      continue;
    }

    for (const rect of rects) {
      const x = rect.xPct * width;
      const y = rect.yPct * height;
      const rectWidth = rect.widthPct * width;
      const rectHeight = rect.heightPct * height;

      // A very narrow marker gradient reads as a physical highlighter rather
      // than a flat translucent rectangle, without needing a blur filter.
      const gradient = context.createLinearGradient(0, y, 0, y + rectHeight);
      gradient.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${dark ? 0.46 : 0.52})`);
      gradient.addColorStop(0.65, `rgba(${red}, ${green}, ${blue}, ${dark ? 0.36 : 0.43})`);
      gradient.addColorStop(1, `rgba(${red}, ${green}, ${blue}, ${dark ? 0.3 : 0.36})`);
      context.fillStyle = gradient;

      const radius = Math.min(3, rectHeight / 2);
      context.beginPath();
      if (typeof context.roundRect === 'function') {
        context.roundRect(x, y, rectWidth, rectHeight, radius);
      } else {
        context.rect(x, y, rectWidth, rectHeight);
      }
      context.fill();
    }
  }
}

const PdfPageView: React.FC<PdfPageProps> = ({
  doc,
  pageNumber,
  scale,
  theme,
  annotations = [],
  onDeleteAnnotation,
  baseAspectRatio,
  searchQuery,
  isCurrentSearchPage,
  lang = 'ar',
  renderPriority = 0
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null);
  const currentRenderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const renderedKeyRef = useRef('');
  const priorityRef = useRef(renderPriority);

  const [isVisible, setIsVisible] = useState(false);
  const [hasRenderedOnce, setHasRenderedOnce] = useState(false);
  const [textLayerVersion, setTextLayerVersion] = useState(0);
  const [activeAnno, setActiveAnno] = useState<ActiveAnnotation | null>(null);
  const isDark = theme === 'amoled' || theme === 'midnight' || theme === 'amber';
  const cssThemeFilter = useMemo(() => {
    const filter = themeFilter(theme);
    return filter && !supportsCanvasFilter() ? filter : undefined;
  }, [theme]);

  useEffect(() => {
    priorityRef.current = renderPriority;
  }, [renderPriority]);

  // The PDF page's unscaled size is fixed; scaling it synchronously keeps
  // gesture zoom anchored to the fingers instead of waiting for a render.
  const [pageSize, setPageSize] = useState<{ width: number; height: number }>(() => ({
    width: 600,
    height: 600 / (baseAspectRatio || 0.707)
  }));

  useEffect(() => {
    let active = true;
    doc
      .getPage(pageNumber)
      .then((page: PDFPageProxy) => {
        if (!active) return;
        const unscaledViewport = page.getViewport({ scale: 1 });
        setPageSize({ width: unscaledViewport.width, height: unscaledViewport.height });
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [doc, pageNumber]);

  const dimensions = useMemo(
    () => ({
      width: Math.max(1, Math.round(pageSize.width * scale)),
      height: Math.max(1, Math.round(pageSize.height * scale))
    }),
    [pageSize, scale]
  );

  // A reused component (dual mode) must never show the previous page while
  // the next one is still rasterising.
  useEffect(() => {
    setHasRenderedOnce(false);
  }, [pageNumber]);

  // Mount pages a little before they enter the viewport, but let the shared
  // scheduler decide when the canvas may actually start rendering.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setIsVisible(entries[0]?.isIntersecting ?? false);
      },
      { rootMargin: '640px 0px 640px 0px', threshold: 0.01 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Canvas lifecycle. Text layers deliberately live in a separate effect:
  // finishing a render must never cancel the pending text-layer job again.
  // Immediate GPU texture release on unmount prevents VRAM accumulation in mobile WebViews.
  useEffect(() => {
    return () => {
      if (canvasRef.current) {
        canvasRef.current.width = 1;
        canvasRef.current.height = 1;
      }
      if (annotationCanvasRef.current) {
        annotationCanvasRef.current.width = 1;
        annotationCanvasRef.current.height = 1;
      }
    };
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const renderKey = `${pageNumber}:${scale.toFixed(4)}:${theme}`;
    if (renderedKeyRef.current === renderKey) return;

    let cancelled = false;

    const run = async () => {
      if (cancelled || !canvasRef.current) return;

      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;

        const dpr = getCanvasPixelRatio();
        const viewport = page.getViewport({ scale: scale * dpr });
        const cssViewport = page.getViewport({ scale });

        // Render into a staging canvas first. The visible canvas is updated in
        // one synchronous copy, so zooming never flashes a blank page.
        const staging = document.createElement('canvas');
        staging.width = Math.max(1, Math.floor(viewport.width));
        staging.height = Math.max(1, Math.floor(viewport.height));
        const stagingContext = staging.getContext('2d', {
          alpha: false,
          willReadFrequently: false
        });
        if (!stagingContext) return;

        stagingContext.imageSmoothingEnabled = true;
        stagingContext.imageSmoothingQuality = 'high';
        stagingContext.fillStyle = '#ffffff';
        stagingContext.fillRect(0, 0, staging.width, staging.height);

        const task = page.render({
          canvas: staging,
          canvasContext: stagingContext,
          viewport,
          intent: 'display'
        });
        currentRenderTaskRef.current = task;

        try {
          await task.promise;
        } catch (error) {
          const name = (error as { name?: string } | null)?.name;
          if (!cancelled && name !== 'RenderingCancelledException') {
            console.warn(`Render notice on page ${pageNumber}:`, error);
          }
          return;
        }

        if (cancelled || !canvasRef.current) return;

        const canvas = canvasRef.current;
        if (canvas.width !== staging.width) canvas.width = staging.width;
        if (canvas.height !== staging.height) canvas.height = staging.height;

        const context = canvas.getContext('2d', { alpha: false });
        if (context) {
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = 'high';
          const filter = themeFilter(theme);
          const canFilter = Boolean(filter && supportsCanvasFilter());
          if (canFilter && filter) context.filter = filter;
          context.drawImage(staging, 0, 0);
          if (canFilter) context.filter = 'none';
        }

        currentRenderTaskRef.current = null;
        renderedKeyRef.current = renderKey;
        setHasRenderedOnce(true);

        // Keep the CSS viewport values on record for debugging and for the
        // text layer, which must match the raster at every scale.
        canvas.dataset.viewportWidth = String(Math.floor(cssViewport.width));
        canvas.dataset.viewportHeight = String(Math.floor(cssViewport.height));
      } catch (error) {
        const name = (error as { name?: string } | null)?.name;
        if (!cancelled && name !== 'RenderingCancelledException') {
          console.warn(`Render notice on page ${pageNumber}:`, error);
        }
      }
    };

    const cancelQueued = scheduleRender(priorityRef.current, run);

    return () => {
      cancelled = true;
      cancelQueued();
      const task = currentRenderTaskRef.current;
      if (task) {
        try {
          task.cancel();
        } catch {
          // A finished render task cannot be cancelled.
        }
        currentRenderTaskRef.current = null;
      }
    };
  }, [doc, pageNumber, scale, theme, isVisible]);

  // The text layer is laid out once at the page's natural size and scaled with
  // a CSS transform. Rebuilding it on every zoom step destroyed any selection
  // in progress and left the old glyph boxes under the new page size, which
  // made Android's selection handles select the wrong range.
  useEffect(() => {
    if (!isVisible) return;
    let cancelled = false;

    const cancelIdle = scheduleIdleWork(async () => {
      const container = textLayerRef.current;
      if (!container || cancelled) return;

      const page = await doc.getPage(pageNumber);
      if (cancelled || !textLayerRef.current) return;

      const baseViewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      if (cancelled || !textLayerRef.current) return;

      const target = textLayerRef.current;
      target.innerHTML = '';
      target.style.setProperty('--total-scale-factor', '1');
      target.style.setProperty('--scale-round-x', '1px');
      target.style.setProperty('--scale-round-y', '1px');

      const textLayer = new TextLayer({
        textContentSource: textContent,
        container: target,
        viewport: baseViewport
      });
      await textLayer.render();

      if (!cancelled) {
        target.dataset.renderedScale = '1';
        setTextLayerVersion((version) => version + 1);
      }
    }, 300);

    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [doc, pageNumber, isVisible]);

  // Search markers are applied after the text layer exists, then restored
  // without touching the canvas or annotations.
  useEffect(() => {
    const container = textLayerRef.current;
    if (!container || textLayerVersion === 0) return;

    container.querySelectorAll('mark.search-highlight').forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
    });
    container.normalize();

    const term = searchQuery?.trim() ?? '';
    if (term.length < 2) return;

    const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(safeTerm, 'gi');
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
  }, [searchQuery, isCurrentSearchPage, textLayerVersion]);

  const pageAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.pageNumber === pageNumber),
    [annotations, pageNumber]
  );

  // Highlights are painted once into one canvas per page. The previous DOM
  // implementation created a blended, animated layer for every line box,
  // which became both visually muddy and expensive on long highlighted pages.
  useEffect(() => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;

    drawAnnotationLayer(
      canvas,
      pageAnnotations,
      pageSize.width,
      pageSize.height,
      isDark
    );
  }, [pageAnnotations, pageSize.width, pageSize.height, isDark]);

  const handlePageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
      setActiveAnno(null);
      return;
    }

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const xPct = (event.clientX - rect.left) / rect.width;
    const yPct = (event.clientY - rect.top) / rect.height;

    const clicked = pageAnnotations.find((annotation) =>
      annotation.rects.some(
        (line) =>
          xPct >= line.xPct - 0.01 &&
          xPct <= line.xPct + line.widthPct + 0.01 &&
          yPct >= line.yPct - 0.012 &&
          yPct <= line.yPct + line.heightPct + 0.024
      )
    );

    if (clicked) {
      setActiveAnno({
        id: clicked.id,
        type: clicked.type,
        note: clicked.note,
        text: clicked.text,
        x: Math.max(72, Math.min(rect.width - 72, xPct * rect.width)),
        y: Math.max(34, yPct * rect.height - 10)
      });
    } else {
      setActiveAnno(null);
    }
  };

  return (
    <div
      ref={containerRef}
      onClick={handlePageClick}
      onContextMenu={(event) => event.preventDefault()}
      dir="ltr"
      data-page-number={pageNumber}
      data-pdf-page={pageNumber}
      className="pdf-page-slot relative flex items-center justify-center overflow-hidden select-none shrink-0 max-w-none"
      style={{
        width: `${dimensions.width}px`,
        height: `${dimensions.height}px`,
        backgroundColor: PAGE_BACKGROUND[theme]
      }}
    >
      {(isVisible || hasRenderedOnce) && (
        <canvas
          ref={canvasRef}
          dir="ltr"
          aria-hidden="true"
          className="block max-w-none transition-opacity duration-200"
          style={{
            filter: cssThemeFilter,
            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`,
            direction: 'ltr',
            letterSpacing: 'normal',
            wordSpacing: 'normal',
            opacity: hasRenderedOnce ? 1 : 0
          }}
        />
      )}

      {(theme === 'paper' || theme === 'parchment') && (
        <div
          className={`paper-overlay ${theme === 'parchment' ? 'paper-overlay-parchment' : 'paper-overlay-book'}`}
          aria-hidden="true"
        />
      )}

      {/* One canvas per page replaces the old blended div per line. */}
      <canvas
        ref={annotationCanvasRef}
        aria-hidden="true"
        className="absolute inset-0 z-[8] pointer-events-none"
        style={{ width: `${dimensions.width}px`, height: `${dimensions.height}px` }}
      />

      {/*
        The text layer is built at the page's natural size and scaled with a
        CSS transform. Its inline width/height are owned by PDF.js, so React
        must not set them here or zoom would scale the layer twice.
      */}
      <div
        ref={textLayerRef}
        dir="ltr"
        data-page-number={pageNumber}
        className="textLayer absolute inset-0 select-text pointer-events-auto z-10"
        style={{ transform: `scale(${scale})` }}
      />

      {pageAnnotations.some((annotation) => annotation.note) && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1 rounded-full bg-surface/90 px-1.5 py-0.5 text-[9px] text-ink-muted shadow-sm">
          <StickyNote className="w-2.5 h-2.5" />
          <span>{pageAnnotations.filter((annotation) => annotation.note).length}</span>
        </div>
      )}

      {activeAnno && (
        <div
          style={{
            left: `${activeAnno.x}px`,
            top: `${activeAnno.y}px`,
            transform: 'translate(-50%, -100%)'
          }}
          className="absolute z-40 flex max-w-[260px] flex-col gap-1.5 rounded-2xl border border-line-subtle bg-surface px-3 py-2 text-ink shadow-2xl select-none animate-in fade-in zoom-in-95 pointer-events-auto"
        >
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-ink-muted">
              {activeAnno.type === 'highlight'
                ? lang === 'ar'
                  ? 'تظليل'
                  : 'Highlight'
                : lang === 'ar'
                  ? 'تسطير'
                  : 'Underline'}
            </span>
            {onDeleteAnnotation && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteAnnotation(activeAnno.id);
                  setActiveAnno(null);
                }}
                className="ml-auto flex items-center gap-1 rounded-lg bg-rose-500/15 px-2 py-1 text-[10px] font-medium text-danger-ink transition-colors hover:bg-rose-500/25"
              >
                <Trash2 className="w-3 h-3" />
                <span>{lang === 'ar' ? 'حذف' : 'Delete'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setActiveAnno(null);
              }}
              className="rounded-lg p-1 text-ink-muted transition-colors hover:bg-hover hover:text-ink"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {activeAnno.note ? (
            <p className="max-h-24 overflow-y-auto whitespace-pre-line border-t border-line-subtle pt-1.5 text-[11px] leading-relaxed text-ink">
              {activeAnno.note}
            </p>
          ) : activeAnno.text ? (
            <p className="max-h-20 overflow-hidden border-t border-line-subtle pt-1.5 text-[11px] leading-relaxed text-ink-muted">
              “{activeAnno.text}”
            </p>
          ) : null}
        </div>
      )}

      {!hasRenderedOnce && (
        <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-widest text-ink-faint opacity-50 select-none">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>{lang === 'ar' ? `صفحة ${pageNumber}` : `Page ${pageNumber}`}</span>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-2 right-3 z-20 rounded bg-line/60 px-1.5 py-0.5 font-mono text-[10px] opacity-30">
        {pageNumber}
      </div>
    </div>
  );
};

export const PdfPage = React.memo(PdfPageView);
