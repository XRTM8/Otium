import React, { useRef } from 'react';
import { GripVertical } from 'lucide-react';

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
      title="اسحب لتغيير الحجم، انقر نقراً مزدوجاً للموازنة 50/50"
      className={`relative z-30 flex items-center justify-center cursor-col-resize select-none touch-none transition-colors ${
        isDragging
          ? 'w-3 bg-accent/40 backdrop-blur-sm'
          : 'w-2 hover:w-3 bg-line/80 hover:bg-accent/30'
      }`}
    >
      {/* Centered tactile pill handle */}
      <div
        className={`flex items-center justify-center w-4 h-12 rounded-full border shadow-md transition-all ${
          isDragging
            ? 'bg-accent text-on-accent scale-110 shadow-lg border-accent'
            : 'bg-surface text-ink-muted hover:text-ink hover:scale-105 border-line'
        }`}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>
    </div>
  );
};
