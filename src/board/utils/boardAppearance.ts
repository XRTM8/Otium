import type { ThemeMode } from '../../core/types';
import type { BoardBackground } from '../types';
import { getThemeBackground } from '../../app/themeBackground';

export function boardAppearance(background: BoardBackground, theme: ThemeMode, followTheme: boolean, color: string) {
  const fill = followTheme ? getThemeBackground(theme) : background === 'dark' ? '#000000' : color;
  const rgb = fill.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(offset => parseInt(rgb.slice(offset, offset + 2), 16) / 255);
  const dark = r * .2126 + g * .7152 + b * .0722 < .45;
  return { color: fill, dark, pattern: dark ? '#ffffff24' : '#00000020' };
}

export function boardRasterSize(width: number, height: number, deviceRatio: number) {
  // Supersampling smooths diagonal ink on ordinary classroom panels, with a
  // bounded backing store on very large displays.
  const ratio = Math.min(Math.max(2, deviceRatio || 1), 3, Math.sqrt(12_000_000 / Math.max(1, width * height)));
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}
