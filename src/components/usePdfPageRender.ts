import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { ThemeMode } from '../core/types';
import { scheduleIdleWork, scheduleRender } from '../core/reader/renderScheduler';
import { isLightTheme } from '../platform/theme';
import { supportsCanvasFilter, themeFilter } from './pdfPageCanvas';
import { applySearchHighlightsToLayer, renderPdfPageToCanvas } from './pdfPageRenderHelpers';

interface UsePdfPageRenderParams {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  theme: ThemeMode;
  baseAspectRatio: number;
  searchQuery?: string;
  isCurrentSearchPage?: boolean;
  renderPriority: number;
}

/** Manages PDF page viewport sizing, canvas rasterization, text-layer layout, and search highlights. */
export function usePdfPageRender({
  doc,
  pageNumber,
  scale,
  theme,
  baseAspectRatio,
  searchQuery,
  isCurrentSearchPage,
  renderPriority,
}: UsePdfPageRenderParams) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null);
  const currentRenderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const renderedKeyRef = useRef('');
  const priorityRef = useRef(renderPriority);

  const [isVisible, setIsVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const [renderedTarget, setRenderedTarget] = useState<{ doc: PDFDocumentProxy; page: number; theme: ThemeMode } | null>(null);
  const [rasterState, setRasterState] = useState<{ doc: PDFDocumentProxy; page: number; scale: number }>(() => ({ doc, page: pageNumber, scale }));
  const [errorTarget, setErrorTarget] = useState<{ doc: PDFDocumentProxy; page: number; message: string } | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [textLayerVersion, setTextLayerVersion] = useState(0);

  const hasRenderedOnce = renderedTarget?.doc === doc && renderedTarget?.page === pageNumber;
  const pageTheme = hasRenderedOnce ? renderedTarget.theme : theme;
  const renderError = errorTarget?.doc === doc && errorTarget?.page === pageNumber ? errorTarget.message : null;
  const rasterScale = rasterState.doc === doc && rasterState.page === pageNumber ? rasterState.scale : scale;

  const rasterScaleRef = useRef(rasterScale);
  const hasRenderedOnceRef = useRef(hasRenderedOnce);
  const wasVisibleRef = useRef(false);
  const isDark = !isLightTheme(pageTheme);
  const cssThemeFilter = useMemo(() => {
    const filter = themeFilter(pageTheme);
    return filter && !supportsCanvasFilter() ? filter : undefined;
  }, [pageTheme]);
  const pageThemeRef = useRef(pageTheme);

  useLayoutEffect(() => {
    priorityRef.current = renderPriority;
    rasterScaleRef.current = rasterScale;
    hasRenderedOnceRef.current = hasRenderedOnce;
    pageThemeRef.current = pageTheme;
  }, [renderPriority, rasterScale, hasRenderedOnce, pageTheme]);

  // The PDF page's unscaled size is fixed; scaling it synchronously keeps
  // gesture zoom anchored to the fingers instead of waiting for a render.
  const [pageSize, setPageSize] = useState<{ width: number; height: number }>(() => ({
    width: 595,
    height: Math.round(595 / (baseAspectRatio || 595 / 842))
  }));

  useEffect(() => {
    let active = true;
    let pageRef: PDFPageProxy | null = null;
    doc
      .getPage(pageNumber)
      .then((page: PDFPageProxy) => {
        pageRef = page;
        if (!active) return;
        const unscaledViewport = page.getViewport({ scale: 1 });
        setPageSize({ width: unscaledViewport.width, height: unscaledViewport.height });
      })
      .then(undefined, (err: unknown) => {
        console.debug('[usePdfPageRender] Page size probe failed:', err);
      })
      .finally(() => {
        try {
          pageRef?.cleanup();
        } catch (err) {
          console.debug('[usePdfPageRender] Page cleanup skipped:', err);
        }
      });

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
  const lastPageIdentityRef = useRef<{ doc: PDFDocumentProxy; pageNumber: number } | null>(null);
  useEffect(() => {
    if (
      lastPageIdentityRef.current?.doc === doc &&
      lastPageIdentityRef.current?.pageNumber === pageNumber
    ) {
      return;
    }
    lastPageIdentityRef.current = { doc, pageNumber };
    renderedKeyRef.current = '';
    hasRenderedOnceRef.current = false;
    if (textLayerRef.current) {
      delete textLayerRef.current.dataset.pageRendered;
    }
  }, [pageNumber, doc]);

  // Keep CSS sizing immediate at 120Hz while debouncing heavy PDF.js rasterization
  // during active pinch/wheel zoom on already-painted visible pages.
  useEffect(() => {
    if (!isVisible) {
      wasVisibleRef.current = false;
      return;
    }
    const justBecameVisible = !wasVisibleRef.current;
    wasVisibleRef.current = true;
    const syncScale = () => {
      setRasterState((prev) =>
        prev.doc === doc && prev.page === pageNumber && Math.abs(prev.scale - scale) < 0.0001
          ? prev
          : { doc, page: pageNumber, scale }
      );
    };
    if (justBecameVisible || !hasRenderedOnceRef.current) {
      const frame = window.requestAnimationFrame(syncScale);
      return () => window.cancelAnimationFrame(frame);
    }
    if (Math.abs(rasterScaleRef.current - scale) < 0.0001) return;
    const timer = window.setTimeout(syncScale, 90);
    return () => window.clearTimeout(timer);
  }, [doc, pageNumber, scale, isVisible]);

  // Auto-heal canvas on GPU context restoration (e.g. after low-memory resume)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleContextRestored = () => {
      setRetryKey((k) => k + 1);
    };
    canvas.addEventListener('contextrestored', handleContextRestored);
    return () => {
      canvas.removeEventListener('contextrestored', handleContextRestored);
    };
  }, []);

  // Mount pages a little before they enter the viewport, but let the shared
  // scheduler decide when the canvas may actually start rendering.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    if (typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        setIsVisible(entries[0]?.isIntersecting ?? false);
      },
      { rootMargin: '640px 0px 640px 0px', threshold: 0.01 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Immediate GPU texture release on unmount prevents VRAM accumulation in mobile WebViews.
  useEffect(() => {
    const canvas = canvasRef.current;
    const annotationCanvas = annotationCanvasRef.current;
    return () => {
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
      if (annotationCanvas) {
        annotationCanvas.width = 1;
        annotationCanvas.height = 1;
      }
    };
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const renderKey = `${pageNumber}:${rasterScale.toFixed(4)}:${theme}:${retryKey}`;
    if (renderedKeyRef.current === renderKey) return;

    let cancelled = false;

    const run = async () => {
      if (cancelled || !canvasRef.current) return;

      try {
        const result = await renderPdfPageToCanvas({
          doc,
          pageNumber,
          rasterScale,
          pageSize,
          theme,
          canvas: canvasRef.current,
          isCancelled: () => cancelled || !canvasRef.current,
          setRenderTask: (task) => {
            currentRenderTaskRef.current = task;
          },
        });
        if (!result.ok || cancelled) return;

        currentRenderTaskRef.current = null;
        renderedKeyRef.current = renderKey;
        const commit = () => {
          setRenderedTarget({ doc, page: pageNumber, theme });
          setErrorTarget(null);
        };
        // The new raster and the surrounding palette must reach the same frame.
        if (hasRenderedOnceRef.current && pageThemeRef.current !== theme) flushSync(commit);
        else commit();
      } catch (error) {
        const name = (error as { name?: string } | null)?.name;
        if (!cancelled && name !== 'RenderingCancelledException') {
          console.warn(`Render notice on page ${pageNumber}:`, error);
          setErrorTarget({ doc, page: pageNumber, message: (error as Error)?.message || 'Render failed' });
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
  }, [doc, pageNumber, rasterScale, pageSize, theme, isVisible, retryKey]);

  // Text layer is laid out once at natural size and scaled via CSS transform.
  useEffect(() => {
    if (!isVisible) return;
    let cancelled = false;

    const cancelIdle = scheduleIdleWork(async () => {
      const container = textLayerRef.current;
      if (!container || cancelled) return;

      if (container.dataset.pageRendered === String(pageNumber) && container.hasChildNodes()) {
        return;
      }

      let page: PDFPageProxy | null = null;
      try {
        page = await doc.getPage(pageNumber);
        if (cancelled || !textLayerRef.current) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent();
        if (cancelled || !textLayerRef.current) return;

        const target = textLayerRef.current;
        target.replaceChildren();
        target.style.setProperty('--total-scale-factor', '1');
        target.style.setProperty('--scale-round-x', '1px');
        target.style.setProperty('--scale-round-y', '1px');

        const { TextLayer } = await import('pdfjs-dist');
        if (cancelled || !textLayerRef.current) return;
        const textLayer = new TextLayer({
          textContentSource: textContent,
          container: target,
          viewport: baseViewport
        });
        await textLayer.render();

        if (!cancelled) {
          target.dataset.renderedScale = '1';
          target.dataset.pageRendered = String(pageNumber);
          setTextLayerVersion((version) => version + 1);
        }
      } catch {
        // Text layer generation is non-fatal
      } finally {
        try {
          page?.cleanup();
        } catch {
          // Cleanup is best-effort
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [doc, pageNumber, isVisible]);

  // Apply search match highlights across normalized text-layer nodes.
  useEffect(() => {
    const container = textLayerRef.current;
    if (!container || textLayerVersion === 0) return;
    applySearchHighlightsToLayer(container, searchQuery, isCurrentSearchPage);
  }, [searchQuery, isCurrentSearchPage, textLayerVersion]);

  const retryRender = () => {
    setErrorTarget(null);
    setRetryKey((k) => k + 1);
  };

  return {
    containerRef,
    canvasRef,
    textLayerRef,
    annotationCanvasRef,
    isVisible,
    hasRenderedOnce,
    renderError,
    dimensions,
    pageSize,
    pageTheme,
    isDark,
    cssThemeFilter,
    retryRender,
  };
}
