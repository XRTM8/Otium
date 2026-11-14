import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TouchEvent as ReactTouchEvent } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ViewMode } from '../core/types';
import { computeOptimalPageScale } from '../core/reader/device';
import { pinchScale } from '../core/reader/pinch';
import { saveLastPage } from '../core/settings/preferences';
import { updateDocumentPage } from '../core/storage/documents';
import { stopTts } from '../platform/tts';
import {
  isInteractiveTarget,
  type ZoomAnchor,
} from './readerControllerHelpers';
import { useReaderWheelNavigation, type ScrollMetrics } from './useReaderWheelNavigation';

interface UseReaderViewportAndZoomOptions {
  doc: PDFDocumentProxy | null;
  viewMode: ViewMode;
  basePageSize: { width: number; height: number };
  chromeInset: number;
  keyboardCapable: boolean;
  currentPageRef: React.MutableRefObject<number>;
  docIdRef: React.MutableRefObject<string>;
  pageSaveTimerRef: React.MutableRefObject<number | null>;
  actionsRef: React.MutableRefObject<{
    goToNextPage: () => void;
    goToPrevPage: () => void;
  }>;
}

/**
 * Owns reader zoom state, spatial pinch/ctrl-wheel anchoring, trackpad paged
 * wheel turns, resize/orientation rescaling, and lifecycle flush on page hide.
 */
export function useReaderViewportAndZoom({
  doc,
  viewMode,
  basePageSize,
  chromeInset,
  keyboardCapable,
  currentPageRef,
  docIdRef,
  pageSaveTimerRef,
  actionsRef,
}: UseReaderViewportAndZoomOptions) {
  const [zoom, setZoom] = useState(1.15);
  const [fitScaleState, setFitScaleState] = useState(0);
  const lastFitScaleRef = useRef(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pinchFrameRef = useRef<number | null>(null);
  const pendingPinchZoom = useRef<number | null>(null);
  const pinchRef = useRef<{ first: number; second: number; distance: number; zoom: number } | null>(null);
  const touchPanRef = useRef<{ x: number; y: number; time: number; vx: number; vy: number; moved: boolean } | null>(null);
  const panFrameRef = useRef<number | null>(null);
  const pinchReleaseFrameRef = useRef<number | null>(null);
  const touchZoomActiveRef = useRef(false);
  const zoomAnchorRef = useRef<ZoomAnchor | null>(null);
  const zoomFocusRef = useRef<{ x: number; y: number } | null>(null);

  const cachedScrollMetricsRef = useRef<ScrollMetrics>({
    maxScrollX: 0,
    maxScrollY: 0,
    isOverflowingX: false,
    isOverflowingY: false,
  });

  useEffect(() => {
    return () => {
      if (pinchFrameRef.current !== null) cancelAnimationFrame(pinchFrameRef.current);
      if (panFrameRef.current !== null) cancelAnimationFrame(panFrameRef.current);
      if (pinchReleaseFrameRef.current !== null) cancelAnimationFrame(pinchReleaseFrameRef.current);
    };
  }, []);

  const getFitScale = useCallback(() => {
    if (!basePageSize.width || !basePageSize.height || typeof window === 'undefined') {
      return 1.15;
    }
    return computeOptimalPageScale(
      basePageSize.width,
      basePageSize.height,
      scrollContainerRef.current?.clientWidth || window.innerWidth,
      (scrollContainerRef.current?.clientHeight || window.innerHeight) - chromeInset,
      viewMode
    );
  }, [basePageSize, chromeInset, viewMode]);

  const refitViewport = useCallback(() => {
    const fit = getFitScale();
    const previousFit = lastFitScaleRef.current || fit;
    lastFitScaleRef.current = fit;
    setFitScaleState(fit);
    const minZoom = Math.max(0.04, Math.min(0.5, Number((fit * 0.5).toFixed(2))));
    const maxZoom = Math.max(3.5, Number((fit * 4).toFixed(2)));
    setZoom(current => Math.abs(current / previousFit - 1) <= 0.08
      ? fit : Math.min(maxZoom, Math.max(minZoom, current)));
  }, [getFitScale]);

  const getMinZoom = useCallback(() => {
    const fit = lastFitScaleRef.current || getFitScale();
    return Math.max(0.04, Math.min(0.5, Number((fit * 0.5).toFixed(2))));
  }, [getFitScale]);

  const getMaxZoom = useCallback(() => {
    const fit = lastFitScaleRef.current || getFitScale();
    return Math.max(3.5, Number((fit * 4.0).toFixed(2)));
  }, [getFitScale]);

  const captureZoomAnchor = useCallback((clientX: number, clientY: number) => {
    const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const page = target?.closest<HTMLElement>('[data-pdf-page]');
    if (!page) {
      zoomAnchorRef.current = null;
      zoomFocusRef.current = null;
      return;
    }
    const rect = page.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      zoomAnchorRef.current = null;
      zoomFocusRef.current = null;
      return;
    }
    zoomAnchorRef.current = {
      element: page,
      fractionX: (clientX - rect.left) / rect.width,
      fractionY: (clientY - rect.top) / rect.height,
    };
    zoomFocusRef.current = { x: clientX, y: clientY };
  }, []);

  const clearZoomAnchor = useCallback(() => {
    zoomAnchorRef.current = null;
    zoomFocusRef.current = null;
  }, []);

  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    const focus = zoomFocusRef.current;
    const container = scrollContainerRef.current;
    if (zoom <= 0 || !anchor || !focus || !container || !anchor.element.isConnected) return;

    const rect = anchor.element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const targetX = rect.left + anchor.fractionX * rect.width;
    const targetY = rect.top + anchor.fractionY * rect.height;
    const deltaX = targetX - focus.x;
    const deltaY = targetY - focus.y;

    if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
      container.scrollTo({
        left: container.scrollLeft + deltaX,
        top: container.scrollTop + deltaY,
        behavior: 'instant',
      });
    }
  }, [zoom]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopTts();
        const activeDocId = docIdRef.current;
        const activePage = currentPageRef.current;
        if (pageSaveTimerRef.current !== null && activeDocId) {
          window.clearTimeout(pageSaveTimerRef.current);
          pageSaveTimerRef.current = null;
        }
        if (activeDocId) {
          saveLastPage(activeDocId, activePage);
          void updateDocumentPage(activeDocId, activePage);
        }
      }
    };

    const handlePageHide = () => {
      stopTts();
      const activeDocId = docIdRef.current;
      const activePage = currentPageRef.current;
      if (activeDocId) {
        saveLastPage(activeDocId, activePage);
        void updateDocumentPage(activeDocId, activePage);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [currentPageRef, docIdRef, pageSaveTimerRef]);

  const { resetWheelTurnAccum } = useReaderWheelNavigation({
    doc,
    viewMode,
    scrollContainerRef,
    cachedScrollMetricsRef,
    lastFitScaleRef,
    getMinZoom,
    getMaxZoom,
    setZoom,
    captureZoomAnchor,
    clearZoomAnchor,
    actionsRef,
  });

  const movePinch = (first: React.Touch, second: React.Touch) => {
    touchZoomActiveRef.current = true;
    touchPanRef.current = null;
    const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
    const x = (first.clientX + second.clientX) / 2;
    const y = (first.clientY + second.clientY) / 2;
    const pinch = pinchRef.current;
    const samePair = pinch && (
      (pinch.first === first.identifier && pinch.second === second.identifier) ||
      (pinch.first === second.identifier && pinch.second === first.identifier)
    );
    if (!samePair) {
      pinchRef.current = null;
      if (distance < 10) return;
      pinchRef.current = { first: first.identifier, second: second.identifier, distance, zoom: pendingPinchZoom.current ?? zoom };
      captureZoomAnchor(x, y);
      return;
    }
    if (distance === 0) return;
    zoomFocusRef.current = { x, y };
    pendingPinchZoom.current = pinchScale(pinch.zoom, pinch.distance, distance, getMinZoom(), getMaxZoom());
    if (pinchFrameRef.current === null) {
      pinchFrameRef.current = requestAnimationFrame(() => {
        pinchFrameRef.current = null;
        if (pendingPinchZoom.current !== null) setZoom(pendingPinchZoom.current);
      });
    }
  };

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (panFrameRef.current !== null) {
      cancelAnimationFrame(panFrameRef.current);
      panFrameRef.current = null;
    }
    if (pinchReleaseFrameRef.current !== null) {
      cancelAnimationFrame(pinchReleaseFrameRef.current);
      pinchReleaseFrameRef.current = null;
      touchZoomActiveRef.current = false;
      clearZoomAnchor();
    }
    const first = event.touches[0];
    const second = event.touches[1];
    if (first && second) {
      movePinch(first, second);
    } else if (first && !touchZoomActiveRef.current && !isInteractiveTarget(event.target)) {
      touchPanRef.current = { x: first.clientX, y: first.clientY, time: event.timeStamp, vx: 0, vy: 0, moved: false };
    }
  };

  const handleTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const first = event.touches[0];
    const second = event.touches[1];
    if (first && second) {
      movePinch(first, second);
      return;
    }
    const pan = touchPanRef.current;
    if (!first || !pan) return;
    const dx = pan.x - first.clientX;
    const dy = pan.y - first.clientY;
    if (!pan.moved && Math.hypot(dx, dy) < 8) return;
    const elapsed = Math.max(8, event.timeStamp - pan.time);
    touchPanRef.current = {
      x: first.clientX, y: first.clientY, time: event.timeStamp,
      vx: Math.min(3, Math.max(-3, dx / elapsed)),
      vy: Math.min(3, Math.max(-3, dy / elapsed)),
      moved: true,
    };
    event.currentTarget.scrollBy({ left: dx, top: dy, behavior: 'instant' });
  };

  const finishPinch = (commit: boolean) => {
    if (pinchFrameRef.current !== null) cancelAnimationFrame(pinchFrameRef.current);
    pinchFrameRef.current = null;
    if (commit && pendingPinchZoom.current !== null) setZoom(pendingPinchZoom.current);
    pendingPinchZoom.current = null;
    pinchRef.current = null;
    // Let the final zoom layout and its scroll event finish before tracking pages again.
    pinchReleaseFrameRef.current = requestAnimationFrame(() => {
      pinchReleaseFrameRef.current = requestAnimationFrame(() => {
        pinchReleaseFrameRef.current = null;
        touchZoomActiveRef.current = false;
        clearZoomAnchor();
      });
    });
  };

  const handleTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length > 0) return;
    if (touchZoomActiveRef.current) {
      finishPinch(true);
      return;
    }
    const pan = touchPanRef.current;
    touchPanRef.current = null;
    if (!pan?.moved || event.timeStamp - pan.time > 80) return;
    const container = event.currentTarget;
    let previousTime = performance.now();
    let { vx, vy } = pan;
    const coast = (time: number) => {
      if (!container.isConnected || container.dataset.readerMode !== 'hand') {
        panFrameRef.current = null;
        return;
      }
      const elapsed = Math.min(32, Math.max(0, time - previousTime));
      previousTime = time;
      const left = container.scrollLeft;
      const top = container.scrollTop;
      container.scrollBy({ left: vx * elapsed, top: vy * elapsed, behavior: 'instant' });
      const decay = Math.exp(-elapsed / 95);
      vx = container.scrollLeft === left ? 0 : vx * decay;
      vy = container.scrollTop === top ? 0 : vy * decay;
      panFrameRef.current = Math.hypot(vx, vy) > 0.07 ? requestAnimationFrame(coast) : null;
    };
    panFrameRef.current = requestAnimationFrame(coast);
  };

  const handleTouchCancel = (event: ReactTouchEvent<HTMLDivElement>) => {
    touchPanRef.current = null;
    if (touchZoomActiveRef.current && event.touches.length === 0) finishPinch(false);
  };

  const renderFitScale =
    fitScaleState ||
    (!basePageSize.width || !basePageSize.height
      ? 1.15
      : computeOptimalPageScale(
          basePageSize.width,
          basePageSize.height,
          keyboardCapable ? 1280 : 390,
          (keyboardCapable ? 800 : 844) - chromeInset,
          viewMode
        ));

  return {
    zoom,
    setZoom,
    fitScaleState,
    setFitScaleState,
    lastFitScaleRef,
    scrollContainerRef,
    getFitScale,
    refitViewport,
    getMinZoom,
    getMaxZoom,
    renderFitScale,
    minZoom: Math.max(0.04, Math.min(0.5, Number((renderFitScale * 0.5).toFixed(2)))),
    maxZoom: Math.max(3.5, Number((renderFitScale * 4.0).toFixed(2))),
    captureZoomAnchor,
    clearZoomAnchor,
    touchZoomActiveRef,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    resetWheelTurnAccum,
  };
}
