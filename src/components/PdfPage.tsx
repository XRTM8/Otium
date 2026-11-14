import React, { useLayoutEffect, useMemo, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { AlertTriangle, RefreshCw, StickyNote, Trash2, X } from 'lucide-react';
import type { ThemeMode, TextAnnotation } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { DocumentInkLayer } from './DocumentInk';
import { useDocumentInteraction } from './documentInkContext';
import { drawAnnotationLayer, PAGE_BACKGROUND } from './pdfPageCanvas';
import { usePdfPageRender } from './usePdfPageRender';

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

const EMPTY_ANNOTATIONS: TextAnnotation[] = [];

const PdfPageView: React.FC<PdfPageProps> = ({
  doc,
  pageNumber,
  scale,
  theme,
  annotations = EMPTY_ANNOTATIONS,
  onDeleteAnnotation,
  baseAspectRatio,
  searchQuery,
  isCurrentSearchPage,
  lang = 'ar',
  renderPriority = 0
}) => {
  const { mode } = useDocumentInteraction();
  const [activeAnno, setActiveAnno] = useState<ActiveAnnotation | null>(null);
  const {
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
  } = usePdfPageRender({
    doc,
    pageNumber,
    scale,
    theme,
    baseAspectRatio,
    searchQuery,
    isCurrentSearchPage,
    renderPriority,
  });

  const pageAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.pageNumber === pageNumber),
    [annotations, pageNumber]
  );

  // Highlights are painted once into one canvas per page. The previous DOM
  // implementation created a blended, animated layer for every line box,
  // which became both visually muddy and expensive on long highlighted pages.
  useLayoutEffect(() => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;

    drawAnnotationLayer(
      canvas,
      pageAnnotations,
      pageSize.width,
      pageSize.height,
      isDark
    );
  }, [pageAnnotations, pageSize.width, pageSize.height, isDark, annotationCanvasRef]);

  const handlePageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (mode !== 'select') { setActiveAnno(null); return; }
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

    const clicked = pageAnnotations.find((annotation) => annotation.id !== '__beam_selection' &&
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
      onContextMenu={(event) => { if (mode !== 'select') event.preventDefault(); }}
      dir="ltr"
      data-page-number={pageNumber}
      data-pdf-page={pageNumber}
      className="pdf-page-slot relative flex items-center justify-center overflow-hidden select-none shrink-0 max-w-none"
      style={{
        width: `${dimensions.width}px`,
        height: `${dimensions.height}px`,
        backgroundColor: PAGE_BACKGROUND[pageTheme]
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

      {/* High-definition annotation canvas isolated from background filters */}
      <DocumentInkLayer page={pageNumber} width={dimensions.width} height={dimensions.height} lang={lang} />
      <canvas
        ref={annotationCanvasRef}
        aria-hidden="true"
        className="absolute inset-0 z-[8] pointer-events-none"
        style={{
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
          mixBlendMode: isDark ? 'screen' : 'multiply'
        }}
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
        className={`textLayer absolute inset-0 z-10 ${mode === 'select' ? 'select-text pointer-events-auto' : 'select-none pointer-events-none'}`}
        style={{ transform: `scale(${scale})`, userSelect: mode === 'select' ? 'text' : 'none', WebkitUserSelect: mode === 'select' ? 'text' : 'none' }}
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

      {!hasRenderedOnce && !renderError && (
        <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-widest text-ink-faint opacity-50 select-none">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>{lang === 'ar' ? `صفحة ${pageNumber}` : `Page ${pageNumber}`}</span>
        </div>
      )}

      {renderError && !hasRenderedOnce && (
        <div className="absolute inset-0 z-[6] flex flex-col items-center justify-center gap-2.5 p-4 text-center select-none bg-surface/85 backdrop-blur-xs">
          <AlertTriangle className="w-5 h-5 text-danger-ink opacity-80" />
          <span className="text-[11px] font-medium text-ink-muted">
            {lang === 'ar' ? `تعذر تحميل صفحة ${pageNumber}` : `Failed to load page ${pageNumber}`}
          </span>
          <button
            type="button"
            onClick={retryRender}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-hover border border-line text-xs font-medium text-ink hover:bg-hover-strong active:scale-95 transition-all cursor-pointer shadow-xs"
          >
            <RefreshCw className="w-3 h-3" />
            <span>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
          </button>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-2 right-3 z-20 rounded bg-line/60 px-1.5 py-0.5 font-mono text-[10px] opacity-30">
        {pageNumber}
      </div>
    </div>
  );
};

export const PdfPage = React.memo(PdfPageView);
