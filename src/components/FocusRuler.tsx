import React, { useEffect, useState } from 'react';

interface FocusRulerProps {
  active: boolean;
  height?: number;
  opacity?: number;
}

export const FocusRuler: React.FC<FocusRulerProps> = ({
  active,
  height = 56,
  opacity = 0.6
}) => {
  const [mouseY, setMouseY] = useState(window.innerHeight / 2);

  useEffect(() => {
    if (!active) return;

    let rafId: number;
    const handleMouseMove = (e: MouseEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setMouseY(e.clientY);
      });
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches[0]) {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          setMouseY(e.touches[0].clientY);
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      cancelAnimationFrame(rafId);
    };
  }, [active]);

  if (!active) return null;

  const topMaskHeight = Math.max(0, mouseY - height / 2);
  const bottomMaskTop = mouseY + height / 2;

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      {/* Top Dimming Mask */}
      <div
        className="absolute inset-x-0 top-0 backdrop-blur-[0.5px]"
        style={{
          height: `${topMaskHeight}px`,
          backgroundColor: `rgba(0, 0, 0, ${opacity})`
        }}
      />

      {/* Focus Reading Line Indicator */}
      <div
        className="absolute inset-x-0 border-y border-amber-400/40 bg-amber-400/5"
        style={{
          top: `${topMaskHeight}px`,
          height: `${height}px`
        }}
      >
        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-70">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-[10px] uppercase font-mono tracking-wider text-amber-300 font-semibold">
            Focus Mode
          </span>
        </div>
      </div>

      {/* Bottom Dimming Mask */}
      <div
        className="absolute inset-x-0 bottom-0 backdrop-blur-[0.5px]"
        style={{
          top: `${bottomMaskTop}px`,
          backgroundColor: `rgba(0, 0, 0, ${opacity})`
        }}
      />
    </div>
  );
};
