import type React from 'react';
import { useCallback, useEffect } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ViewMode } from '../core/types';
import { saveLastPage, saveScrollOffset } from '../core/settings/preferences';
import { updateDocumentPage } from '../core/storage/documents';
import { triggerHaptic } from '../core/utils/haptics';

interface UseReaderNavigationOptions {
  doc: PDFDocumentProxy | null;
  docId: string;
  numPages: number;
  currentPage: number;
  viewMode: ViewMode;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  pendingScrollPageRef: React.MutableRefObject<number | null>;
  pendingScrollOffsetRef: React.MutableRefObject<number | null>;
  pageSaveTimerRef: React.MutableRefObject<number | null>;
  lastSavedPageRef: React.MutableRefObject<{ title: string; page: number } | null>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  setDualFlipDir: React.Dispatch<React.SetStateAction<'forward' | 'backward'>>;
  setDualFlipKey: React.Dispatch<React.SetStateAction<number>>;
  setArrivalGlowKey: React.Dispatch<React.SetStateAction<number>>;
  resetWheelTurnAccum: () => void;
}

/**
 * Coordinates continuous/single/dual page navigation, viewport scroll sync,
 * debounced reading progress persistence, and boundary bounce haptics.
 */
export function useReaderNavigation({
  doc,
  docId,
  numPages,
  currentPage,
  viewMode,
  scrollContainerRef,
  pendingScrollPageRef,
  pendingScrollOffsetRef,
  pageSaveTimerRef,
  lastSavedPageRef,
  setCurrentPage,
  setDualFlipDir,
  setDualFlipKey,
  setArrivalGlowKey,
  resetWheelTurnAccum,
}: UseReaderNavigationOptions) {
  const scrollToRenderedPage = useCallback(
    (pageNumber: number, offsetRatio?: number) => {
      const target = document.getElementById(`pdf-page-${pageNumber}`);
      if (!target) return;
      const container = scrollContainerRef.current;
      if (!container) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const targetTop = target.offsetTop;
      if (typeof offsetRatio === 'number' && offsetRatio > 0) {
        const targetHeight = target.offsetHeight;
        container.scrollTo({
          top: targetTop + Math.round(targetHeight * Math.min(1, Math.max(0, offsetRatio))),
          behavior: 'smooth',
        });
      } else {
        container.scrollTo({ top: targetTop, behavior: 'smooth' });
      }
    },
    [scrollContainerRef]
  );

  const persistVisiblePage = useCallback(
    (documentId: string, pageNumber: number, offsetRatio?: number) => {
      saveLastPage(documentId, pageNumber);
      if (typeof offsetRatio === 'number') {
        saveScrollOffset(documentId, offsetRatio);
      }
      if (
        lastSavedPageRef.current?.title === documentId &&
        lastSavedPageRef.current.page === pageNumber
      ) {
        return;
      }
      lastSavedPageRef.current = { title: documentId, page: pageNumber };
      if (pageSaveTimerRef.current !== null) {
        window.clearTimeout(pageSaveTimerRef.current);
      }
      pageSaveTimerRef.current = window.setTimeout(() => {
        pageSaveTimerRef.current = null;
        void updateDocumentPage(documentId, pageNumber, offsetRatio);
      }, 600);
    },
    [lastSavedPageRef, pageSaveTimerRef]
  );

  const cancelPendingPageSave = useCallback(() => {
    if (pageSaveTimerRef.current !== null) {
      window.clearTimeout(pageSaveTimerRef.current);
      pageSaveTimerRef.current = null;
    }
  }, [pageSaveTimerRef]);

  const scrollToPage = useCallback(
    (pageNumber: number) => {
      const nextPage = Math.min(Math.max(1, pageNumber), Math.max(1, numPages));
      if (nextPage !== currentPage) {
        triggerHaptic('selection');
        setDualFlipDir(nextPage > currentPage ? 'forward' : 'backward');
        setDualFlipKey((key) => key + 1);
        setArrivalGlowKey((k) => k + 1);
      }
      setCurrentPage(nextPage);

      if (docId) {
        persistVisiblePage(docId, nextPage);
      }

      if (viewMode === 'continuous') {
        pendingScrollPageRef.current = nextPage;
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            if (pendingScrollPageRef.current === nextPage) {
              pendingScrollPageRef.current = null;
              scrollToRenderedPage(nextPage);
            }
          });
        });
      }
    },
    [
      currentPage,
      docId,
      numPages,
      pendingScrollPageRef,
      persistVisiblePage,
      scrollToRenderedPage,
      setArrivalGlowKey,
      setCurrentPage,
      setDualFlipDir,
      setDualFlipKey,
      viewMode,
    ]
  );

  useEffect(() => {
    if (!doc || currentPage < 1 || viewMode !== 'continuous' || pendingScrollPageRef.current === null) return;
    const pageNumber = pendingScrollPageRef.current;
    const offsetRatio = pendingScrollOffsetRef.current ?? undefined;
    pendingScrollPageRef.current = null;
    pendingScrollOffsetRef.current = null;
    scrollToRenderedPage(pageNumber, offsetRatio);
  }, [currentPage, doc, viewMode, scrollToRenderedPage, pendingScrollPageRef, pendingScrollOffsetRef]);

  useEffect(() => {
    if (viewMode === 'continuous' || currentPage < 1) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const resetViewport = () => {
      container.scrollTop = 0;
      container.scrollLeft = 0;
    };
    resetViewport();
    const first = window.requestAnimationFrame(() => {
      resetViewport();
      window.requestAnimationFrame(resetViewport);
    });
    resetWheelTurnAccum();
    return () => window.cancelAnimationFrame(first);
  }, [currentPage, viewMode, resetWheelTurnAccum, scrollContainerRef]);

  const handlePageVisible = useCallback(
    (pageNumber: number) => {
      setCurrentPage((current) => (current === pageNumber ? current : pageNumber));
      if (docId) {
        let offsetRatio: number | undefined;
        const container = scrollContainerRef.current;
        const slot = document.getElementById(`pdf-page-${pageNumber}`);
        if (container && slot) {
          const slotTop = slot.offsetTop;
          const slotHeight = slot.offsetHeight;
          if (slotHeight > 0) {
            offsetRatio = Math.max(0, Math.min(1, (container.scrollTop - slotTop) / slotHeight));
          }
        }
        persistVisiblePage(docId, pageNumber, offsetRatio);
      }
    },
    [docId, persistVisiblePage, scrollContainerRef, setCurrentPage]
  );

  const triggerBoundaryBounce = useCallback(
    (position: 'start' | 'end') => {
      const el = scrollContainerRef.current;
      if (!el) return;
      triggerHaptic('boundary');
      const cls = position === 'start' ? 'animate-bounce-start' : 'animate-bounce-end';
      el.classList.remove('animate-bounce-start', 'animate-bounce-end');
      void el.offsetWidth;
      el.classList.add(cls);
      window.setTimeout(() => {
        el.classList.remove(cls);
      }, 350);
    },
    [scrollContainerRef]
  );

  const goToNextPage = useCallback(() => {
    if (viewMode === 'dual') {
      if (currentPage + 2 <= numPages) {
        scrollToPage(currentPage + 2);
      } else if (currentPage + 1 <= numPages) {
        scrollToPage(currentPage + 1);
      } else {
        triggerBoundaryBounce('end');
      }
    } else if (currentPage < numPages) {
      scrollToPage(currentPage + 1);
    } else {
      triggerBoundaryBounce('end');
    }
  }, [currentPage, numPages, scrollToPage, triggerBoundaryBounce, viewMode]);

  const goToPrevPage = useCallback(() => {
    if (viewMode === 'dual') {
      if (currentPage > 1) {
        scrollToPage(Math.max(1, currentPage - 2));
      } else {
        triggerBoundaryBounce('start');
      }
    } else if (currentPage > 1) {
      scrollToPage(currentPage - 1);
    } else {
      triggerBoundaryBounce('start');
    }
  }, [currentPage, scrollToPage, triggerBoundaryBounce, viewMode]);

  return {
    scrollToRenderedPage,
    scrollToPage,
    handlePageVisible,
    goToNextPage,
    goToPrevPage,
    cancelPendingPageSave,
  };
}
