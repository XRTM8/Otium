import { describe, it, expect, vi } from 'vitest';
import { renderBoardPageToContext, type ExportableBoardPage } from './boardExport';

describe('boardExport', () => {
  it('renders strokes without errors on canvas context', () => {
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      fillText: vi.fn()
    } as unknown as CanvasRenderingContext2D;

    const page: ExportableBoardPage = {
      id: 'p1',
      background: 'white',
      strokes: [
        {
          id: 's1',
          tool: 'pen',
          color: '#2563eb',
          width: 4,
          points: [
            { x: 10, y: 10 },
            { x: 20, y: 25 },
            { x: 30, y: 40 }
          ]
        }
      ]
    };

    renderBoardPageToContext(mockCtx, page, 800, 600, []);

    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
    expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
    expect(mockCtx.beginPath).toHaveBeenCalled();
    expect(mockCtx.stroke).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();
  });

  it('renders dark background and grid patterns correctly', () => {
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn()
    } as unknown as CanvasRenderingContext2D;

    const darkPage: ExportableBoardPage = {
      id: 'p2',
      background: 'dark',
      strokes: []
    };

    renderBoardPageToContext(mockCtx, darkPage, 1920, 1080);
    expect(mockCtx.fillStyle).toBe('#000000');
    expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
  });
});
