import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import type { ThemeMode, PaperStyle, TextAnnotation } from '../types';

interface PdfPageProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  theme: ThemeMode;
  paperStyle?: PaperStyle;
  annotations?: TextAnnotation[];
  onDeleteAnnotation?: (id: string) => void;
  onNavigateToPage?: (pageNumber: number) => void;
  baseAspectRatio: number;
  searchQuery?: string;
  isCurrentSearchPage?: boolean;
  onPageVisible?: (pageNumber: number) => void;
}

export const PdfPage: React.FC<PdfPageProps> = ({
  doc,
  pageNumber,
  scale,
  theme,
  paperStyle = 'book',
  annotations = [],
  baseAspectRatio,
  searchQuery,
  isCurrentSearchPage,
  onPageVisible
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasRenderedOnce, setHasRenderedOnce] = useState(false);
  const currentRenderTaskRef = useRef<any>(null);
  const lastRenderedScaleRef = useRef<number>(0);

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

    // Skip if already rendered at this exact scale
    if (hasRenderedOnce && Math.abs(lastRenderedScaleRef.current - scale) < 0.01) {
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

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
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

        // Render Selectable Text Layer with precise scale factors
        if (isCurrentEffect && textLayerRef.current) {
          try {
            const container = textLayerRef.current;
            container.innerHTML = '';
            container.style.setProperty('--total-scale-factor', `${scale}`);
            container.style.setProperty('--scale-round-x', '1px');
            container.style.setProperty('--scale-round-y', '1px');

            const textContent = await page.getTextContent();
            const textLayer = new TextLayer({
              textContentSource: textContent,
              container: container,
              viewport: cssViewport
            });
            await textLayer.render();
          } catch (textErr) {
            console.warn('TextLayer notice:', textErr);
          }
        }

        if (isCurrentEffect) {
          setHasRenderedOnce(true);
          lastRenderedScaleRef.current = scale;
          currentRenderTaskRef.current = null;
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

  // Apply Search Highlight Markers inside TextLayer
  useEffect(() => {
    const container = textLayerRef.current;
    if (!container || !hasRenderedOnce) return;

    // Clean previous highlights
    const existingMarks = container.querySelectorAll('.search-highlight');
    existingMarks.forEach((m) => {
      const parent = m.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(m.textContent || ''), m);
        parent.normalize();
      }
    });

    if (!searchQuery || !searchQuery.trim() || searchQuery.length < 2) return;

    const safeTerm = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${safeTerm})`, 'gi');

    const spans = container.querySelectorAll('span');
    spans.forEach((span) => {
      const text = span.textContent || '';
      if (regex.test(text)) {
        span.innerHTML = text.replace(
          regex,
          `<mark class="search-highlight ${isCurrentSearchPage ? 'active-search-highlight' : ''}">$1</mark>`
        );
      }
    });
  }, [searchQuery, isCurrentSearchPage, hasRenderedOnce]);

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
    const paperBg = isDark
      ? theme === 'amoled'
        ? '#000000'
        : theme === 'midnight'
        ? '#06090f'
        : '#140f0c'
      : paperStyle === 'smooth'
      ? '#ffffff'
      : paperStyle === 'parchment'
      ? '#fbf6ea'
      : paperStyle === 'kraft'
      ? '#f4ede1'
      : paperStyle === 'moleskine'
      ? '#faf6ee'
      : paperStyle === 'linen'
      ? '#f9f8f5'
      : '#fdfcf8';

    const pageAnnotations = annotations.filter((a) => a.pageNumber === pageNumber);

    return (
      <div
        ref={containerRef}
        dir="ltr"
        data-page-number={pageNumber}
        className={`relative flex items-center justify-center overflow-hidden will-change-transform select-text transition-all duration-300 paper-container-${paperStyle || 'book'}`}
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

        {/* Subtle Paper Texture Overlay (Untouched PDF Canvas underneath) */}
        {paperStyle !== 'smooth' && (
          <div
            className={`paper-overlay paper-overlay-${paperStyle}`}
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

                  // Underline
                  return (
                    <div
                      key={rIdx}
                      style={{
                        left: `${r.xPct * 100}%`,
                        top: `calc(${r.yPct * 100}% + ${r.heightPct * 100}% - 2.5px)`,
                        width: `${r.widthPct * 100}%`,
                        height: '2.5px',
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

        {/* Loading Placeholder */}
        {!hasRenderedOnce && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-xs opacity-25 select-none font-mono z-15">
            <div className="w-6 h-6 rounded-full border-2 border-current border-t-transparent animate-spin mb-2" />
            <span>صفحة {pageNumber}</span>
          </div>
        )}

        {/* Page Badge */}
        <div className="absolute bottom-2 right-3 px-1.5 py-0.5 rounded text-[10px] font-mono opacity-25 pointer-events-none bg-black/10 dark:bg-white/10 z-20">
          {pageNumber}
        </div>
      </div>
    );
};
