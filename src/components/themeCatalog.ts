import type { ThemeMode } from '../core/types';
import type { getTranslations } from '../core/i18n/translations';

export const THEME_DOTS: { id: ThemeMode; dot: string }[] = [
  { id: 'paper', dot: '#d4c5a9' },
  { id: 'amber', dot: '#f59e0b' },
  { id: 'amoled', dot: '#10b981' },
  { id: 'eink', dot: '#9ca3af' },
  { id: 'midnight', dot: '#38bdf8' },
  { id: 'pure', dot: '#ffffff' },
  { id: 'parchment', dot: '#d97706' },
  { id: 'sakura', dot: '#f472b6' },
  { id: 'forest', dot: '#34d399' },
  { id: 'nordic', dot: '#60a5fa' },
];

export function getThemeOptions(
  t: ReturnType<typeof getTranslations>,
): { id: ThemeMode; label: string; dot: string }[] {
  return THEME_DOTS.map((entry) => ({
    id: entry.id,
    label: t.themes[entry.id],
    dot: entry.dot,
  }));
}
