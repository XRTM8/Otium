import { describe, expect, it, vi } from 'vitest';
import { simplifyInkWithRust, type RustInkPoint } from '../../platform/rustEngine';
import { isTauriRuntime } from '../../platform/runtime';
import type { BoardStroke } from '../types';
import { prepareExportInk } from './boardExportInk';

vi.mock('../../platform/runtime', () => ({ isTauriRuntime: vi.fn() }));
vi.mock('../../platform/rustEngine', () => ({ simplifyInkWithRust: vi.fn() }));

function stroke(): BoardStroke {
  return {
    id: 'stroke', color: '#111827', tool: 'pen', width: 2,
    points: Array.from({ length: 65 }, (_, x) => ({ x, y: 10, pressure: x / 64 })),
  };
}

function nativePoints(...indices: number[]): RustInkPoint[] {
  return indices.map(x => ({ x, y: 10, pressure: x / 64, timestamp_ms: x }));
}

describe('board export ink', () => {
  it('uses retained indices while preserving the original points and nearby curve controls', async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true);
    vi.mocked(simplifyInkWithRust).mockResolvedValue(nativePoints(0, 32, 64));
    const original = stroke();
    const [result] = await prepareExportInk([original]);
    expect(result?.points).toEqual([0, 1, 31, 32, 33, 63, 64].map(i => original.points[i]));
    expect(original.points).toHaveLength(65);
    expect(simplifyInkWithRust).toHaveBeenCalledWith(
      nativePoints(...Array.from({ length: 65 }, (_, i) => i)), 0.1,
    );
  });

  it('preserves strokes on the web and when the native result is unavailable', async () => {
    const strokes = [stroke()];
    vi.mocked(isTauriRuntime).mockReturnValue(false);
    expect(await prepareExportInk(strokes)).toBe(strokes);
    expect(simplifyInkWithRust).not.toHaveBeenCalled();
    vi.mocked(isTauriRuntime).mockReturnValue(true);
    vi.mocked(simplifyInkWithRust).mockResolvedValue(null);
    expect((await prepareExportInk(strokes))[0]).toBe(strokes[0]);
  });

  it('preserves shape, highlighter, and short strokes', async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true);
    const original = stroke();
    const strokes: BoardStroke[] = [
      { ...original, shape: 'circle' },
      { ...original, tool: 'highlighter' },
      { ...original, points: original.points.slice(0, 3) },
    ];
    expect(await prepareExportInk(strokes)).toEqual(strokes);
    expect(simplifyInkWithRust).not.toHaveBeenCalled();
  });

  it.each([
    { x: 12, y: 10 },
    { x: 32, y: 10.25 },
    { x: 66, y: 10 },
  ])('keeps geometry that the native result would discard (%o)', async point => {
    vi.mocked(isTauriRuntime).mockReturnValue(true);
    vi.mocked(simplifyInkWithRust).mockResolvedValue(nativePoints(0, 64));
    const original = stroke();
    original.points[32] = point;
    expect((await prepareExportInk([original]))[0]).toBe(original);
  });

  it.each([[0, 64, 32], [0, 32], [1, 64], [0, 65]])(
    'rejects invalid native indices (%j, %j, %j)', async (...indices) => {
      vi.mocked(isTauriRuntime).mockReturnValue(true);
      vi.mocked(simplifyInkWithRust).mockResolvedValue(nativePoints(...indices));
      const original = stroke();
      expect((await prepareExportInk([original]))[0]).toBe(original);
    },
  );
});
