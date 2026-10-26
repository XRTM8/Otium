import { describe, expect, it } from 'vitest';
import type { AnnotationRect } from '../types';
import { normalizeAnnotationRects } from './geometry';

describe('annotation geometry', () => {
  it('merges overlapping line fragments so highlights do not stack', () => {
    const rects: AnnotationRect[] = [
      { xPct: 0.1, yPct: 0.2, widthPct: 0.3, heightPct: 0.04 },
      { xPct: 0.39, yPct: 0.2, widthPct: 0.2, heightPct: 0.04 },
      { xPct: 0.1, yPct: 0.3, widthPct: 0.5, heightPct: 0.04 }
    ];

    expect(normalizeAnnotationRects(rects)).toEqual([
      { xPct: 0.1, yPct: 0.2, widthPct: 0.49, heightPct: 0.04 },
      { xPct: 0.1, yPct: 0.3, widthPct: 0.5, heightPct: 0.04 }
    ]);
  });

  it('clamps boxes that extend past the page', () => {
    expect(
      normalizeAnnotationRects([
        { xPct: 0.8, yPct: -0.1, widthPct: 0.5, heightPct: 0.2 }
      ])
    ).toEqual([{ xPct: 0.8, yPct: 0, widthPct: 0.2, heightPct: 0.2 }]);
  });
});
