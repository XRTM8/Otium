import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { TextAnnotation, ThemeMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import type { ReaderController } from '../app/useReaderController';
import { markScrollActivity } from '../core/reader/renderScheduler';
import { PdfPage } from './PdfPage';
import { ErrorBoundary } from './ErrorBoundary';
import { AnimatedCounter } from './AnimatedCounter';
import { triggerHaptic } from '../core/utils/haptics';

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
    setIsImmersive,
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
    numberJumpDisplay,
    readingWarmth,
    ultraDim,
    scrollToPage
  } = reader;

  const [compactLandscape, setCompactLandscape] = useState(false);
  const [showScrubberPill, setShowScrubberPill] = useState(false);
  const scrubberTimeoutRef = useRef<number | null>(null);
  const isRtl = lang === 'ar';
  const docIsRtl = reader.docIsRtl;
  const lastScrollPageRef = useRef<number>(currentPage);
  const scrollFrameRef = useRef<number | null>(null);

  // Interactive precision scrubber state
  const [scrubState, setScrubState] = useState<{ page: number; x: number } | null>(null);
  const isScrubbingRef = useRef(false);

  const calculateScrubPage = (clientX: number) => {
    if (typeof window === 'undefined') return { page: 1, x: clientX };
    const width = window.innerWidth;
    const clampedX = Math.max(0, Math.min(width, clientX));
    const ratio = clampedX / width;
    const page = Math.min(numPages, Math.max(1, Math.round(ratio * numPages)));
    return { page, x: clampedX };
  };

  const handleScrubberPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isScrubbingRef.current = true;
    const { page, x } = calculateScrubPage(e.clientX);
    setScrubState({ page, x });
    triggerHaptic('selection');
  };

  const handleScrubberPointerMove = (e: React.PointerEvent) => {
    if (!isScrubbingRef.current) return;
    const { page, x } = calculateScrubPage(e.clientX);
    setScrubState((prev) => {
      if (prev && prev.page !== page) {
        triggerHaptic('selection');
      }
      return { page, x };
    });
  };

  const handleScrubberPointerUp = () => {
    if (isScrubbingRef.current && scrubState) {
      scrollToPage(scrubState.page);
      triggerHaptic('light');
    }
    isScrubbingRef.current = false;
    setScrubState(null);
  };

  const handleScrubberPointerLeave = () => {
    if (!isScrubbingRef.current) {
      setScrubState(null);
    }
  };

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
    if (isImmersive) return;
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
          docIsRtl
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
          docIsRtl
            ? dualFlipDir === 'forward'
              ? 'Backward'
              : 'Forward'
            : dualFlipDir === 'forward'
              ? 'Forward'
              : 'Backward'
        } 260ms cubic-bezier(0.16, 1, 0.3, 1) both`
      : undefined;

  // Odd pages sit on the right in Arabic / RTL books and on the left in Latin / LTR books.
  // Using docIsRtl guarantees English books in Arabic UI are never mirrored or reversed.
  const reverseSpread = docIsRtl && currentPage % 2 === 1;

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
    <div className="relative flex-1 w-full h-full overflow-hidden flex flex-col">
      {/* Interactive reading progress & precision scrubber */}
      <div
        aria-hidden={isImmersive}
        role="progressbar"
        aria-label={lang === 'ar' ? 'تقدّم القراءة' : 'Reading progress'}
        aria-valuemin={1}
        aria-valuemax={Math.max(1, numPages)}
        aria-valuenow={currentPage}
        onPointerDown={handleScrubberPointerDown}
        onPointerMove={handleScrubberPointerMove}
        onPointerUp={handleScrubberPointerUp}
        onPointerLeave={handleScrubberPointerLeave}
        className={`fixed top-0 inset-x-0 h-4 group cursor-pointer z-40 transition-opacity duration-300 flex items-start select-none ${
          isImmersive ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <div className="w-full h-[2.5px] group-hover:h-[4.5px] bg-line/40 transition-all duration-150 relative">
          <div
            className="h-full bg-accent relative transition-all duration-300 ease-out will-change-[width]"
            style={{
              width: `${(currentPage / Math.max(1, numPages)) * 100}%`,
              transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)'
            }}
          >
            {/* Subtle luminous leading glow */}
            <div
              aria-hidden="true"
              className="absolute -top-[1px] end-0 w-3 h-1 bg-accent rounded-full shadow-[0_0_8px_var(--accent)] opacity-85"
            />
          </div>
        </div>

        {/* Floating Bubble Tooltip while scrubbing */}
        {scrubState && (
          <div
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
            style={{
              left: `${scrubState.x}px`,
              transform: 'translateX(-50%)',
              top: '12px'
            }}
            className="fixed pointer-events-none z-50 chrome-surface px-3 py-1 rounded-full shadow-2xl border border-line text-[11px] font-mono text-ink flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-100 backdrop-blur-md"
          >
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="font-semibold text-accent font-sans">
              {lang === 'ar' ? `صفحة ${scrubState.page}` : `Page ${scrubState.page}`}
            </span>
            <span className="text-ink-muted">/</span>
            <span className="text-ink-muted">{numPages}</span>
            <span className="text-[10px] text-accent font-mono font-semibold">
              ({Math.round((scrubState.page / Math.max(1, numPages)) * 100)}%)
            </span>
          </div>
        )}
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
            className={`paged-arrow spring-press fixed top-1/2 -translate-y-1/2 z-30 p-2 sm:p-2.5 rounded-full text-ink disabled:opacity-0 transition-opacity duration-300 ${
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
            className={`paged-arrow spring-press fixed top-1/2 -translate-y-1/2 z-30 p-2 sm:p-2.5 rounded-full text-ink disabled:opacity-0 transition-opacity duration-300 ${
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

      {/* Main scrollable document viewport */}
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
      </div>

      {/* Zen Minimal Reading Pill: Pinned cleanly outside the transformed scroll container so it never scrolls off.
          In immersive mode ("وضع بدون قوائم"), it stays pinned at the top-corner across ALL pages (1 to N)
          and acts as an interactive button to restore menus when tapped. */}
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        style={
          isImmersive && compact
            ? { top: 'max(0.75rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))' }
            : undefined
        }
        className={`fixed z-40 transition-all duration-200 ease-out ${
          compact
            ? isImmersive
              ? 'top-4 end-3 sm:end-4'
              : 'bottom-24 start-4'
            : isImmersive
              ? 'top-4 end-4 sm:end-6'
              : 'bottom-6 start-6'
        } ${
          isImmersive || showScrubberPill || Boolean(numberJumpDisplay)
            ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
            : 'opacity-0 translate-y-2 scale-90 pointer-events-none'
        }`}
      >
        <button
          type="button"
          onClick={() => {
            if (isImmersive) {
              setIsImmersive(false);
            }
          }}
          disabled={!isImmersive && !numberJumpDisplay}
          title={
            isImmersive
              ? (lang === 'ar' ? 'انقر لإظهار القوائم وأدوات المستند' : 'Click to show menus and document tools')
              : (lang === 'ar' ? `صفحة ${currentPage} من ${numPages}` : `Page ${currentPage} of ${numPages}`)
          }
          aria-label={
            isImmersive
              ? (lang === 'ar' ? `صفحة ${currentPage} من ${numPages} - انقر لإظهار القوائم` : `Page ${currentPage} of ${numPages} - Click to show menus`)
              : (lang === 'ar' ? `صفحة ${currentPage} من ${numPages}` : `Page ${currentPage} of ${numPages}`)
          }
          key={`page-pill-${reader.arrivalGlowKey || 0}`}
          className={`chrome-surface spring-press flex items-center gap-2 rounded-full px-3.5 py-1.5 font-mono text-[11px] text-ink shadow-xl backdrop-blur-xl border border-line-subtle select-none ${
            isImmersive
              ? 'cursor-pointer hover:bg-hover active:scale-95'
              : ''
          } ${reader.arrivalGlowKey ? 'soft-arrival-glow' : ''}`}
        >
          {numberJumpDisplay ? (
            <span className="flex items-center gap-1.5 text-accent font-semibold font-mono">
              <span>{lang === 'ar' ? 'انتقال إلى صفحة' : 'Jump to:'}</span>
              <span className="text-ink text-xs underline decoration-accent font-bold">{numberJumpDisplay}</span>
              <span className="text-[10px] text-ink-muted">(Enter ↵)</span>
            </span>
          ) : (
            <>
              <span className="font-sans font-medium text-ink inline-flex items-center gap-1">
                <span>{lang === 'ar' ? 'صفحة' : 'Page'}</span>
                <AnimatedCounter value={currentPage} />
                <span>{lang === 'ar' ? `من ${numPages}` : `of ${numPages}`}</span>
              </span>
              <span className="text-ink-faint text-[9px]">•</span>
              <span className="text-accent font-semibold text-[10px] inline-flex items-center font-mono">
                <AnimatedCounter value={Math.min(100, Math.round((currentPage / Math.max(1, numPages)) * 100))} />
                <span>%</span>
              </span>
            </>
          )}
        </button>
      </div>

      {/* Visual Comfort Overlays: Reading Warmth and Ultra-Dim */}
      {readingWarmth > 0 && (
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none z-30 transition-opacity duration-300"
          style={{
            backgroundColor: `rgba(245, 158, 11, ${(readingWarmth / 100) * 0.22})`,
            mixBlendMode: 'multiply'
          }}
        />
      )}
      {ultraDim > 0 && (
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none z-30 transition-opacity duration-300"
          style={{
            backgroundColor: `rgba(0, 0, 0, ${(ultraDim / 100) * 0.75})`
          }}
        />
      )}
    </div>
  );
};
