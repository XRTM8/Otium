import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ViewMode } from '../core/types';
import { markScrollActivity } from '../core/reader/renderScheduler';
import { READER_READING_LINE } from '../core/reader/readingPosition';
import { triggerHaptic } from '../core/utils/haptics';

interface UseReaderWorkspaceSyncOptions {
  compact: boolean;
  doc: PDFDocumentProxy | null;
  numPages: number;
  currentPage: number;
  zoom: number;
  viewMode: ViewMode;
  basePageSize: { width: number; height: number } | null;
  isImmersive: boolean;
  handlePageVisible: (page: number) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  touchZoomActiveRef: React.RefObject<boolean>;
  viewportResizingRef: React.RefObject<boolean>;
  scrollToPage: (page: number) => void;
}

export function useReaderWorkspaceSync({
  compact,
  doc,
  numPages,
  currentPage,
  zoom,
  viewMode,
  basePageSize,
  isImmersive,
  handlePageVisible,
  scrollContainerRef,
  touchZoomActiveRef,
  viewportResizingRef,
  scrollToPage,
}: UseReaderWorkspaceSyncOptions) {
  const [compactLandscape, setCompactLandscape] = useState(false);
  const [showScrubberPill, setShowScrubberPill] = useState(false);
  const [settledPage, setSettledPage] = useState(currentPage);
  const scrubberTimeoutRef = useRef<number | null>(null);
  const lastScrollPageRef = useRef<number>(currentPage);
  const scrollFrameRef = useRef<number | null>(null);
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
    type LegacyMediaQueryList = MediaQueryList & {
      addListener?: (listener: () => void) => void;
      removeListener?: (listener: () => void) => void;
    };
    const query = window.matchMedia('(orientation: landscape) and (max-height: 540px)') as LegacyMediaQueryList;
    const update = () => setCompactLandscape(query.matches);
    update();
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', update);
      return () => query.removeEventListener('change', update);
    }
    if (typeof query.addListener === 'function') {
      query.addListener(update);
      return () => query.removeListener?.(update);
    }
  }, [compact]);

  useEffect(() => {
    if (viewMode !== 'continuous' || !doc) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    lastScrollPageRef.current = currentPage;

    const measure = () => {
      scrollFrameRef.current = null;
      if (numPages === 0 || touchZoomActiveRef.current || viewportResizingRef.current) return;

      const approxSlotHeight = Math.max(100, (basePageSize?.height || 842) * zoom + 32);
      const estimatedPage = Math.max(
        1,
        Math.min(numPages, Math.floor(container.scrollTop / approxSlotHeight) + 1)
      );

      const containerRect = container.getBoundingClientRect();
      const readingLine = containerRect.top + container.clientHeight * READER_READING_LINE;
      let bestPage = lastScrollPageRef.current;
      let bestDistance = Number.POSITIVE_INFINITY;

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
      if (touchZoomActiveRef.current || viewportResizingRef.current) return;
      setShowScrubberPill((prev) => (prev ? prev : true));
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
  }, [viewMode, doc, currentPage, numPages, basePageSize, zoom, handlePageVisible, scrollContainerRef, touchZoomActiveRef, viewportResizingRef]);

  useEffect(() => {
    if (isImmersive || settledPage === currentPage) return;
    const timer = window.setTimeout(() => {
      setSettledPage(currentPage);
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [currentPage, isImmersive, settledPage]);

  useEffect(() => {
    return () => {
      if (scrubberTimeoutRef.current !== null) {
        window.clearTimeout(scrubberTimeoutRef.current);
      }
    };
  }, []);

  return {
    compactLandscape,
    showScrubberPill,
    settledPage,
    scrubState,
    handleScrubberPointerDown,
    handleScrubberPointerMove,
    handleScrubberPointerUp,
    handleScrubberPointerLeave,
  };
}
