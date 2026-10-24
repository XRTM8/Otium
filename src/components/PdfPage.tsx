import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import { Trash2, X } from 'lucide-react';
import type { ThemeMode, TextAnnotation } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { getCanvasPixelRatio } from '../core/reader/device';

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
  onPageVisible?: (pageNumber: number) => void;
}

export const PdfPage: React.FC<PdfPageProps> = ({
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
  onPageVisible
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasRenderedOnce, setHasRenderedOnce] = useState(false);
  const [textLayerVersion, setTextLayerVersion] = useState(0);
  const [activeAnno, setActiveAnno] = useState<{ id: string; type: string; x: number; y: number } | null>(null);
  const currentRenderTaskRef = useRef<any>(null);
  const lastRenderedScaleRef = useRef<number>(0);
  const lastRenderedPageRef = useRef<number | null>(null);

  // Computed page dimensions
  const standardWidth = Math.round(600 * scale);
  const standardHeight = Math.round(standardWidth / (baseAspectRatio || 0.707));

  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: standardWidth,
    height: standardHeight
  });

  // Fetch precise dimensions
  useEffect(() => {
    let active = true;
    doc.getPage(pageNumber).then((page: PDFPageProxy) => {
      if (!active) return;
      const unscaledViewport = page.getViewport({ scale: 1 });
      setDimensions({
        width: Math.round(unscaledViewport.width * scale),
        height: Math.round(unscaledViewport.height * scale)
      });
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, [doc, pageNumber, scale]);

  // Viewport IntersectionObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          setIsVisible(true);
          onPageVisible?.(pageNumber);
        } else {
          setIsVisible(false);
        }
      },
      {
        rootMargin: '600px 0px 600px 0px',
        threshold: 0.01
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [pageNumber, onPageVisible]);

  // Robust Canvas & Text Layer Rendering Pipeline
  useEffect(() => {
    if (!isVisible) return;

    // Skip if already rendered at this exact page and scale
    if (
      hasRenderedOnce &&
      lastRenderedPageRef.current === pageNumber &&
      Math.abs(lastRenderedScaleRef.current - scale) < 0.01
    ) {
      return;
    }

    let isCurrentEffect = true;

    const renderPage = async () => {
      try {
        if (currentRenderTaskRef.current) {
          try {
            await currentRenderTaskRef.current.cancel();
          } catch {
            // ignore cancellation
          }
          currentRenderTaskRef.current = null;
        }

        const page = await doc.getPage(pageNumber);
        if (!isCurrentEffect || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', {
          alpha: false,
          willReadFrequently: false
        });
        if (!ctx) return;

        // Match the screen for razor-sharp text, capped so high-DPI phones do
        // not allocate 9-16x the canvas memory and crash the WebView.
        const dpr = getCanvasPixelRatio();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const viewport = page.getViewport({ scale: scale * dpr });
        const cssViewport = page.getViewport({ scale });

        const displayWidth = Math.floor(cssViewport.width);
        const displayHeight = Math.floor(cssViewport.height);

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;

        setDimensions({
          width: displayWidth,
          height: displayHeight
        });

        // Paint background pure white
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if ('direction' in ctx) {
          ctx.direction = 'ltr';
        }
        if ('letterSpacing' in ctx) {
          (ctx as any).letterSpacing = '0px';
        }
        if ('wordSpacing' in ctx) {
          (ctx as any).wordSpacing = '0px';
        }

        const renderTask = page.render({
          canvas: canvas,
          canvasContext: ctx,
          viewport: viewport,
          intent: 'display'
        });

        currentRenderTaskRef.current = renderTask;
        await renderTask.promise;

        if (isCurrentEffect) {
          setHasRenderedOnce(true);
          lastRenderedScaleRef.current = scale;
          lastRenderedPageRef.current = pageNumber;
          currentRenderTaskRef.current = null;
        }

        // Render Selectable Text Layer during browser idle window to avoid blocking 120Hz frame budget
        if (isCurrentEffect && textLayerRef.current) {
          const scheduleIdle = typeof window !== 'undefined' && 'requestIdleCallback' in window
            ? (cb: () => void) => (window as any).requestIdleCallback(cb, { timeout: 120 })
            : (cb: () => void) => setTimeout(cb, 30);

          scheduleIdle(async () => {
            if (!isCurrentEffect || !textLayerRef.current) return;
            try {
              const container = textLayerRef.current;
              container.innerHTML = '';
              container.style.setProperty('--total-scale-factor', `${scale}`);
              container.style.setProperty('--scale-round-x', '1px');
              container.style.setProperty('--scale-round-y', '1px');

              const textContent = await page.getTextContent();
              if (!isCurrentEffect || !textLayerRef.current) return;
              const textLayer = new TextLayer({
                textContentSource: textContent,
                container: container,
                viewport: cssViewport
              });
              await textLayer.render();
              if (isCurrentEffect) {
                setTextLayerVersion((version) => version + 1);
              }
            } catch {
              // Non-blocking
            }
          });
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn(`Render notice on page ${pageNumber}:`, err);
        }
      }
    };

    renderPage();

    return () => {
      isCurrentEffect = false;
      if (currentRenderTaskRef.current) {
        currentRenderTaskRef.current.cancel();
        currentRenderTaskRef.current = null;
      }
    };
  }, [doc, pageNumber, scale, isVisible, hasRenderedOnce]);

  // Apply Search Highlight Markers inside TextLayer without injecting HTML
  useEffect(() => {
    const container = textLayerRef.current;
    if (!container || !hasRenderedOnce) return;

    // Restore the original text nodes before applying a new query.
    const existingMarks = container.querySelectorAll('mark.search-highlight');
    existingMarks.forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
    });
    container.normalize();

    if (!searchQuery || !searchQuery.trim() || searchQuery.trim().length < 2) return;

    const safeTerm = searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(safeTerm, 'gi');
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];

    let currentNode = walker.nextNode();
    while (currentNode) {
      if (currentNode.nodeValue) {
        textNodes.push(currentNode as Text);
      }
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
        if (start > cursor) {
          fragment.appendChild(document.createTextNode(text.slice(cursor, start)));
        }

        const marker = document.createElement('mark');
        marker.className = isCurrentSearchPage
          ? 'search-highlight active-search-highlight'
          : 'search-highlight';
        marker.textContent = match[0];
        fragment.appendChild(marker);
        cursor = start + match[0].length;
      }

      if (cursor < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(cursor)));
      }

      textNode.parentNode?.replaceChild(fragment, textNode);
    }
  }, [searchQuery, isCurrentSearchPage, hasRenderedOnce, textLayerVersion]);

  const getThemeFilterStyle = (): React.CSSProperties => {
    switch (theme) {
      case 'amoled':
        // Pure black OLED background with high-contrast sharp white text
        return { filter: 'invert(1) hue-rotate(180deg) contrast(1.06) brightness(0.96)' };
      case 'midnight':
        // Deep obsidian background with soft luminous white text
        return { filter: 'invert(0.92) hue-rotate(185deg) contrast(1.02) brightness(0.94)' };
      case 'amber':
        // Warm dark embers background with candlelit golden text
        return { filter: 'invert(0.92) sepia(0.65) hue-rotate(-25deg) contrast(1.05)' };
      case 'eink':
        return { filter: 'grayscale(1) contrast(1.1)' };
      case 'paper':
      case 'parchment':
      case 'pure':
      default:
        // Pristine original document: zero modification or distortion to the PDF
        return { filter: 'none' };
    }
  };

    const isDark = theme === 'amoled' || theme === 'midnight' || theme === 'amber';
    const paperBg = (() => {
      switch (theme) {
        case 'amoled':
          return '#000000';
        case 'midnight':
          return '#06090f';
        case 'amber':
          return '#140f0c';
        case 'parchment':
          return '#fbf6ea';
        case 'eink':
          return '#e5e7eb';
        case 'pure':
          return '#ffffff';
        case 'paper':
        default:
          return '#fdfcf8';
      }
    })();

    const pageAnnotations = annotations.filter((a) => a.pageNumber === pageNumber);

    const handlePageClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
        setActiveAnno(null);
        return;
      }

      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const xPct = (e.clientX - rect.left) / rect.width;
      const yPct = (e.clientY - rect.top) / rect.height;

      const clickedAnno = pageAnnotations.find((a) =>
        a.rects.some(
          (r) =>
            xPct >= r.xPct - 0.015 &&
            xPct <= r.xPct + r.widthPct + 0.015 &&
            yPct >= r.yPct - 0.015 &&
            yPct <= r.yPct + r.heightPct + 0.03
        )
      );

      if (clickedAnno) {
        setActiveAnno({
          id: clickedAnno.id,
          type: clickedAnno.type,
          x: Math.max(70, Math.min(rect.width - 70, xPct * rect.width)),
          y: Math.max(30, yPct * rect.height - 10)
        });
      } else {
        setActiveAnno(null);
      }
    };

    return (
      <div
        ref={containerRef}
        onClick={handlePageClick}
        dir="ltr"
        data-page-number={pageNumber}
        className="relative flex items-center justify-center overflow-hidden will-change-transform select-text transition-all duration-300"
        style={{
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
          backgroundColor: paperBg
        }}
      >
        {/* Canvas Layer */}
        {(isVisible || hasRenderedOnce) && (
          <canvas
            ref={canvasRef}
            dir="ltr"
            className="block transition-opacity duration-200"
            style={{
              ...getThemeFilterStyle(),
              direction: 'ltr',
              letterSpacing: 'normal',
              wordSpacing: 'normal',
              opacity: hasRenderedOnce ? 1 : 0
            }}
          />
        )}

        {/* Subtle Paper Texture Overlay for tactile themes */}
        {(theme === 'paper' || theme === 'parchment') && (
          <div
            className={`paper-overlay ${theme === 'parchment' ? 'paper-overlay-parchment' : 'paper-overlay-book'}`}
            aria-hidden="true"
          />
        )}

        {/* Real Selectable Text Layer */}
        <div
          ref={textLayerRef}
          dir="ltr"
          data-page-number={pageNumber}
          className="textLayer absolute inset-0 select-text pointer-events-auto z-10"
          style={{
            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`
          }}
        />

        {/* Annotations Layer (Highlights & Underlines) */}
        {pageAnnotations.length > 0 && (
          <div className="absolute inset-0 pointer-events-none z-15 overflow-hidden">
            {pageAnnotations.map((anno) => (
              <div key={anno.id} className="relative w-full h-full">
                {anno.rects.map((r, rIdx) => {
                  if (anno.type === 'highlight') {
                    return (
                      <div
                        key={rIdx}
                        style={{
                          left: `${r.xPct * 100}%`,
                          top: `${r.yPct * 100}%`,
                          width: `${r.widthPct * 100}%`,
                          height: `${r.heightPct * 100}%`,
                          backgroundColor: anno.color,
                          mixBlendMode: isDark ? 'screen' : 'multiply',
                          opacity: isDark ? 0.45 : 0.6
                        }}
                        className="absolute rounded-xs pointer-events-none transition-opacity"
                      />
                    );
                  }

                  // Underline: properly spaced below the text baseline (+ 2.5px) without sticking to letters
                  return (
                    <div
                      key={rIdx}
                      style={{
                        left: `${r.xPct * 100}%`,
                        top: `calc(${r.yPct * 100}% + ${r.heightPct * 100}% + 2.5px)`,
                        width: `${r.widthPct * 100}%`,
                        height: '2px',
                        backgroundColor: anno.color
                      }}
                      className="absolute rounded-full pointer-events-none shadow-xs"
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Quick Click-to-Delete Mini Popup for clicked annotations */}
        {activeAnno && onDeleteAnnotation && (
          <div
            style={{
              left: `${activeAnno.x}px`,
              top: `${activeAnno.y}px`,
              transform: 'translate(-50%, -100%)'
            }}
            className="absolute z-40 flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-surface text-ink border border-line-strong shadow-2xl backdrop-blur-2xl text-xs select-none animate-in fade-in zoom-in-95 pointer-events-auto"
          >
            <span className="text-[11px] text-ink-muted font-sans">
              {activeAnno.type === 'highlight'
                ? lang === 'ar'
                  ? 'تظليل'
                  : 'Highlight'
                : lang === 'ar'
                  ? 'تسطير'
                  : 'Underline'}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteAnnotation(activeAnno.id);
                setActiveAnno(null);
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 text-danger-ink transition-colors text-xs cursor-pointer font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'إلغاء' : 'Delete'}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveAnno(null);
              }}
              className="p-1 rounded-lg hover:bg-hover text-ink-muted hover:text-ink transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Loading Placeholder */}
        {!hasRenderedOnce && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-xs opacity-25 select-none font-mono z-15">
            <div className="w-6 h-6 rounded-full border-2 border-current border-t-transparent animate-spin mb-2" />
            <span>{lang === 'ar' ? `صفحة ${pageNumber}` : `Page ${pageNumber}`}</span>
          </div>
        )}

        {/* Page Badge */}
        <div className="absolute bottom-2 right-3 px-1.5 py-0.5 rounded text-[10px] font-mono opacity-25 pointer-events-none bg-line dark:bg-hover z-20">
          {pageNumber}
        </div>
      </div>
    );
};
