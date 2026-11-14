import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ViewMode } from '../core/types';
import { WHEEL_TURN_COOLDOWN_MS, WHEEL_TURN_THRESHOLD } from './readerControllerHelpers';

export interface ScrollMetrics {
  maxScrollX: number;
  maxScrollY: number;
  isOverflowingX: boolean;
  isOverflowingY: boolean;
}

interface UseReaderWheelNavigationOptions {
  doc: PDFDocumentProxy | null;
  viewMode: ViewMode;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  cachedScrollMetricsRef: React.MutableRefObject<ScrollMetrics>;
  lastFitScaleRef: React.MutableRefObject<number>;
  getMinZoom: () => number;
  getMaxZoom: () => number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  captureZoomAnchor: (clientX: number, clientY: number) => void;
  clearZoomAnchor: () => void;
  actionsRef: React.MutableRefObject<{
    goToNextPage: () => void;
    goToPrevPage: () => void;
  }>;
}

export function useReaderWheelNavigation({
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
}: UseReaderWheelNavigationOptions) {
  const lastWheelTimeRef = useRef(0);
  const wheelAccumRef = useRef(0);
  const wheelDirectionRef = useRef(0);
  const wheelIdleTimerRef = useRef<number | null>(null);
  const ctrlWheelIdleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (wheelIdleTimerRef.current !== null) window.clearTimeout(wheelIdleTimerRef.current);
      if (ctrlWheelIdleTimerRef.current !== null) window.clearTimeout(ctrlWheelIdleTimerRef.current);
    };
  }, []);

  const canScrollVertically = useCallback(
    (direction: number) => {
      const container = scrollContainerRef.current;
      if (!container) return false;
      const metrics = cachedScrollMetricsRef.current;
      if (viewMode !== 'continuous' && !metrics.isOverflowingY) return false;
      if (metrics.maxScrollY <= 2) return false;
      return direction > 0 ? container.scrollTop < metrics.maxScrollY - 1 : container.scrollTop > 1;
    },
    [cachedScrollMetricsRef, scrollContainerRef, viewMode]
  );

  const canScrollHorizontally = useCallback(
    (direction: number) => {
      const container = scrollContainerRef.current;
      if (!container) return false;
      const metrics = cachedScrollMetricsRef.current;
      if (viewMode !== 'continuous' && !metrics.isOverflowingX) return false;
      if (metrics.maxScrollX <= 2) return false;
      return direction > 0 ? container.scrollLeft < metrics.maxScrollX - 1 : container.scrollLeft > 1;
    },
    [cachedScrollMetricsRef, scrollContainerRef, viewMode]
  );

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !doc) return;

    const handleNativeWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
        captureZoomAnchor(event.clientX, event.clientY);
        const minZ = getMinZoom();
        const maxZ = getMaxZoom();
        const step = Math.max(0.02, Math.min(0.15, Number(((lastFitScaleRef.current || 1.0) * 0.12).toFixed(2))));
        const delta = event.deltaY > 0 ? -step : step;
        setZoom((current) => Math.min(maxZ, Math.max(minZ, Number((current + delta).toFixed(2)))));
        if (ctrlWheelIdleTimerRef.current !== null) window.clearTimeout(ctrlWheelIdleTimerRef.current);
        ctrlWheelIdleTimerRef.current = window.setTimeout(() => {
          ctrlWheelIdleTimerRef.current = null;
          clearZoomAnchor();
        }, 180);
        return;
      }

      if (viewMode === 'continuous') return;
      if (container.scrollWidth > container.clientWidth + 2 || container.scrollHeight > container.clientHeight + 2) return;

      const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1;
      const absX = Math.abs(event.deltaX);
      const absY = Math.abs(event.deltaY);
      if (absX > 0 && absY > 0 && Math.max(absX, absY) / Math.min(absX, absY) < 1.35) return;

      const horizontal = absX > absY;
      const delta = (horizontal ? event.deltaX : event.deltaY) * multiplier;
      if (Math.abs(delta) < 1) return;

      const direction = delta > 0 ? 1 : -1;
      const canScroll = horizontal ? canScrollHorizontally(direction) : canScrollVertically(direction);
      if (canScroll) {
        wheelAccumRef.current = 0;
        wheelDirectionRef.current = 0;
        return;
      }

      event.preventDefault();
      const now = performance.now();
      if (now - lastWheelTimeRef.current < WHEEL_TURN_COOLDOWN_MS) return;

      if (wheelDirectionRef.current !== direction) {
        wheelDirectionRef.current = direction;
        wheelAccumRef.current = 0;
      }
      wheelAccumRef.current += Math.abs(delta);

      if (wheelIdleTimerRef.current !== null) window.clearTimeout(wheelIdleTimerRef.current);
      wheelIdleTimerRef.current = window.setTimeout(() => {
        wheelIdleTimerRef.current = null;
        wheelAccumRef.current = 0;
        wheelDirectionRef.current = 0;
      }, 180);

      if (wheelAccumRef.current < WHEEL_TURN_THRESHOLD) return;
      wheelAccumRef.current = 0;
      wheelDirectionRef.current = 0;
      lastWheelTimeRef.current = now;

      if (direction > 0) actionsRef.current.goToNextPage();
      else actionsRef.current.goToPrevPage();
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleNativeWheel);
      if (ctrlWheelIdleTimerRef.current !== null) {
        window.clearTimeout(ctrlWheelIdleTimerRef.current);
        ctrlWheelIdleTimerRef.current = null;
      }
      if (wheelIdleTimerRef.current !== null) {
        window.clearTimeout(wheelIdleTimerRef.current);
        wheelIdleTimerRef.current = null;
      }
    };
  }, [
    actionsRef,
    canScrollHorizontally,
    canScrollVertically,
    captureZoomAnchor,
    clearZoomAnchor,
    doc,
    getMaxZoom,
    getMinZoom,
    lastFitScaleRef,
    scrollContainerRef,
    setZoom,
    viewMode,
  ]);

  const resetWheelTurnAccum = useCallback(() => {
    wheelAccumRef.current = 0;
    wheelDirectionRef.current = 0;
  }, []);

  return { resetWheelTurnAccum };
}
