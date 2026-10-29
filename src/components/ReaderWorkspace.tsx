import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { TextAnnotation, ThemeMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import type { ReaderController } from '../app/useReaderController';
import { markScrollActivity } from '../core/reader/renderScheduler';
import { PdfPage } from './PdfPage';
import { ErrorBoundary } from './ErrorBoundary';

interface PageSlotProps {
  pageNum: number;
  isNear: boolean;
  doc: PDFDocumentProxy;
  scale: number;
  theme: ThemeMode;
  annotations: TextAnnotation[];
  onDeleteAnnotation: (id: string) => void;
  baseAspectRatio: number;
  basePageWidth?: number;
  basePageHeight?: number;
  searchQuery?: string;
  isCurrentSearchPage?: boolean;
  lang: Language;
  renderPriority: number;
}

const PageSlotView: React.FC<PageSlotProps> = ({
  pageNum,
  isNear,
  doc,
  scale,
  theme,
  annotations,
  onDeleteAnnotation,
  baseAspectRatio,
  basePageWidth = 595,
  basePageHeight = 842,
  searchQuery,
  isCurrentSearchPage,
  lang,
  renderPriority
}) => {
  const standardWidth = Math.round(basePageWidth * scale);
  const standardHeight = Math.round(basePageHeight * scale);

  return (
    <div
      id={`pdf-page-${pageNum}`}
      dir="ltr"
      data-page-slot={pageNum}
      style={{
        width: `${standardWidth}px`,
        height: `${standardHeight}px`,
        contentVisibility: 'auto',
        containIntrinsicSize: `${standardWidth}px ${standardHeight}px`,
        contain: 'layout paint'
      }}
      className="pdf-page-frame my-4 sm:my-5 mx-auto flex items-center justify-center"
    >
      {isNear ? (
        <ErrorBoundary
          resetKey={`${pageNum}-${scale}`}
          fallback={(err, reset) => (
            <div
              style={{ width: `${standardWidth}px`, height: `${standardHeight}px` }}
              className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-danger-ink/30 bg-surface/50 rounded-xl select-none"
            >
              <AlertTriangle className="w-8 h-8 text-danger-ink mb-2 opacity-80" />
              <span className="text-xs font-semibold text-ink mb-1">
                {lang === 'ar' ? `تعذر عرض الصفحة ${pageNum}` : `Failed to render page ${pageNum}`}
              </span>
              <p className="text-[10px] text-ink-muted mb-3 max-w-[220px] truncate">
                {err.message || (lang === 'ar' ? 'خطأ غير متوقع' : 'Unexpected error')}
              </p>
              <button
                type="button"
                onClick={reset}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-on-accent text-xs font-medium cursor-pointer active:scale-95 transition-transform"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
              </button>
            </div>
          )}
        >
          <PdfPage
            doc={doc}
            pageNumber={pageNum}
            scale={scale}
            theme={theme}
            annotations={annotations}
            onDeleteAnnotation={onDeleteAnnotation}
            baseAspectRatio={baseAspectRatio}
            searchQuery={searchQuery}
            isCurrentSearchPage={isCurrentSearchPage}
            lang={lang}
            renderPriority={renderPriority}
          />
        </ErrorBoundary>
      ) : (
        <div
          style={{ width: `${standardWidth}px`, height: `${standardHeight}px` }}
          className="flex items-center justify-center rounded-sm border border-dashed border-line-subtle bg-hover-subtle font-mono text-xs opacity-25 select-none"
        >
          <span>{lang === 'ar' ? `صفحة ${pageNum}` : `Page ${pageNum}`}</span>
        </div>
      )}
    </div>
  );
};

const PageSlot = React.memo(PageSlotView);

interface ReaderWorkspaceProps {
  reader: ReaderController;
  compact?: boolean;
}

/**
 * The reading surface shared by both shells. It owns layout, page geometry and
 * gestures; toolbars and platform navigation stay in the shells.
 */
export const ReaderWorkspace: React.FC<ReaderWorkspaceProps> = ({ reader, compact = false }) => {
  const {
    doc,
    numPages,
    currentPage,
    zoom,
    theme,
    viewMode,
    lang,
    baseAspectRatio,
    basePageSize,
    annotations,
    deleteAnnotation,
    searchQuery,
    activeSearchPage,
    isImmersive,
    handlePageVisible,
    goToNextPage,
    goToPrevPage,
    scrollContainerRef,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    isDraggingTouch,
    dualFlipKey,
    dualFlipDir,
    numberJumpDisplay
  } = reader;

  const [compactLandscape, setCompactLandscape] = useState(false);
  const [showScrubberPill, setShowScrubberPill] = useState(false);
  const scrubberTimeoutRef = useRef<number | null>(null);
  const isRtl = lang === 'ar';
  const lastScrollPageRef = useRef<number>(currentPage);
  const scrollFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!compact || typeof window === 'undefined') return;
    const query = window.matchMedia('(orientation: landscape) and (max-height: 540px)');
    const update = () => setCompactLandscape(query.matches);
    update();
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', update);
      return () => query.removeEventListener('change', update);
    } else if (typeof (query as any).addListener === 'function') {
      (query as any).addListener(update);
      return () => (query as any).removeListener(update);
    }
  }, [compact]);

  // Continuous mode owns page visibility. IntersectionObserver with a fixed
  // rootMargin jumps around during inertial scrolling; measuring against the
  // reading line is stable and marks the scheduler so distant pages wait.
  useEffect(() => {
    if (viewMode !== 'continuous' || !doc) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    lastScrollPageRef.current = currentPage;

    const measure = () => {
      scrollFrameRef.current = null;
      if (numPages === 0) return;

      const approxSlotHeight = Math.max(100, (basePageSize?.height || 842) * zoom + 32);
      const estimatedPage = Math.max(
        1,
        Math.min(numPages, Math.floor(container.scrollTop / approxSlotHeight) + 1)
      );

      const containerRect = container.getBoundingClientRect();
      const readingLine = containerRect.top + containerRect.height * 0.38;
      let bestPage = lastScrollPageRef.current;
      let bestDistance = Number.POSITIVE_INFINITY;

      // Candidate window around estimated page to avoid querying hundreds of elements
      const minPage = Math.max(1, estimatedPage - 3);
      const maxPage = Math.min(numPages, estimatedPage + 4);
      let foundInWindow = false;

      for (let p = minPage; p <= maxPage; p += 1) {
        const slot = document.getElementById(`pdf-page-${p}`);
        if (!slot) continue;
        const rect = slot.getBoundingClientRect();
        if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) continue;
        foundInWindow = true;
        const distance = Math.abs(rect.top + Math.min(rect.height * 0.25, 96) - readingLine);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPage = p;
        }
      }

      // Safe fallback if irregular heights caused the candidate window to miss
      if (!foundInWindow) {
        const slots = container.querySelectorAll<HTMLElement>('[data-page-slot]');
        slots.forEach((slot) => {
          const rect = slot.getBoundingClientRect();
          if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) return;
          const distance = Math.abs(rect.top + Math.min(rect.height * 0.25, 96) - readingLine);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestPage = Number.parseInt(slot.dataset.pageSlot || '', 10) || bestPage;
          }
        });
      }

      if (bestPage !== lastScrollPageRef.current) {
        lastScrollPageRef.current = bestPage;
        handlePageVisible(bestPage);
      }
    };

    const onScroll = () => {
      markScrollActivity();
      setShowScrubberPill(true);
      if (scrubberTimeoutRef.current !== null) {
        window.clearTimeout(scrubberTimeoutRef.current);
      }
      scrubberTimeoutRef.current = window.setTimeout(() => {
        setShowScrubberPill(false);
      }, 1600);

      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(measure);
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [viewMode, doc, currentPage, numPages, basePageSize, zoom, handlePageVisible, scrollContainerRef]);

  useEffect(() => {
    if (!isImmersive) return;
    setShowScrubberPill(true);
    if (scrubberTimeoutRef.current !== null) {
      window.clearTimeout(scrubberTimeoutRef.current);
    }
    scrubberTimeoutRef.current = window.setTimeout(() => {
      setShowScrubberPill(false);
    }, 1600);
  }, [currentPage, isImmersive]);

  useEffect(() => {
    return () => {
      if (scrubberTimeoutRef.current !== null) {
        window.clearTimeout(scrubberTimeoutRef.current);
      }
    };
  }, []);

  // When the page fits vertically, vertical touch gestures turn pages instead
  // of panning: block native vertical panning so the page stays perfectly
  // still until release. Overflowing pages keep native scrolling first.
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (!doc || viewMode === 'continuous') {
      container.style.touchAction = 'pan-x pan-y';
      return;
    }
    let tallest = 0;
    container.querySelectorAll<HTMLElement>('[data-pdf-page]').forEach((page) => {
      tallest = Math.max(tallest, page.getBoundingClientRect().height);
    });
    container.style.touchAction =
      tallest > 0 && tallest <= container.clientHeight - 48 ? 'pan-x' : 'pan-x pan-y';
  }, [doc, viewMode, currentPage, zoom, compactLandscape, scrollContainerRef]);

  const continuousPages = useMemo(
    () => Array.from({ length: numPages }, (_, index) => index + 1),
    [numPages]
  );

  const EMPTY_ANNOTATIONS = useMemo<TextAnnotation[]>(() => [], []);
  const annotationsByPage = useMemo(() => {
    if (!annotations || annotations.length === 0) return null;
    const map = new Map<number, TextAnnotation[]>();
    for (const a of annotations) {
      const list = map.get(a.pageNumber);
      if (list) {
        list.push(a);
      } else {
        map.set(a.pageNumber, [a]);
      }
    }
    return map;
  }, [annotations]);

  if (!doc) return null;

  // The controller writes this custom property directly on the scroll
  // container during a pan, so moving a finger never triggers a React render.
  const gestureTransform = 'translate3d(var(--otium-swipe-x, 0px), 0, 0)';
  const gestureTransition = isDraggingTouch
    ? 'none'
    : 'transform 240ms cubic-bezier(0.16, 1, 0.3, 1)';
  const pagedAnimation =
    !isDraggingTouch && dualFlipKey > 0
      ? `pagedTurn${
          isRtl
            ? dualFlipDir === 'forward'
              ? 'Backward'
              : 'Forward'
            : dualFlipDir === 'forward'
              ? 'Forward'
              : 'Backward'
        } 240ms cubic-bezier(0.16, 1, 0.3, 1) both`
      : undefined;
  const dualAnimation =
    !isDraggingTouch && dualFlipKey > 0
      ? `dualPageFlip${
          isRtl
            ? dualFlipDir === 'forward'
              ? 'Backward'
              : 'Forward'
            : dualFlipDir === 'forward'
              ? 'Forward'
              : 'Backward'
        } 260ms cubic-bezier(0.16, 1, 0.3, 1) both`
      : undefined;

  // In an Arabic book odd pages sit on the right, so the first page of a
  // spread is on the right for odd numbers and on the left for even ones.
  // Keeping the parity correct means a page jump to page 2 still reads as a
  // proper two-page spread instead of mirroring the wrong pair.
  const reverseSpread = isRtl && currentPage % 2 === 1;

  // Anchored scrolling (page search, outline, mode switch) must land below the
  // floating toolbar instead of underneath it.
  const topInset = compactLandscape
    ? 'max(3rem, calc(env(safe-area-inset-top, 0px) + 2.6rem))'
    : compact
      ? 'max(4.1rem, calc(env(safe-area-inset-top, 0px) + 3.6rem))'
      : 'max(4.5rem, calc(env(safe-area-inset-top, 0px) + 4.2rem))';
  const immersiveInset = compactLandscape
    ? 'max(0.35rem, calc(env(safe-area-inset-top, 0px) + 0.25rem))'
    : 'max(0.5rem, env(safe-area-inset-top, 0px))';
  const effectiveTopInset = isImmersive ? immersiveInset : topInset;
  const bottomInset = isImmersive
    ? 'max(0.5rem, env(safe-area-inset-bottom, 0px))'
    : compactLandscape
      ? 'max(3.2rem, calc(env(safe-area-inset-bottom, 0px) + 2.8rem))'
      : compact
        ? reader.showMobileNavBar
          ? 'max(5.5rem, calc(env(safe-area-inset-bottom, 0px) + 5rem))'
          : 'max(2.5rem, calc(env(safe-area-inset-bottom, 0px) + 2rem))'
        : undefined;

  return (
    <div
      ref={scrollContainerRef}
      dir="ltr"
      role="main"
      aria-label={lang === 'ar' ? 'مساحة قراءة المستند' : 'Document reading area'}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      style={{
        paddingTop: effectiveTopInset,
        scrollPaddingTop: effectiveTopInset,
        paddingBottom: bottomInset,
        transition:
          'padding-top 280ms cubic-bezier(0.22, 1, 0.36, 1), padding-bottom 280ms cubic-bezier(0.22, 1, 0.36, 1)',
        ...(compact
          ? {
              paddingLeft: 'max(0.5rem, env(safe-area-inset-left, 0px))',
              paddingRight: 'max(0.5rem, env(safe-area-inset-right, 0px))'
            }
          : {}),
        touchAction: 'pan-x pan-y'
      }}
      className="reader-viewport flex-1 w-full h-full overflow-y-auto overflow-x-auto overscroll-contain pb-20 sm:pb-24 px-2 sm:px-4 relative"
    >
      {/* Reading progress for the current document. */}
      <div
        aria-hidden={isImmersive}
        role="progressbar"
        aria-label={lang === 'ar' ? 'تقدّم القراءة' : 'Reading progress'}
        aria-valuemin={1}
        aria-valuemax={Math.max(1, numPages)}
        aria-valuenow={currentPage}
        className={`fixed top-0 inset-x-0 h-[2px] bg-line z-40 pointer-events-none transition-opacity duration-300 ${
          isImmersive ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{ width: `${(currentPage / Math.max(1, numPages)) * 100}%` }}
        />
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {lang === 'ar'
          ? `الصفحة ${currentPage} من ${numPages}`
          : `Page ${currentPage} of ${numPages}`}
      </div>

      {viewMode !== 'continuous' && (
        <>
          <button
            type="button"
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
            tabIndex={isImmersive ? -1 : undefined}
            title={lang === 'ar' ? 'الصفحة السابقة' : 'Previous page'}
            aria-label={lang === 'ar' ? 'الصفحة السابقة' : 'Previous page'}
            className={`paged-arrow fixed top-1/2 -translate-y-1/2 z-30 p-2 sm:p-2.5 rounded-full text-ink disabled:opacity-0 transition-opacity duration-300 ${
              isRtl ? 'right-2 sm:right-5' : 'left-2 sm:left-5'
            }`}
            style={
              isImmersive
                ? { opacity: 0, pointerEvents: 'none' }
                : undefined
            }
          >
            {isRtl ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
          <button
            type="button"
            onClick={goToNextPage}
            disabled={currentPage >= numPages}
            tabIndex={isImmersive ? -1 : undefined}
            title={lang === 'ar' ? 'الصفحة التالية' : 'Next page'}
            aria-label={lang === 'ar' ? 'الصفحة التالية' : 'Next page'}
            className={`paged-arrow fixed top-1/2 -translate-y-1/2 z-30 p-2 sm:p-2.5 rounded-full text-ink disabled:opacity-0 transition-opacity duration-300 ${
              isRtl ? 'left-2 sm:left-5' : 'right-2 sm:right-5'
            }`}
            style={
              isImmersive
                ? { opacity: 0, pointerEvents: 'none' }
                : undefined
            }
          >
            {isRtl ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
        </>
      )}

      {viewMode === 'continuous' ? (
        <div className="w-max min-w-full flex flex-col items-center">
          {continuousPages.map((pageNum) => {
            const distance = Math.abs(pageNum - currentPage);
            const isNear = distance <= (compact ? 2 : 3);
            const pageAnnotations = annotationsByPage
              ? (annotationsByPage.get(pageNum) ?? EMPTY_ANNOTATIONS)
              : EMPTY_ANNOTATIONS;

            return (
              <PageSlot
                key={pageNum}
                pageNum={pageNum}
                isNear={isNear}
                doc={doc}
                scale={zoom}
                theme={theme}
                annotations={pageAnnotations}
                onDeleteAnnotation={deleteAnnotation}
                baseAspectRatio={baseAspectRatio}
                basePageWidth={basePageSize.width}
                basePageHeight={basePageSize.height}
                searchQuery={searchQuery}
                isCurrentSearchPage={activeSearchPage === pageNum}
                lang={lang}
                renderPriority={isNear ? distance : 10}
              />
            );
          })}
        </div>
      ) : viewMode === 'dual' ? (
        <div className="min-h-full w-max min-w-full flex items-center justify-center py-2 sm:py-4 overflow-hidden">
          <div
            style={{
              transform: gestureTransform,
              transition: gestureTransition,
              willChange: 'transform'
            }}
          >
            <div
              key={`dual-${dualFlipKey}`}
              className="flex items-center justify-center gap-0 shadow-2xl rounded-sm overflow-hidden"
              style={{
                animation: dualAnimation,
                willChange: 'transform, opacity',
                flexDirection: reverseSpread ? 'row-reverse' : 'row'
              }}
            >
              <div className={`relative shrink-0 ${reverseSpread ? 'book-gutter-inner-left' : 'book-gutter-inner-right'}`}>
                <ErrorBoundary
                  resetKey={`dual-${currentPage}-${zoom}`}
                  fallback={(_err, reset) => (
                    <div
                      style={{
                        width: Math.round(basePageSize.width * zoom),
                        height: Math.round(basePageSize.height * zoom)
                      }}
                      className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-danger-ink/30 bg-surface/50 rounded-xl select-none"
                    >
                      <AlertTriangle className="w-8 h-8 text-danger-ink mb-2 opacity-80" />
                      <span className="text-xs font-semibold text-ink mb-1">
                        {lang === 'ar' ? `تعذر عرض الصفحة ${currentPage}` : `Failed to render page ${currentPage}`}
                      </span>
                      <button
                        type="button"
                        onClick={reset}
                        className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-on-accent text-xs font-medium cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
                      </button>
                    </div>
                  )}
                >
                  <PdfPage
                    doc={doc}
                    pageNumber={currentPage}
                    scale={zoom}
                    theme={theme}
                    annotations={annotationsByPage ? (annotationsByPage.get(currentPage) ?? EMPTY_ANNOTATIONS) : EMPTY_ANNOTATIONS}
                    onDeleteAnnotation={deleteAnnotation}
                    baseAspectRatio={baseAspectRatio}
                    searchQuery={searchQuery}
                    isCurrentSearchPage={activeSearchPage === currentPage}
                    lang={lang}
                    renderPriority={0}
                  />
                </ErrorBoundary>
              </div>

              {currentPage + 1 <= numPages ? (
                <div className={`relative shrink-0 ${reverseSpread ? 'border-r book-gutter-inner-right' : 'border-l book-gutter-inner-left'} border-line/40`}>
                  <ErrorBoundary
                    resetKey={`dual-${currentPage + 1}-${zoom}`}
                    fallback={(_err, reset) => (
                      <div
                        style={{
                          width: Math.round(basePageSize.width * zoom),
                          height: Math.round(basePageSize.height * zoom)
                        }}
                        className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-danger-ink/30 bg-surface/50 rounded-xl select-none"
                      >
                        <AlertTriangle className="w-8 h-8 text-danger-ink mb-2 opacity-80" />
                        <span className="text-xs font-semibold text-ink mb-1">
                          {lang === 'ar' ? `تعذر عرض الصفحة ${currentPage + 1}` : `Failed to render page ${currentPage + 1}`}
                        </span>
                        <button
                          type="button"
                          onClick={reset}
                          className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-on-accent text-xs font-medium cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
                        </button>
                      </div>
                    )}
                  >
                    <PdfPage
                      doc={doc}
                      pageNumber={currentPage + 1}
                      scale={zoom}
                      theme={theme}
                      annotations={annotationsByPage ? (annotationsByPage.get(currentPage + 1) ?? EMPTY_ANNOTATIONS) : EMPTY_ANNOTATIONS}
                      onDeleteAnnotation={deleteAnnotation}
                      baseAspectRatio={baseAspectRatio}
                      searchQuery={searchQuery}
                      isCurrentSearchPage={activeSearchPage === currentPage + 1}
                      lang={lang}
                      renderPriority={1}
                    />
                  </ErrorBoundary>
                </div>
              ) : (
                <div
                  style={{
                    width: Math.round(basePageSize.width * zoom),
                    height: Math.round(basePageSize.height * zoom)
                  }}
                  className="hidden sm:flex items-center justify-center border border-dashed border-line rounded-xs text-xs text-ink-faint font-mono"
                >
                  {lang === 'ar' ? 'نهاية المستند' : 'End of Document'}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            transform: gestureTransform,
            transition: gestureTransition,
            willChange: 'transform'
          }}
          className="min-h-full w-max min-w-full flex items-center justify-center py-2 sm:py-4 overflow-hidden"
        >
          <div
            key={`single-${dualFlipKey}`}
            style={{ animation: pagedAnimation, willChange: 'transform, opacity' }}
          >
            <ErrorBoundary
              resetKey={`single-${currentPage}-${zoom}`}
              fallback={(_err, reset) => (
                <div
                  style={{
                    width: Math.round(basePageSize.width * zoom),
                    height: Math.round(basePageSize.height * zoom)
                  }}
                  className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-danger-ink/30 bg-surface/50 rounded-xl select-none"
                >
                  <AlertTriangle className="w-8 h-8 text-danger-ink mb-2 opacity-80" />
                  <span className="text-xs font-semibold text-ink mb-1">
                    {lang === 'ar' ? `تعذر عرض الصفحة ${currentPage}` : `Failed to render page ${currentPage}`}
                  </span>
                  <button
                    type="button"
                    onClick={reset}
                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-on-accent text-xs font-medium cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
                  </button>
                </div>
              )}
            >
              <PdfPage
                doc={doc}
                pageNumber={currentPage}
                scale={zoom}
                theme={theme}
                annotations={annotationsByPage ? (annotationsByPage.get(currentPage) ?? EMPTY_ANNOTATIONS) : EMPTY_ANNOTATIONS}
                onDeleteAnnotation={deleteAnnotation}
                baseAspectRatio={baseAspectRatio}
                searchQuery={searchQuery}
                isCurrentSearchPage={activeSearchPage === currentPage}
                lang={lang}
                renderPriority={0}
              />
            </ErrorBoundary>
          </div>
        </div>
      )}

      {/* Zen Minimal Reading Pill: Floats softly during scroll/flip/jump.
          In immersive mode on mobile, placed cleanly at top-corner (top-4 end-4) so it NEVER
          overlaps bottom menus, jump sheets, or page counters. */}
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className={`fixed z-30 pointer-events-none transition-all duration-200 ease-out ${
          compact
            ? isImmersive
              ? 'top-4 end-4'
              : 'bottom-24 start-4'
            : 'bottom-6 start-6'
        } ${
          (showScrubberPill || Boolean(numberJumpDisplay)) && (isImmersive || !compact)
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-2 scale-90'
        }`}
      >
        <div className="chrome-surface flex items-center gap-2 rounded-full px-3.5 py-1.5 font-mono text-[11px] text-ink shadow-xl backdrop-blur-xl border border-line-subtle select-none">
          {numberJumpDisplay ? (
            <span className="flex items-center gap-1.5 text-accent font-semibold font-mono">
              <span>{lang === 'ar' ? 'انتقال إلى صفحة' : 'Jump to:'}</span>
              <span className="text-ink text-xs underline decoration-accent font-bold">{numberJumpDisplay}</span>
              <span className="text-[10px] text-ink-muted">(Enter ↵)</span>
            </span>
          ) : (
            <>
              <span className="font-sans font-medium text-ink">
                {lang === 'ar' ? `صفحة ${currentPage} من ${numPages}` : `Page ${currentPage} of ${numPages}`}
              </span>
              <span className="text-ink-faint text-[9px]">•</span>
              <span className="text-accent font-semibold text-[10px]">
                {Math.min(100, Math.round((currentPage / Math.max(1, numPages)) * 100))}%
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
