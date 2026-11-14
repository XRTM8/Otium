import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseEnhanceGesturesOptions {
  pageScopeKey: string;
  pageCount: number;
  safeIndex: number;
  isRedacting: boolean;
  onChangePage: (index: number) => void;
  onHaptic: (duration?: number) => void;
}

/**
 * Pinch, double tap, pan, and horizontal page turns in the scanner review.
 */
export function useEnhanceGestures({
  pageScopeKey,
  pageCount,
  safeIndex,
  isRedacting,
  onChangePage,
  onHaptic,
}: UseEnhanceGesturesOptions) {
  const [zoomPanState, setZoomPanState] = useState<{
    key: string;
    zoom: number;
    pan: { x: number; y: number };
  }>({ key: pageScopeKey, zoom: 1, pan: { x: 0, y: 0 } });
  const zoomScale = zoomPanState.key === pageScopeKey ? zoomPanState.zoom : 1;
  const panOffset = zoomPanState.key === pageScopeKey ? zoomPanState.pan : { x: 0, y: 0 };

  const setZoomScale = (next: number | ((prev: number) => number)) =>
    setZoomPanState((prev) => {
      const base = prev.key === pageScopeKey ? prev : { key: pageScopeKey, zoom: 1, pan: { x: 0, y: 0 } };
      const zoom = typeof next === 'function' ? next(base.zoom) : next;
      return { ...base, zoom };
    });

  const setPanOffset = (next: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) =>
    setZoomPanState((prev) => {
      const base = prev.key === pageScopeKey ? prev : { key: pageScopeKey, zoom: 1, pan: { x: 0, y: 0 } };
      const pan = typeof next === 'function' ? next(base.pan) : next;
      return { ...base, pan };
    });

  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const liveZoomRef = useRef<number>(1);
  const livePanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const liveSwipeXRef = useRef<number>(0);
  const liveSwipingRef = useRef<boolean>(false);
  const gestureRafRef = useRef<number | null>(null);

  const lastTapRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const multiTouchRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchDistanceStartRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(1);
  const pinchPair = useRef<[number, number] | null>(null);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);

  const prevScopeRef = useRef<string>(pageScopeKey);

  const applyStageTransform = useCallback((transitionCss = 'none') => {
    const el = stageContainerRef.current;
    if (!el) return;
    el.style.transition = transitionCss;
    el.style.transform = `translateX(${liveSwipeXRef.current}px) translate(${livePanRef.current.x}px, ${livePanRef.current.y}px) scale(${liveZoomRef.current})`;
  }, []);

  const scheduleStageTransform = () => {
    if (gestureRafRef.current !== null) return;
    gestureRafRef.current = requestAnimationFrame(() => {
      gestureRafRef.current = null;
      applyStageTransform('none');
    });
  };

  const resetZoomPanDom = useCallback(() => {
    if (gestureRafRef.current !== null) {
      cancelAnimationFrame(gestureRafRef.current);
      gestureRafRef.current = null;
    }
    liveZoomRef.current = 1;
    livePanRef.current = { x: 0, y: 0 };
    liveSwipeXRef.current = 0;
    liveSwipingRef.current = false;
    applyStageTransform('transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)');
  }, [applyStageTransform]);

  const resetZoomAndPan = () => {
    resetZoomPanDom();
    setZoomPanState({ key: pageScopeKey, zoom: 1, pan: { x: 0, y: 0 } });
  };

  useEffect(() => {
    if (prevScopeRef.current === pageScopeKey) return;
    prevScopeRef.current = pageScopeKey;
    resetZoomPanDom();
  }, [pageScopeKey, resetZoomPanDom]);

  useEffect(() => {
    return () => {
      if (gestureRafRef.current !== null) {
        cancelAnimationFrame(gestureRafRef.current);
        gestureRafRef.current = null;
      }
    };
  }, []);

  const handleStageTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isRedacting) return;

    if (e.touches.length > 1) {
      multiTouchRef.current = true;
      lastTapRef.current = null;
      touchStartRef.current = null;
      liveSwipeXRef.current = 0;
      liveSwipingRef.current = false;
      scheduleStageTransform();
    }
    if (e.touches.length === 2) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      if (!t0 || !t1) return;
      const dist = Math.hypot(
        t0.clientX - t1.clientX,
        t0.clientY - t1.clientY
      );
      touchDistanceStartRef.current = dist >= 8 ? dist : null;
      pinchPair.current = [t0.identifier, t1.identifier];
      initialZoomRef.current = liveZoomRef.current;
      return;
    }

    if (e.touches.length === 1 && !multiTouchRef.current &&
        !(e.target instanceof Element && e.target.closest('button'))) {
      const now = Date.now();
      const touch = e.touches[0];
      if (!touch) return;

      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: now };
      panStartRef.current = { ...livePanRef.current };
    }
  };

  const handleStageTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isRedacting) return;

    if (e.touches.length === 2 && multiTouchRef.current) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      if (!t0 || !t1) return;
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      const pair = pinchPair.current;
      if (!touchDistanceStartRef.current || !pair || !pair.includes(t0.identifier) || !pair.includes(t1.identifier)) {
        if (dist >= 8) {
          touchDistanceStartRef.current = dist;
          initialZoomRef.current = liveZoomRef.current;
          pinchPair.current = [t0.identifier, t1.identifier];
        }
        return;
      }
      const scaleFactor = dist / touchDistanceStartRef.current;
      const newScale = Math.min(4.0, Math.max(1.0, initialZoomRef.current * scaleFactor));
      liveZoomRef.current = newScale;
      if (newScale === 1.0) {
        livePanRef.current = { x: 0, y: 0 };
      }
      scheduleStageTransform();
      return;
    }

    if (!multiTouchRef.current && e.touches.length === 1 && touchStartRef.current) {
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;

      if (liveZoomRef.current > 1.05) {
        if (panStartRef.current) {
          const maxPanX = (liveZoomRef.current - 1) * 160;
          const maxPanY = (liveZoomRef.current - 1) * 220;
          const nextX = Math.min(maxPanX, Math.max(-maxPanX, panStartRef.current.x + dx));
          const nextY = Math.min(maxPanY, Math.max(-maxPanY, panStartRef.current.y + dy));
          livePanRef.current = { x: nextX, y: nextY };
          scheduleStageTransform();
        }
      } else if (pageCount > 1) {
        if (Math.abs(dx) > Math.abs(dy) * 1.35 && Math.abs(dx) > 10) {
          liveSwipingRef.current = true;
          const isAtBoundary = (safeIndex === 0 && dx > 0) || (safeIndex === pageCount - 1 && dx < 0);
          liveSwipeXRef.current = isAtBoundary ? dx * 0.3 : dx;
        } else {
          liveSwipingRef.current = false;
          liveSwipeXRef.current = 0;
        }
        scheduleStageTransform();
      }
    }
  };

  const finishTouch = () => {
    touchDistanceStartRef.current = null;
    pinchPair.current = null;
    if (gestureRafRef.current !== null) {
      cancelAnimationFrame(gestureRafRef.current);
      gestureRafRef.current = null;
    }
    liveSwipeXRef.current = 0;
    liveSwipingRef.current = false;
    touchStartRef.current = null;
    multiTouchRef.current = false;
    setZoomScale(liveZoomRef.current);
    setPanOffset({ ...livePanRef.current });
    applyStageTransform(liveZoomRef.current > 1.05 ? 'none' : 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)');
  };

  const handleStageTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (isRedacting || event.touches.length > 0) return;
    const start = touchStartRef.current;
    const end = event.changedTouches[0];
    if (!multiTouchRef.current && start && end) {
      const elapsed = Date.now() - start.time;
      const swipeDx = liveSwipeXRef.current;
      if (liveSwipingRef.current && Math.abs(swipeDx) > 24 &&
        (Math.abs(swipeDx) > 60 || Math.abs(swipeDx) / Math.max(1, elapsed) > 0.4)) {
        const nextPage = safeIndex + (swipeDx < 0 ? 1 : -1);
        if (nextPage >= 0 && nextPage < pageCount) {
          onHaptic(20);
          onChangePage(nextPage);
        }
        lastTapRef.current = null;
      } else if (elapsed < 260 && Math.hypot(end.clientX - start.x, end.clientY - start.y) < 8) {
        const now = Date.now();
        const lastTap = lastTapRef.current;
        const doubleTap = lastTap && now - lastTap.time < 280 && Math.hypot(start.x - lastTap.x, start.y - lastTap.y) < 24;
        lastTapRef.current = doubleTap ? null : { x: start.x, y: start.y, time: now };
        if (doubleTap) {
          liveZoomRef.current = liveZoomRef.current > 1.05 ? 1 : 2.5;
          livePanRef.current = { x: 0, y: 0 };
          onHaptic(15);
        }
      } else {
        lastTapRef.current = null;
      }
    }
    finishTouch();
  };

  const handleStageTouchCancel = (event: React.TouchEvent<HTMLDivElement>) => {
    lastTapRef.current = null;
    touchStartRef.current = null;
    if (event.touches.length === 0) finishTouch();
    else multiTouchRef.current = true;
  };

  return {
    stageContainerRef,
    zoomScale,
    panOffset,
    resetZoomAndPan,
    handleStageTouchStart,
    handleStageTouchMove,
    handleStageTouchEnd,
    handleStageTouchCancel,
  };
}
