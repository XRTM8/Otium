import type { ThemeMode } from '../core/types';

/** Shared page background so both shells paint the same reading themes. */
export function getThemeBackground(theme: ThemeMode): string {
  switch (theme) {
    case 'paper':
      return '#f4ede1';
    case 'midnight':
      return '#06090f';
    case 'eink':
      return '#dfdfdf';
    case 'amber':
      return '#14100c';
    case 'amoled':
      return '#000000';
    case 'parchment':
      return '#ede2cd';
    case 'pure':
    default:
      return '#f1f5f9';
  }
}
