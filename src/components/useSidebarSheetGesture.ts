import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';

export function useSidebarSheetGesture(isSheet: boolean, onClose: () => void) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const sheetHeightRef = useRef<number>(0);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startedAt: number;
    delta: number;
  } | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    };
  }, []);

  const resetSheetMotion = useCallback(() => {
    const sheet = sheetRef.current;
    if (sheet) {
      sheet.style.transition = '';
      sheet.style.transform = '';
    }
    const backdrop = backdropRef.current;
    if (backdrop) {
      backdrop.style.transition = '';
      backdrop.style.opacity = '';
    }
  }, []);

  const settleSheet = useCallback(
    (shouldClose: boolean) => {
      const sheet = sheetRef.current;
      if (!sheet) return;

      sheet.style.transition = 'transform 230ms cubic-bezier(0.22, 1, 0.36, 1)';
      const backdrop = backdropRef.current;
      if (backdrop) backdrop.style.transition = 'opacity 200ms ease';

      if (shouldClose) {
        sheet.style.transform = 'translate3d(0, 110%, 0)';
        if (backdrop) backdrop.style.opacity = '0';
        closeTimerRef.current = window.setTimeout(() => {
          closeTimerRef.current = null;
          resetSheetMotion();
          onClose();
        }, 230);
        return;
      }

      sheet.style.transform = 'translate3d(0, 0, 0)';
      if (backdrop) backdrop.style.opacity = '1';
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        if (sheetRef.current) sheetRef.current.style.transition = '';
        if (backdropRef.current) backdropRef.current.style.transition = '';
      }, 240);
    },
    [onClose, resetSheetMotion]
  );

  const handleHandlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isSheet) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }

    const sheet = sheetRef.current;
    if (!sheet) return;

    sheetHeightRef.current = sheet.offsetHeight || window.innerHeight;
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startedAt: performance.now(),
      delta: 0,
    };

    // Entrance animation uses `translate`; clear it before driving `transform`.
    sheet.style.animation = 'none';
    sheet.style.transition = 'none';
    if (backdropRef.current) backdropRef.current.style.transition = 'none';

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch (err) {
      console.debug('[Sidebar] setPointerCapture skipped:', err);
    }
  };

  const handleHandlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const sheet = sheetRef.current;
    if (!sheet) return;

    const delta = Math.max(0, event.clientY - drag.startY);
    drag.delta = delta;

    const shown = delta <= 160 ? delta : 160 + (delta - 160) * 0.62;
    const height = Math.max(1, sheetHeightRef.current || window.innerHeight);

    sheet.style.transform = `translate3d(0, ${shown}px, 0)`;
    if (backdropRef.current) {
      backdropRef.current.style.opacity = `${Math.max(0, 1 - (delta / height) * 0.8)}`;
    }

    if (event.cancelable) event.preventDefault();
  };

  const handleHandlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (err) {
      console.debug('[Sidebar] releasePointerCapture skipped:', err);
    }

    const height = Math.max(1, sheetHeightRef.current || window.innerHeight);
    const elapsed = Math.max(1, performance.now() - drag.startedAt);
    const velocity = drag.delta / elapsed;
    const passedDistance = drag.delta > Math.min(150, height * 0.22);
    const flickedDown = drag.delta > 36 && velocity > 0.55;

    settleSheet(passedDistance || flickedDown);
  };

  const handleHandlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    settleSheet(false);
  };

  return {
    sheetRef,
    backdropRef,
    handleHandlePointerDown,
    handleHandlePointerMove,
    handleHandlePointerEnd,
    handleHandlePointerCancel,
  };
}
