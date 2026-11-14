import { describe, expect, it } from 'vitest';
import {
  computeQuadArea,
  dewarpBookCurvatureAsync,
  getDefaultQuad,
  getFullFrameQuad,
  isQuadConvex,
  orderCorners,
} from './geometry';
import type { Point, Quad } from './types';

describe('geometry calculations', () => {
  it('correctly orders 4 disordered corner points', () => {
    // Unordered points of a rectangle
    const disordered: Point[] = [
      { x: 300, y: 400 }, // bottom-right
      { x: 10, y: 15 },   // top-left
      { x: 20, y: 395 },  // bottom-left
      { x: 310, y: 20 },  // top-right
    ];

    const ordered = orderCorners(disordered);

    expect(ordered.topLeft).toEqual({ x: 10, y: 15 });
    expect(ordered.topRight).toEqual({ x: 310, y: 20 });
    expect(ordered.bottomRight).toEqual({ x: 300, y: 400 });
    expect(ordered.bottomLeft).toEqual({ x: 20, y: 395 });
  });

  it('throws error when points count is not 4', () => {
    expect(() => orderCorners([{ x: 0, y: 0 }])).toThrow();
  });

  it('identifies convex vs self-intersecting quads', () => {
    const convexQuad: Quad = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 100, y: 0 },
      bottomRight: { x: 100, y: 100 },
      bottomLeft: { x: 0, y: 100 },
    };
    expect(isQuadConvex(convexQuad)).toBe(true);

    // Cross-over / bow-tie self intersecting polygon
    const bowTieQuad: Quad = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 100, y: 100 },
      bottomRight: { x: 100, y: 0 },
      bottomLeft: { x: 0, y: 100 },
    };
    expect(isQuadConvex(bowTieQuad)).toBe(false);
  });

  it('computes full frame quad within valid bounds', () => {
    const quad = getFullFrameQuad(1000, 2000, 0.01);
    expect(quad.topLeft.x).toBe(10);
    expect(quad.topLeft.y).toBe(20);
    expect(quad.topRight.x).toBe(990);
    expect(quad.bottomRight.y).toBe(1980);
    expect(isQuadConvex(quad)).toBe(true);
  });

  it('computes standard default crop quad centered with padding', () => {
    const quad = getDefaultQuad(1000, 1000);
    expect(quad.topLeft.x).toBe(80);
    expect(quad.topLeft.y).toBe(80);
    expect(quad.bottomRight.x).toBe(920);
    expect(quad.bottomRight.y).toBe(920);
    expect(isQuadConvex(quad)).toBe(true);
  });

  it('computes accurate shoelace quad area for asymmetric trapezoids regardless of winding order', () => {
    // Non-square trapezoid where bl.x != bl.y to guard against shoelace axis typos
    // Top base = 200 (x: 100..300 at y=20), Bottom base = 400 (x: 0..400 at y=120), height = 100 => area = 30,000
    const tl = { x: 100, y: 20 };
    const tr = { x: 300, y: 20 };
    const br = { x: 400, y: 120 };
    const bl = { x: 0, y: 120 };
    expect(computeQuadArea(tl, tr, br, bl)).toBeCloseTo(30_000, 5);
    expect(computeQuadArea(bl, br, tr, tl)).toBeCloseTo(30_000, 5);
  });

  it('returns source canvas unchanged when dewarping curvature is zero', async () => {
    const mockCanvas = { width: 120, height: 160 } as HTMLCanvasElement;
    expect(await dewarpBookCurvatureAsync(mockCanvas, 0, 0.5)).toBe(mockCanvas);
  });
});
