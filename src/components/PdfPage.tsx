import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { ThemeMode } from '../types';

interface PdfPageProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  theme: ThemeMode;
  baseAspectRatio: number;
  onPageVisible?: (pageNumber: number) => void;
}

export const PdfPage: React.FC<PdfPageProps> = ({
  doc,
  pageNumber,
  scale,
  theme,
  baseAspectRatio,
  onPageVisible
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  // Fetch precise dimensions once
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
          // Keep visible once entered unless far away
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

  // Robust Canvas Rendering Pipeline
  useEffect(() => {
    if (!isVisible) return;

    // Skip if already rendered at this exact scale
    if (hasRenderedOnce && Math.abs(lastRenderedScaleRef.current - scale) < 0.01) {
      return;
    }

    let isCurrentEffect = true;

    const renderPage = async () => {
      try {
        // Cancel any in-flight render task on this page
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

        const displayWidth = Math.floor(viewport.width / dpr);
        const displayHeight = Math.floor(viewport.height / dpr);

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;

        // Critical: Always fill the background with solid white before PDF rendering
        // This prevents transparent PDFs from appearing black or inverting to white-on-white!
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Enforce LTR coordinates and normal letter-spacing
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

  const getThemeFilterStyle = (): React.CSSProperties => {
    switch (theme) {
      case 'paper':
        return { filter: 'sepia(0.3) contrast(0.98) brightness(0.98)' };
      case 'midnight':
        return { filter: 'invert(0.92) hue-rotate(180deg) contrast(1.02)' };
      case 'eink':
        return { filter: 'grayscale(1) contrast(1.05)' };
      case 'amber':
        return { filter: 'invert(0.9) sepia(0.4) hue-rotate(-20deg) contrast(1.02)' };
      case 'pure':
      default:
        return { filter: 'none' };
    }
  };

  return (
    <div
      ref={containerRef}
      dir="ltr"
      className="relative flex items-center justify-center shadow-xl rounded-sm overflow-hidden will-change-transform"
      style={{
        width: `${dimensions.width}px`,
        height: `${dimensions.height}px`,
        backgroundColor: theme === 'midnight' || theme === 'amber' ? '#121212' : '#ffffff'
      }}
    >
      {/* Canvas is always mounted if isVisible OR if it has rendered once, ensuring text NEVER disappears */}
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

      {/* Loading Placeholder only shown before the first render */}
      {!hasRenderedOnce && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-xs opacity-30 select-none font-mono">
          <div className="w-6 h-6 rounded-full border-2 border-current border-t-transparent animate-spin mb-2" />
          <span>صفحة {pageNumber}</span>
        </div>
      )}

      {/* Page Badge */}
      <div className="absolute bottom-2 right-3 px-1.5 py-0.5 rounded text-[10px] font-mono opacity-25 pointer-events-none bg-black/10 dark:bg-white/10">
        {pageNumber}
      </div>
    </div>
  );
};
