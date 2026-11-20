import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { triggerHaptic } from '../../core/utils/haptics';

function applyDomTransform(el: HTMLDivElement | null, offset: number) {
  if (!el) return;
  el.style.transform = offset !== 0 ? `translate3d(0, ${offset}px, 0)` : '';
  el.style.opacity = offset > 0 ? `${Math.max(0.35, 1 - offset / 340)}` : '';
}

function resetDomStyles(el: HTMLDivElement | null) {
  if (!el) return;
  el.style.transform = '';
  el.style.opacity = '';
  el.style.transition = '';
  el.style.willChange = '';
  el.style.animation = '';
}

export function useSettingsSheetDrag(isOpen: boolean, onClose: () => void) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [sheetState, setSheetState] = useState({
    open: isOpen,
    expanded: false,
    dragOffset: 0,
    isDragging: false,
  });

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (prevIsOpen !== isOpen) {
    setPrevIsOpen(isOpen);
    if (!isOpen) {
      setSheetState({
        open: false,
        expanded: false,
        dragOffset: 0,
        isDragging: false,
      });
    }
  }

  const isExpanded = isOpen && sheetState.open ? sheetState.expanded : false;
  const dragOffset = isOpen && sheetState.open ? sheetState.dragOffset : 0;
  const isDragging = isOpen && sheetState.open ? sheetState.isDragging : false;

  const setIsExpanded = (next: boolean | ((prev: boolean) => boolean)) =>
    setSheetState((prev) => {
      const currentExpanded = isOpen && prev.open ? prev.expanded : false;
      const expanded = typeof next === 'function' ? next(currentExpanded) : next;
      return { ...prev, open: isOpen, expanded };
    });

  const setIsDragging = (nextDragging: boolean) =>
    setSheetState((prev) => ({ ...prev, open: isOpen, isDragging: nextDragging }));

  const setDragOffset = (nextOffset: number) =>
    setSheetState((prev) => ({ ...prev, open: isOpen, dragOffset: nextOffset }));

  const dragStartYRef = useRef(0);
  const currentDragOffsetRef = useRef(0);
  const dragStartTimeRef = useRef(0);
  const isDraggingActiveRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const cleanupGlobalListenersRef = useRef<(() => void) | null>(null);

  const clearGlobalListeners = useCallback(() => {
    if (cleanupGlobalListenersRef.current) {
      cleanupGlobalListenersRef.current();
      cleanupGlobalListenersRef.current = null;
    }
  }, []);

  const scheduleDomTransform = (offset: number) => {
    if (typeof requestAnimationFrame === 'function') {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        applyDomTransform(sheetRef.current, offset);
        rafRef.current = null;
      });
    } else {
      applyDomTransform(sheetRef.current, offset);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      clearGlobalListeners();
      isDraggingActiveRef.current = false;
      activePointerIdRef.current = null;
      if (rafRef.current !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      resetDomStyles(sheetRef.current);
    }
  }, [isOpen, clearGlobalListeners]);

  useEffect(() => {
    const el = sheetRef.current;
    return () => {
      clearGlobalListeners();
      if (rafRef.current !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafRef.current);
      }
      resetDomStyles(el);
    };
  }, [clearGlobalListeners]);

  const processDragMove = (clientY: number) => {
    if (!isDraggingActiveRef.current) return;
    const deltaY = clientY - dragStartYRef.current;

    let effectiveOffset = deltaY;
    if (deltaY < 0) {
      // Damped rubber-band resistance when pulling up
      effectiveOffset = deltaY * (isExpanded ? 0.18 : 0.35);
    }
    currentDragOffsetRef.current = effectiveOffset;

    if (sheetRef.current) {
      scheduleDomTransform(effectiveOffset);
    } else {
      setDragOffset(effectiveOffset);
    }
  };

  const processDragEnd = () => {
    clearGlobalListeners();
    if (!isDraggingActiveRef.current) return;
    isDraggingActiveRef.current = false;
    activePointerIdRef.current = null;

    if (rafRef.current !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const deltaY = currentDragOffsetRef.current;
    const elapsed = Math.max(1, Date.now() - dragStartTimeRef.current);
    const velocity = deltaY / elapsed;
    const target = sheetRef.current;

    // 1. Drag down or flick down -> dismiss or collapse
    if (deltaY > 110 || (deltaY > 40 && velocity > 0.4)) {
      if (isExpanded && deltaY < 180 && velocity < 0.75) {
        if (target) {
          target.style.transition =
            'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease-out, height 0.28s cubic-bezier(0.16, 1, 0.3, 1), max-height 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
          target.style.transform = '';
          target.style.opacity = '';
          target.style.willChange = '';
        }
        setIsExpanded(false);
        setIsDragging(false);
        setDragOffset(0);
        triggerHaptic('light');
        return;
      }

      // Animate smoothly off-screen
      if (target) {
        target.style.transition =
          'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease-out';
        target.style.transform = 'translate3d(0, 100%, 0)';
        target.style.opacity = '0';
      }
      triggerHaptic('medium');
      window.setTimeout(() => {
        onClose();
        setIsDragging(false);
        setDragOffset(0);
      }, 200);
      return;
    }

    // 2. Drag up or flick up -> expand / maximize
    if (deltaY < -40 || (deltaY < -15 && velocity < -0.35)) {
      if (target) {
        target.style.transition =
          'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease-out, height 0.28s cubic-bezier(0.16, 1, 0.3, 1), max-height 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
        target.style.transform = '';
        target.style.opacity = '';
        target.style.willChange = '';
      }
      if (!isExpanded) {
        setIsExpanded(true);
        triggerHaptic('light');
      }
      setIsDragging(false);
      setDragOffset(0);
      return;
    }

    // 3. Tap on handle (< 8px movement in short time) -> toggle expand
    if (Math.abs(deltaY) < 8 && elapsed < 350) {
      if (target) {
        target.style.transition =
          'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease-out, height 0.28s cubic-bezier(0.16, 1, 0.3, 1), max-height 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
        target.style.transform = '';
        target.style.opacity = '';
        target.style.willChange = '';
      }
      setIsExpanded((prev) => !prev);
      triggerHaptic('light');
      setIsDragging(false);
      setDragOffset(0);
      return;
    }

    // 4. Snap back to rest position
    if (target) {
      target.style.transition =
        'transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease-out';
      target.style.transform = '';
      target.style.opacity = '';
      target.style.willChange = '';
    }
    setIsDragging(false);
    setDragOffset(0);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (e.cancelable) {
      e.preventDefault();
    }
    clearGlobalListeners();

    dragStartYRef.current = e.clientY;
    currentDragOffsetRef.current = 0;
    dragStartTimeRef.current = Date.now();
    isDraggingActiveRef.current = true;
    activePointerIdRef.current = e.pointerId;
    setIsDragging(true);

    const el = sheetRef.current;
    if (el) {
      el.style.transition = 'none';
      el.style.animation = 'none';
      el.style.willChange = 'transform, opacity';
    }

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignore if setPointerCapture fails on certain mobile webviews
    }

    const onGlobalMove = (ev: PointerEvent) => {
      if (!isDraggingActiveRef.current) return;
      if (activePointerIdRef.current !== null && ev.pointerId !== activePointerIdRef.current) return;
      processDragMove(ev.clientY);
    };

    const onGlobalUp = (ev: PointerEvent) => {
      if (activePointerIdRef.current !== null && ev.pointerId !== activePointerIdRef.current) return;
      processDragEnd();
    };

    window.addEventListener('pointermove', onGlobalMove, { passive: true });
    window.addEventListener('pointerup', onGlobalUp);
    window.addEventListener('pointercancel', onGlobalUp);

    cleanupGlobalListenersRef.current = () => {
      window.removeEventListener('pointermove', onGlobalMove);
      window.removeEventListener('pointerup', onGlobalUp);
      window.removeEventListener('pointercancel', onGlobalUp);
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    processDragMove(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    processDragEnd();
  };

  return {
    sheetRef,
    isExpanded,
    dragOffset,
    isDragging,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
