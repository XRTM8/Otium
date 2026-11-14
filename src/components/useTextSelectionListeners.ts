import type React from 'react';
import { useCallback, useEffect } from 'react';
import { stopTts, type TtsHandle } from '../platform/tts';
import type { SelectionState } from './textSelectionGeometry';

interface UseTextSelectionListenersOptions {
  mode: string;
  mobile: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  selectionRef: React.MutableRefObject<SelectionState | null>;
  pointerActiveRef: React.MutableRefObject<boolean>;
  captureTimersRef: React.MutableRefObject<number[]>;
  watchdogRef: React.MutableRefObject<number | null>;
  speechHandleRef: React.MutableRefObject<TtsHandle | null>;
  clearCaptureTimers: () => void;
  stopSelectionWatchdog: () => void;
  captureSelection: () => boolean;
  clearSelection: () => void;
}

export function useTextSelectionListeners({
  mode,
  mobile,
  menuRef,
  selectionRef,
  pointerActiveRef,
  captureTimersRef,
  watchdogRef,
  speechHandleRef,
  clearCaptureTimers,
  stopSelectionWatchdog,
  captureSelection,
  clearSelection,
}: UseTextSelectionListenersOptions) {
  const scheduleCapture = useCallback(
    (delays: number[], clearWhenEmpty = false) => {
      clearCaptureTimers();
      const attempts = delays.length > 0 ? delays : [0];

      attempts.forEach((delay, index) => {
        const timer = window.setTimeout(() => {
          captureTimersRef.current = captureTimersRef.current.filter(
            (candidate) => candidate !== timer
          );

          const captured = captureSelection();
          const isLastAttempt = index === attempts.length - 1;
          if (!isLastAttempt || captured || !clearWhenEmpty || !selectionRef.current) {
            return;
          }

          const selection = window.getSelection();
          const stillEmpty =
            !selection || selection.isCollapsed || !selection.toString().trim();
          if (stillEmpty) clearSelection();
        }, delay);
        captureTimersRef.current.push(timer);
      });
    },
    [captureSelection, captureTimersRef, clearCaptureTimers, clearSelection, selectionRef]
  );

  /**
   * Android WebView can swallow pointerup after a long-press selection and
   * delay `selectionchange` until the next layout. Poll briefly after any
   * touch on the page so the action bar never waits for a scroll.
   */
  const startSelectionWatchdog = useCallback(() => {
    stopSelectionWatchdog();
    const startedAt = performance.now();

    watchdogRef.current = window.setInterval(() => {
      const selection = window.getSelection();
      const hasSelection = Boolean(
        selection && !selection.isCollapsed && selection.toString().trim()
      );

      if (hasSelection) {
        stopSelectionWatchdog();
        scheduleCapture([100], false);
        return;
      }

      if (performance.now() - startedAt > 5000) stopSelectionWatchdog();
    }, 110);
  }, [scheduleCapture, stopSelectionWatchdog, watchdogRef]);

  useEffect(() => {
    if (mode !== 'select') return;
    const handlePointerDown = (event: PointerEvent) => {
      if (mode !== 'select') return;
      pointerActiveRef.current = true;
      if (menuRef.current?.contains(event.target as Node)) return;

      const target = event.target as HTMLElement | null;
      const insidePage = Boolean(target?.closest?.('[data-pdf-page]'));

      if (!insidePage) {
        if (selectionRef.current) clearSelection();
        return;
      }

      if (!selectionRef.current) startSelectionWatchdog();
    };

    const handlePointerUp = (event: PointerEvent) => {
      pointerActiveRef.current = false;
      if (menuRef.current?.contains(event.target as Node)) return;
      scheduleCapture([60, 180], true);
    };

    const handleTouchEnd = (event: TouchEvent) => {
      pointerActiveRef.current = false;
      if (menuRef.current?.contains(event.target as Node)) return;
      scheduleCapture(mobile ? [0, 80, 220, 420] : [0, 50], true);
    };

    const handlePointerCancel = () => {
      pointerActiveRef.current = false;
    };

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const hasSelection = Boolean(
        selection && !selection.isCollapsed && selection.toString().trim()
      );

      if (hasSelection) {
        scheduleCapture([100], false);
        return;
      }

      if (!pointerActiveRef.current && selectionRef.current) {
        scheduleCapture([140, 300], true);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clearSelection();
    };

    const handleScroll = () => {
      if (selectionRef.current) scheduleCapture([140], false);
    };

    const handleResize = () => {
      if (!mobile && selectionRef.current) clearSelection();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('pointerup', handlePointerUp, true);
    document.addEventListener('pointercancel', handlePointerCancel, true);
    document.addEventListener('touchend', handleTouchEnd, true);
    document.addEventListener('touchcancel', handlePointerCancel, true);
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('pointerup', handlePointerUp, true);
      document.removeEventListener('pointercancel', handlePointerCancel, true);
      document.removeEventListener('touchend', handleTouchEnd, true);
      document.removeEventListener('touchcancel', handlePointerCancel, true);
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      clearCaptureTimers();
      stopSelectionWatchdog();
      speechHandleRef.current?.cancel();
      speechHandleRef.current = null;
      stopTts();
    };
  }, [
    mode,
    clearCaptureTimers,
    clearSelection,
    menuRef,
    mobile,
    pointerActiveRef,
    scheduleCapture,
    selectionRef,
    speechHandleRef,
    startSelectionWatchdog,
    stopSelectionWatchdog,
  ]);
}
