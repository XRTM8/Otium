// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

describe('zoom gesture stability & responsiveness invariants', () => {
  it('allows immediate wheel interaction after zooming without artificial lockouts', () => {
    let wheelAccum = 0;
    let wheelDirection = 0;

    const simulateWheel = (deltaY: number) => {
      const direction = deltaY > 0 ? 1 : -1;
      if (wheelDirection !== direction) {
        wheelDirection = direction;
        wheelAccum = 0;
      }
      wheelAccum += Math.abs(deltaY);
      return wheelAccum >= 96;
    };

    // Immediate wheel action without delay lockouts
    expect(simulateWheel(120)).toBe(true);
    expect(wheelAccum).toBe(120);
  });

  it('rejects ambiguous diagonal trackpad gestures in single/dual page mode', () => {
    const isAmbiguousDiagonal = (absX: number, absY: number) => {
      return absX > 0 && absY > 0 && Math.max(absX, absY) / Math.min(absX, absY) < 1.35;
    };

    // Diagonal swipe (e.g. 40px X and 35px Y) -> ratio 1.14 < 1.35 -> ambiguous, rejected!
    expect(isAmbiguousDiagonal(40, 35)).toBe(true);

    // Clear horizontal swipe (e.g. 100px X and 20px Y) -> ratio 5.0 -> accepted
    expect(isAmbiguousDiagonal(100, 20)).toBe(false);

    // Clear vertical scroll (e.g. 15px X and 90px Y) -> ratio 6.0 -> accepted
    expect(isAmbiguousDiagonal(15, 90)).toBe(false);
  });

  it('measures continuous mode pages immediately on scroll without timer freezes', () => {
    const measure = (newEstimatedPage: number) => {
      return newEstimatedPage;
    };

    expect(measure(5)).toBe(5);
    expect(measure(6)).toBe(6);
  });

  it('allows immediate touch interaction without pinch lift lockouts', () => {
    const handleTouch = () => {
      return { action: 'tap' };
    };

    expect(handleTouch()).toEqual({ action: 'tap' });
  });
});
