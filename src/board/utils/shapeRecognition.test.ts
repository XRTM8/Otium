import { describe, expect, it } from 'vitest';
import { recognizeGeometricShape } from './shapeRecognition';
import type { StrokePoint } from '../types';

describe('Smartboard Draw & Hold Shape Recognition Engine', () => {
  const samplePolygon = (corners: StrokePoint[]) => corners.flatMap((a, i) => {
    const b = corners[(i + 1) % corners.length];
    return Array.from({ length: 20 }, (_, j) => ({ x: a.x + (b.x - a.x) * j / 20, y: a.y + (b.y - a.y) * j / 20 }));
  }).concat(corners[0]);
  it('keeps a square as a square instead of accepting its radius variance as a circle', () => {
    const points = samplePolygon([{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }]);
    expect(recognizeGeometricShape(points)?.type).toBe('rectangle');
  });
  it('recognizes a rotated rectangle and an inverted triangle', () => {
    const rectangle = samplePolygon([{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 200 }, { x: 100, y: 200 }]).map(p => ({ x: p.x * .866 - p.y * .5, y: p.x * .5 + p.y * .866 }));
    expect(recognizeGeometricShape(rectangle)?.type).toBe('rectangle');
    expect(recognizeGeometricShape(samplePolygon([{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 200, y: 300 }]))?.type).toBe('triangle');
  });
  it('recognizes a wide ellipse without turning it into a rectangle', () => {
    const ellipse = Array.from({ length: 65 }, (_, i) => ({ x: 300 + 180 * Math.cos(i / 64 * 2 * Math.PI), y: 200 + 55 * Math.sin(i / 64 * 2 * Math.PI) }));
    expect(recognizeGeometricShape(ellipse)?.type).toBe('circle');
  });
  it('returns null for very few points or dots', () => {
    expect(recognizeGeometricShape([])).toBeNull();
    expect(recognizeGeometricShape([{ x: 10, y: 10 }])).toBeNull();
  });

  it('recognizes a straight horizontal line and snaps to level', () => {
    const points: StrokePoint[] = [];
    for (let x = 100; x <= 400; x += 10) {
      // Small natural hand jitter of ±1px
      const jitter = (x % 3) - 1;
      points.push({ x, y: 200 + jitter });
    }

    const res = recognizeGeometricShape(points);
    expect(res).not.toBeNull();
    expect(res?.type).toBe('line');
    expect(res?.points.length).toBe(2);
    // Snapped to exact horizontal: y1 === y2
    expect(res?.points[0].y).toBe(res?.points[1].y);
  });

  it('recognizes a straight vertical line and snaps to vertical', () => {
    const points: StrokePoint[] = [];
    for (let y = 100; y <= 400; y += 10) {
      const jitter = (y % 3) - 1;
      points.push({ x: 300 + jitter, y });
    }

    const res = recognizeGeometricShape(points);
    expect(res).not.toBeNull();
    expect(res?.type).toBe('line');
    expect(res?.points[0].x).toBe(res?.points[1].x);
  });

  it('recognizes a freehand circle and snaps to smooth vector circle', () => {
    const points: StrokePoint[] = [];
    const cx = 200, cy = 200, r = 80;
    const steps = 30;

    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const jitter = ((i % 4) - 2) * 2;
      points.push({
        x: cx + (r + jitter) * Math.cos(angle),
        y: cy + (r + jitter) * Math.sin(angle)
      });
    }

    const res = recognizeGeometricShape(points);
    expect(res).not.toBeNull();
    expect(res?.type).toBe('circle');
    expect(res?.points.length).toBeGreaterThan(20);
  });

  it('recognizes a rectangle and returns 5 closed points', () => {
    const points: StrokePoint[] = [];
    // Top: (100, 100) -> (300, 100)
    for (let x = 100; x <= 300; x += 20) points.push({ x, y: 100 });
    // Right: (300, 100) -> (300, 200)
    for (let y = 100; y <= 200; y += 20) points.push({ x: 300, y });
    // Bottom: (300, 200) -> (100, 200)
    for (let x = 300; x >= 100; x -= 20) points.push({ x, y: 200 });
    // Left: (100, 200) -> (100, 100)
    for (let y = 200; y >= 100; y -= 20) points.push({ x: 100, y });

    const res = recognizeGeometricShape(points);
    expect(res).not.toBeNull();
    expect(res?.type).toBe('rectangle');
    expect(res?.points.length).toBe(5);
    // Closed shape: first point === last point
    expect(res?.points[0]).toEqual(res?.points[4]);
  });

  it('rejects random zig-zag squiggles as non-shapes', () => {
    const points: StrokePoint[] = [
      { x: 10, y: 10 },
      { x: 50, y: 90 },
      { x: 90, y: 20 },
      { x: 140, y: 100 },
      { x: 180, y: 30 },
      { x: 220, y: 120 }
    ];

    const res = recognizeGeometricShape(points);
    expect(res).toBeNull();
  });
});
