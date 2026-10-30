import { describe, expect, it } from 'vitest';
import { boardAppearance, boardRasterSize } from './boardAppearance';
describe('board appearance and ink resolution', () => {
  it('follows the active theme or keeps an independent solid color', () => {
    expect(boardAppearance('white', 'amoled', true, '#ffffff')).toMatchObject({ color: '#000000', dark: true });
    expect(boardAppearance('white', 'paper', true, '#ffffff')).toMatchObject({ color: '#f4ede1', dark: false });
    expect(boardAppearance('white', 'paper', false, '#000000')).toMatchObject({ color: '#000000', dark: true });
    expect(boardAppearance('white', 'amoled', false, '#ddeeff')).toMatchObject({ color: '#ddeeff', dark: false });
  });
  it('supersamples ordinary screens without exceeding the large-display memory budget', () => {
    expect(boardRasterSize(1920, 1080, 1)).toEqual({ width: 3840, height: 2160 });
    const large = boardRasterSize(7680, 4320, 2);
    expect(large.width * large.height).toBeLessThan(12_010_000);
  });
});
