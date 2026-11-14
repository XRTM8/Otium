// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
  detectDocumentCornersWithConfidence,
  calculateLaplacianSharpness,
  getFullFrameQuad,
} from './edgeDetection';
import { expandQuadSafetyMargin, getQuadAspectRatio, isQuadConvex } from './geometry';
import type { Quad } from './types';

describe('edgeDetection & document analysis intelligence', () => {
  it('safely handles zero-dimension sources without throwing', () => {
    const fakeZeroImage = { width: 0, height: 0 } as HTMLImageElement;
    const res = detectDocumentCornersWithConfidence(fakeZeroImage);

    expect(res.confidence).toBe(0);
    expect(res.isDocumentPresent).toBe(false);
    expect(res.quad).toEqual(getFullFrameQuad(0, 0, 0));
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

function canvasWithPixels(width: number, height: number, shade: (x: number, y: number) => number | [number, number, number]) {
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const color = shade(x, y);
      if (typeof color === 'number') data.fill(color, i, i + 3);
      else data.set(color, i);
      data[i + 3] = 255;
    }
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    getImageData: () => ({ data }),
  } as Partial<CanvasRenderingContext2D> as CanvasRenderingContext2D);
  return source;
}

describe('document edge detection', () => {
  it('finds an inset portrait page against a contrasting background', () => {
    const source = canvasWithPixels(140, 200, (x, y) =>
      x >= 17 && x < 123 && y >= 24 && y < 176 ? 240 : 35,
    );
    const result = detectDocumentCornersWithConfidence(source);
    expect(result.isDocumentPresent).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(90);
    expect(result.quad.topLeft.x).toBeCloseTo(17, -1);
    expect(result.quad.topLeft.y).toBeCloseTo(24, -1);
    expect(result.quad.bottomRight.x).toBeCloseTo(123, -1);
    expect(result.quad.bottomRight.y).toBeCloseTo(176, -1);
  });

  it('keeps every pixel of a uniform scene or a page cut off by the frame', () => {
    for (const shade of [() => 120, (x: number, y: number) => x < 150 && y >= 30 && y < 180 ? 240 : 45]) {
      expect(detectDocumentCornersWithConfidence(canvasWithPixels(200, 220, shade))).toMatchObject({
        isDocumentPresent: false,
        confidence: 0,
        quad: getFullFrameQuad(200, 220, 0),
      });
    }
  });

  it('finds a page on a patterned background', () => {
    const source = canvasWithPixels(200, 280, (x, y) => x >= 35 && x < 165 && y >= 45 && y < 235
      ? 240 : (Math.floor(x / 9) + Math.floor(y / 9)) % 2 ? 40 : 96);
    const result = detectDocumentCornersWithConfidence(source);
    expect(result.isDocumentPresent).toBe(true);
    expect(result.quad.topLeft.x).toBeCloseTo(35, -1);
    expect(result.quad.bottomRight.y).toBeCloseTo(235, -1);
  });

  it('finds paper separated by color when the paper and background have equal luminance', () => {
    const source = canvasWithPixels(200, 280, (x, y) => x >= 35 && x < 165 && y >= 45 && y < 235
      ? [190, 190, 250] : [220, 190, 170]);
    const result = detectDocumentCornersWithConfidence(source);
    expect(result.isDocumentPresent).toBe(true);
    expect(result.quad.topLeft.x).toBeCloseTo(35, -1);
    expect(result.quad.topLeft.y).toBeCloseTo(45, -1);
    expect(result.quad.bottomRight.x).toBeCloseTo(165, -1);
    expect(result.quad.bottomRight.y).toBeCloseTo(235, -1);
  });

  it('finds a tilted low-contrast page and a narrow off-centre receipt', () => {
    const tilted = canvasWithPixels(240, 260, (x, y) =>
      y > 38 + x * 0.22 && y < 209 + x * 0.15 && x > 45 - y * 0.12 && x < 195 - y * 0.16 ? 236 : 210);
    const result = detectDocumentCornersWithConfidence(tilted);
    expect(result.isDocumentPresent).toBe(true);
    expect(result.quad.topRight.y - result.quad.topLeft.y).toBeGreaterThan(20);
    const receipt = canvasWithPixels(220, 260, (x, y) => x >= 20 && x < 66 && y >= 27 && y < 235 ? 223 : 60);
    const narrow = detectDocumentCornersWithConfidence(receipt);
    expect(narrow.isDocumentPresent).toBe(true);
    expect(narrow.quad.topRight.x).toBeCloseTo(66, -1);
  });

  it('keeps the complete paper when a diagonal shadow splits its brightness', () => {
    const source = canvasWithPixels(240, 280, (x, y) => {
      const paper = x >= 33 && x <= 203 && y >= 32 && y <= 244;
      return (paper ? 236 : 83) - (x + y * 0.42 > 169 ? 79 : 0);
    });
    const result = detectDocumentCornersWithConfidence(source);
    expect(result.isDocumentPresent).toBe(true);
    expect(result.quad.topLeft.x).toBeCloseTo(33, -1);
    expect(result.quad.bottomRight.x).toBeCloseTo(203, -1);
    expect(result.quad.bottomRight.y).toBeCloseTo(244, -1);
  });

  it('returns the full image if Canvas cannot provide pixels', () => {
    const source = document.createElement('canvas');
    const quad = getFullFrameQuad(source.width, source.height, 0);
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(detectDocumentCornersWithConfidence(source)).toEqual({ quad, isDocumentPresent: false, confidence: 0 });
    getContext.mockImplementation(() => { throw new Error('canvas unavailable'); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(detectDocumentCornersWithConfidence(source)).toEqual({ quad, isDocumentPresent: false, confidence: 0 });
  });
});
