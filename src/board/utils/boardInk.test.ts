import { expect, it, vi } from 'vitest';
import { drawBoardInk } from './boardInk';
it('renders snapped rectangles with straight edges in both live and exported ink', () => {
  const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), quadraticCurveTo: vi.fn() } as unknown as CanvasRenderingContext2D;
  drawBoardInk(ctx, [{ id: 'square', tool: 'pen', shape: 'rectangle', width: 4, color: '#e11d48', points: [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }, { x: 10, y: 10 }] }], false);
  expect(ctx.lineTo).toHaveBeenCalledTimes(4);
  expect(ctx.quadraticCurveTo).not.toHaveBeenCalled();
});
