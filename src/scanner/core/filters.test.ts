import { describe, expect, it, vi } from 'vitest';
import { applyFilterAsync } from './filters';

describe('document filters engine', () => {
  it('original filter returns canvas unchanged without DOM manipulation', async () => {
    const mockCanvas = { width: 100, height: 100 } as HTMLCanvasElement;
    const result = await applyFilterAsync(mockCanvas, 'original');
    expect(result).toBe(mockCanvas);
  });

  it('safely catches error and returns source canvas when canvas context fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mockCanvas = { width: 100, height: 100 } as HTMLCanvasElement;
    // Under headless node environment without document.createElement, applyFilter catches error and returns sourceCanvas
    const result = await applyFilterAsync(mockCanvas, 'magic');
    expect(result).toBe(mockCanvas);
    warnSpy.mockRestore();
  });

  it('safely handles all filter presets under headless node fallback without crashing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mockCanvas = { width: 100, height: 100 } as HTMLCanvasElement;
    const presets = ['clean', 'vibrant', 'bw', 'grayscale', 'vintage'] as const;
    for (const preset of presets) {
      const result = await applyFilterAsync(mockCanvas, preset);
      expect(result).toBe(mockCanvas);
    }
    warnSpy.mockRestore();
  });
});
