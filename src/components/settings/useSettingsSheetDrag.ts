import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { triggerHaptic } from '../../core/utils/haptics';

export function useSettingsSheetDrag(isOpen: boolean, onClose: () => void) {
  const [sheetState, setSheetState] = useState({
    open: isOpen,
    expanded: false,
    dragOffset: 0,
    isDragging: false,
  });

  const isExpanded = isOpen && sheetState.open ? sheetState.expanded : false;
  const dragOffset = isOpen && sheetState.open ? sheetState.dragOffset : 0;
  const isDragging = isOpen && sheetState.open ? sheetState.isDragging : false;

  const setIsExpanded = (next: boolean | ((prev: boolean) => boolean)) =>
    setSheetState((prev) => {
      const currentExpanded = isOpen && prev.open ? prev.expanded : false;
      const expanded = typeof next === 'function' ? next(currentExpanded) : next;
      return { ...prev, open: isOpen, expanded };
    });

  const setDragOffset = (nextOffset: number) =>
    setSheetState((prev) => ({ ...prev, open: isOpen, dragOffset: nextOffset }));

  const setIsDragging = (nextDragging: boolean) =>
    setSheetState((prev) => ({ ...prev, open: isOpen, isDragging: nextDragging }));

  const dragStartYRef = useRef(0);
  const currentDragOffsetRef = useRef(0);
  const dragStartTimeRef = useRef(0);
  const isDraggingActiveRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      isDraggingActiveRef.current = false;
    }
  }, [isOpen]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragStartYRef.current = e.clientY;
    currentDragOffsetRef.current = 0;
    dragStartTimeRef.current = Date.now();
    isDraggingActiveRef.current = true;
    setIsDragging(true);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (err) {
      console.debug('[SettingsModal] setPointerCapture skipped:', err);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingActiveRef.current) return;
    const deltaY = e.clientY - dragStartYRef.current;

    let effectiveOffset = deltaY;
    if (deltaY < 0) {
      effectiveOffset = deltaY * (isExpanded ? 0.2 : 0.4);
    }
    currentDragOffsetRef.current = effectiveOffset;
    setDragOffset(effectiveOffset);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingActiveRef.current) return;
    isDraggingActiveRef.current = false;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (err) {
      console.debug('[SettingsModal] releasePointerCapture skipped:', err);
    }

    const deltaY = currentDragOffsetRef.current;
    const elapsed = Math.max(1, Date.now() - dragStartTimeRef.current);
    const velocity = deltaY / elapsed;

    // 1. Drag down or flick down -> dismiss or collapse
    if (deltaY > 110 || (deltaY > 40 && velocity > 0.4)) {
      if (isExpanded && deltaY < 180 && velocity < 0.75) {
        setIsExpanded(false);
        setDragOffset(0);
        triggerHaptic('light');
        return;
      }
      triggerHaptic('medium');
      onClose();
      return;
    }

    // 2. Drag up or flick up -> expand / maximize
    if (deltaY < -40 || (deltaY < -15 && velocity < -0.35)) {
      if (!isExpanded) {
        setIsExpanded(true);
        triggerHaptic('light');
      }
      setDragOffset(0);
      return;
    }

    // 3. Tap on handle (< 8px movement in short time) -> toggle expand
    if (Math.abs(deltaY) < 8 && elapsed < 350) {
      setIsExpanded((prev) => !prev);
      triggerHaptic('light');
      setDragOffset(0);
      return;
    }

    setDragOffset(0);
  };

  return {
    isExpanded,
    dragOffset,
    isDragging,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
