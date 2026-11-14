import { describe, expect, it, vi } from 'vitest';
import { drawBoardInk, isStrokeNearPoint } from './boardInk';
import type { BoardStroke } from '../types';

describe('boardInk rendering and geometric collision', () => {
  it('renders snapped rectangles with straight edges in both live and exported ink', () => {
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      quadraticCurveTo: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    drawBoardInk(
      ctx,
      [
        {
          id: 'square',
          tool: 'pen',
          shape: 'rectangle',
          width: 4,
          color: '#e11d48',
          points: [
            { x: 10, y: 10 },
            { x: 90, y: 10 },
            { x: 90, y: 90 },
            { x: 10, y: 90 },
            { x: 10, y: 10 },
          ],
        },
      ],
      false
    );
    expect(ctx.lineTo).toHaveBeenCalledTimes(4);
    expect(ctx.quadraticCurveTo).not.toHaveBeenCalled();
  });

  it('detects hits on single-point dot strokes', () => {
    const dotStroke: BoardStroke = {
      id: 'dot',
      tool: 'pen',
      color: '#000000',
      width: 4,
      points: [{ x: 100, y: 100 }],
    };
    // Close to dot (within radius 20 + width/2 = 22)
    expect(isStrokeNearPoint(dotStroke, 110, 100, 20)).toBe(true);
    // Far from dot
    expect(isStrokeNearPoint(dotStroke, 150, 100, 20)).toBe(false);
  });

  it('detects hits between widely spaced stroke points via line segment projection', () => {
    // Two points spaced 100px apart: (100, 100) -> (200, 100)
    const longSegmentStroke: BoardStroke = {
      id: 'segment',
      tool: 'pen',
      color: '#2563eb',
      width: 2,
      points: [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
    };

    // The midpoint is at (150, 100).
    // An eraser at (150, 108) is 8px away from the segment, but 50px away from both endpoints!
    // The old point-only logic missed this completely:
    expect(isStrokeNearPoint(longSegmentStroke, 150, 108, 10)).toBe(true);

    // Eraser at (150, 130) is 30px away from the segment (radius 10 + 1 = 11) -> miss
    expect(isStrokeNearPoint(longSegmentStroke, 150, 130, 10)).toBe(false);

    // Diagonal segment: (0, 0) -> (100, 100)
    const diagStroke: BoardStroke = {
      id: 'diag',
      tool: 'pen',
      color: '#10b981',
      width: 2,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
    };
    // (50, 50) is on the line
    expect(isStrokeNearPoint(diagStroke, 53, 48, 10)).toBe(true);
    // Far off the diagonal
    expect(isStrokeNearPoint(diagStroke, 10, 80, 10)).toBe(false);
  });

  it('accounts for stroke width when calculating hit tolerance', () => {
    // Thick marker stroke with width = 40 (half-width = 20)
    const thickStroke: BoardStroke = {
      id: 'thick',
      tool: 'highlighter',
      color: '#facc15',
      width: 40,
      points: [
        { x: 50, y: 50 },
        { x: 150, y: 50 },
      ],
    };
    // Eraser radius 10 + half-width 20 = 30px effective radius.
    // Point at y = 75 is 25px away from centerline -> should hit!
    expect(isStrokeNearPoint(thickStroke, 100, 75, 10)).toBe(true);

    // Point at y = 90 is 40px away -> miss
    expect(isStrokeNearPoint(thickStroke, 100, 90, 10)).toBe(false);
  });

  it('fast-rejects points outside the stroke bounding box without segment math', () => {
    const stroke: BoardStroke = {
      id: 'bounded',
      tool: 'pen',
      color: '#000000',
      width: 2,
      points: [
        { x: 10, y: 10 },
        { x: 20, y: 20 },
        { x: 30, y: 10 },
      ],
    };
    // Way outside AABB
    expect(isStrokeNearPoint(stroke, 500, 500, 20)).toBe(false);
    expect(isStrokeNearPoint(stroke, -50, 10, 20)).toBe(false);
  });

  it('handles empty or degenerate strokes safely', () => {
    const emptyStroke: BoardStroke = {
      id: 'empty',
      tool: 'pen',
      color: '#000000',
      width: 2,
      points: [],
    };
    expect(isStrokeNearPoint(emptyStroke, 50, 50, 20)).toBe(false);
  });
});
