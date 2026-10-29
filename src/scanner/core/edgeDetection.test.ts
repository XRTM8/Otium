import { describe, expect, it } from 'vitest';
import {
  detectDocumentCornersWithConfidence,
  calculateLaplacianSharpness,
} from './edgeDetection';
import { expandQuadSafetyMargin, getQuadAspectRatio, isQuadConvex } from './geometry';
import type { Quad } from './types';

describe('edgeDetection & document analysis intelligence', () => {
  it('safely handles zero-dimension sources without throwing', () => {
    const fakeZeroImage = { width: 0, height: 0 } as HTMLImageElement;
    const res = detectDocumentCornersWithConfidence(fakeZeroImage);

    expect(res.confidence).toBe(0);
    expect(res.isDocumentPresent).toBe(false);
    expect(isQuadConvex(res.quad)).toBe(true);
  });

  it('honors forceFullFrame override', () => {
    const fakeImage = { width: 1000, height: 1414 } as HTMLImageElement;
    const res = detectDocumentCornersWithConfidence(fakeImage, true);

    expect(res.confidence).toBe(100);
    expect(res.isDocumentPresent).toBe(true);
    expect(res.orientation).toBe('portrait');
    expect(res.quad.topLeft.x).toBe(5);
    expect(res.quad.topRight.x).toBe(995);
  });

  it('calculates aspect ratio correctly for A4 portrait document', () => {
    const a4Quad: Quad = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 1000, y: 0 },
      bottomRight: { x: 1000, y: 1414 },
      bottomLeft: { x: 0, y: 1414 },
    };

    const ratio = getQuadAspectRatio(a4Quad);
    expect(ratio).toBeCloseTo(1000 / 1414, 2);
  });

  it('expands quad safety margin outward to safeguard text', () => {
    const initialQuad: Quad = {
      topLeft: { x: 100, y: 100 },
      topRight: { x: 900, y: 100 },
      bottomRight: { x: 900, y: 900 },
      bottomLeft: { x: 100, y: 900 },
    };

    const expanded = expandQuadSafetyMargin(initialQuad, 1000, 1000, 0.05);

    // Top-left should move further towards (0, 0)
    expect(expanded.topLeft.x).toBeLessThan(initialQuad.topLeft.x);
    expect(expanded.topLeft.y).toBeLessThan(initialQuad.topLeft.y);

    // Bottom-right should move further towards (1000, 1000)
    expect(expanded.bottomRight.x).toBeGreaterThan(initialQuad.bottomRight.x);
    expect(expanded.bottomRight.y).toBeGreaterThan(initialQuad.bottomRight.y);

    expect(isQuadConvex(expanded)).toBe(true);
  });

  it('calculateLaplacianSharpness returns 0 on empty input', () => {
    const fakeEmpty = { width: 0, height: 0 } as HTMLImageElement;
    expect(calculateLaplacianSharpness(fakeEmpty)).toBe(0);
  });
});
