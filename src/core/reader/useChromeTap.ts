import { useRef, type PointerEvent } from 'react';

/** A short, stationary, single-finger tap; scrolling and pinching never toggle UI. */
export function useChromeTap(enabled: boolean, toggle: () => void) {
  const pointers = useRef(new Set<number>());
  const tap = useRef<{ id: number; x: number; y: number; time: number; left: number; top: number } | null>(null);
  const blockedTarget = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('button, a, input, textarea, select, [role="button"], [contenteditable="true"]'));
  return {
    onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => {
      pointers.current.add(event.pointerId);
      const selection = window.getSelection();
      if (!enabled || pointers.current.size !== 1 || event.button !== 0 || blockedTarget(event.target) || (selection && !selection.isCollapsed)) { tap.current = null; return; }
      tap.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
    },
    onPointerMoveCapture: (event: PointerEvent<HTMLDivElement>) => {
      if (tap.current && Math.hypot(event.clientX - tap.current.x, event.clientY - tap.current.y) > 8) tap.current = null;
    },
    onPointerCancelCapture: (event: PointerEvent<HTMLDivElement>) => { pointers.current.delete(event.pointerId); tap.current = null; },
    onPointerUpCapture: (event: PointerEvent<HTMLDivElement>) => {
      const candidate = tap.current; pointers.current.delete(event.pointerId); tap.current = null;
      if (!enabled || !candidate || candidate.id !== event.pointerId || pointers.current.size || performance.now() - candidate.time > 300) return;
      if (Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y) > 8 || Math.abs(event.currentTarget.scrollTop - candidate.top) > 2 || Math.abs(event.currentTarget.scrollLeft - candidate.left) > 2) return;
      toggle();
    }
  };
}
