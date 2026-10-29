import React, { useRef } from 'react';

interface ResizeDividerProps {
  splitPercent: number; // 0 to 100 (percentage of first pane width)
  onSplitChange: (newPercent: number) => void;
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isRtl?: boolean;
}

export const ResizeDivider: React.FC<ResizeDividerProps> = ({
  onSplitChange,
  isDragging,
  setIsDragging,
  containerRef,
  isRtl = false
}) => {
  const dividerRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<number>(0);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const divider = dividerRef.current;
    if (!divider) return;
    divider.setPointerCapture(e.pointerId);
    setIsDragging(true);

    // Double tap / double click detection to snap to 50%
    const now = performance.now();
    if (now - lastTapRef.current < 320) {
      onSplitChange(50);
      setIsDragging(false);
      try {
        divider.releasePointerCapture(e.pointerId);
      } catch {}
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const containerWidth = rect.width;
    if (containerWidth <= 0) return;

    let relativeX = e.clientX - rect.left;
    if (isRtl) {
      relativeX = rect.right - e.clientX;
    }

    let percent = (relativeX / containerWidth) * 100;

    // Magnetic snap to 50%
    if (percent >= 46 && percent <= 54) {
      percent = 50;
    } else if (percent < 12) {
      percent = 0; // Collapse completely to full board
    } else if (percent > 88) {
      percent = 100; // Collapse completely to full reader
    }

    onSplitChange(Math.max(0, Math.min(100, Math.round(percent))));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const divider = dividerRef.current;
    if (divider && divider.hasPointerCapture(e.pointerId)) {
      try {
        divider.releasePointerCapture(e.pointerId);
      } catch {}
    }
    setIsDragging(false);
  };

  return (
    <div
      ref={dividerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      title="اسحب لتغيير الحجم • انقر نقراً مزدوجاً للموازنة 50/50"
      className={`relative z-30 flex items-center justify-center cursor-col-resize select-none touch-none transition-all group before:absolute before:-inset-x-3 before:h-full before:z-10 ${
        isDragging
          ? 'w-2.5 bg-accent/30 backdrop-blur-sm'
          : 'w-1.5 hover:w-2 bg-line/60 hover:bg-accent/20'
      }`}
    >
      {/* Centered Apple-grade tactile pill handle */}
      <div
        className={`relative z-20 flex flex-col items-center justify-center gap-1 w-3.5 h-10 rounded-full border shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition-all ${
          isDragging
            ? 'bg-accent text-on-accent scale-110 shadow-lg border-accent ring-4 ring-accent/20'
            : 'bg-surface/95 text-ink-muted group-hover:text-accent group-hover:scale-105 border-line/90 backdrop-blur-md'
        }`}
      >
        <span className="w-1 h-1 rounded-full bg-current opacity-70" />
        <span className="w-1 h-1 rounded-full bg-current opacity-70" />
        <span className="w-1 h-1 rounded-full bg-current opacity-70" />
      </div>
    </div>
  );
};
