import { describe, expect, it } from 'vitest';
import { pinchScale } from './pinch';

describe('pinch zoom', () => {
  it('uses the initial gesture scale, not the previous move, so zoom does not compound', () => {
    expect(pinchScale(1, 100, 110, 0.1, 4)).toBe(1.1);
    expect(pinchScale(1, 100, 120, 0.1, 4)).toBe(1.2);
    expect(pinchScale(1, 100, 100, 0.1, 4)).toBe(1);
  });
  it('clamps extremes and ignores invalid touch distances', () => {
    expect(pinchScale(1, 100, 10000, 0.1, 4)).toBe(4);
    expect(pinchScale(1, 100, 1, 0.1, 4)).toBe(0.1);
    expect(pinchScale(1, 0, 50, 0.1, 4)).toBe(1);
    expect(pinchScale(1, 100, NaN, 0.1, 4)).toBe(1);
  });
});
