import { describe, expect, it } from 'vitest';
import { recognizeGeometricShape } from './shapeRecognition';
import type { StrokePoint } from '../types';

describe('Smartboard Draw & Hold Shape Recognition Engine', () => {
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
