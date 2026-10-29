import type { ThemeMode, ViewMode } from '../types';
import type { Language } from '../i18n/translations';

const THEMES: ThemeMode[] = ['paper', 'midnight', 'eink', 'amber', 'pure', 'amoled', 'parchment', 'sakura', 'forest', 'nordic'];
const VIEW_MODES: ViewMode[] = ['continuous', 'single', 'dual'];

export type ThemeScheduleMode = 'manual' | 'system' | 'sunset';

const KEYS = {
  theme: 'otium_theme',
  legacyTheme: 'tirs_theme',
  language: 'otium_lang',
  legacyLanguage: 'tirs_lang',
  viewMode: 'otium_view_mode',
  mobileNav: 'otium_mobile_nav',
  themeSchedule: 'otium_theme_schedule',
  dayTheme: 'otium_day_theme',
  nightTheme: 'otium_night_theme',
  rememberDocTheme: 'otium_remember_doc_theme',
  readingWarmth: 'otium_reading_warmth',
  ultraDim: 'otium_ultra_dim',
  page: (title: string) => `otium_page_${title}`,
  legacyPage: (title: string) => `tirs_page_${title}`,
  docTheme: (docKey: string) => `otium_theme_${docKey}`
};

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    // Storage can be disabled or full. Preferences are best-effort.
  }
}

export function loadTheme(): ThemeMode {
  const saved = read(KEYS.theme) ?? read(KEYS.legacyTheme);
  return THEMES.includes(saved as ThemeMode) ? (saved as ThemeMode) : 'paper';
}

export function saveTheme(theme: ThemeMode): void {
  write(KEYS.theme, theme);
}

export function loadLanguage(): Language {
  const saved = read(KEYS.language) ?? read(KEYS.legacyLanguage);
  return saved === 'en' ? 'en' : 'ar';
}

export function saveLanguage(language: Language): void {
  write(KEYS.language, language);
}

export function loadViewMode(): ViewMode {
  const saved = read(KEYS.viewMode);
  return VIEW_MODES.includes(saved as ViewMode) ? (saved as ViewMode) : 'continuous';
}

export function saveViewMode(mode: ViewMode): void {
  write(KEYS.viewMode, mode);
}

/**
 * The bottom navigation bar is useful for page numbers and quick jumps, but
 * some readers prefer a completely bare page. Default to visible; only an
 * explicit opt-out hides it.
 */
export function loadMobileNavVisible(): boolean {
  return read(KEYS.mobileNav) !== '0';
}

export function saveMobileNavVisible(visible: boolean): void {
  write(KEYS.mobileNav, visible ? '1' : '0');
}

export function loadLastPage(docKey: string, legacyTitle?: string): number {
  const saved =
    read(KEYS.page(docKey)) ??
    (legacyTitle && legacyTitle !== docKey ? read(KEYS.page(legacyTitle)) : null) ??
    read(KEYS.legacyPage(docKey)) ??
    (legacyTitle && legacyTitle !== docKey ? read(KEYS.legacyPage(legacyTitle)) : null);
  const page = saved ? Number.parseInt(saved, 10) : 1;
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function saveLastPage(docKey: string, page: number): void {
  if (!docKey) return;
  write(KEYS.page(docKey), String(page));
}

export function loadScrollOffset(docKey: string): number {
  if (!docKey) return 0;
  const saved = read(`otium_scroll_${docKey}`);
  const ratio = saved ? Number.parseFloat(saved) : 0;
  return Number.isFinite(ratio) && ratio >= 0 && ratio <= 1 ? ratio : 0;
}

export function saveScrollOffset(docKey: string, ratio: number): void {
  if (!docKey) return;
  write(`otium_scroll_${docKey}`, String(Math.max(0, Math.min(1, ratio))));
}

export function loadThemeSchedule(): ThemeScheduleMode {
  const saved = read(KEYS.themeSchedule);
  return saved === 'system' || saved === 'sunset' ? saved : 'manual';
}

export function saveThemeSchedule(mode: ThemeScheduleMode): void {
  write(KEYS.themeSchedule, mode);
}

export function loadDayTheme(): ThemeMode {
  const saved = read(KEYS.dayTheme);
  return THEMES.includes(saved as ThemeMode) ? (saved as ThemeMode) : 'paper';
}

export function saveDayTheme(theme: ThemeMode): void {
  write(KEYS.dayTheme, theme);
}

export function loadNightTheme(): ThemeMode {
  const saved = read(KEYS.nightTheme);
  return THEMES.includes(saved as ThemeMode) ? (saved as ThemeMode) : 'amoled';
}

export function saveNightTheme(theme: ThemeMode): void {
  write(KEYS.nightTheme, theme);
}

export function loadRememberDocTheme(): boolean {
  return read(KEYS.rememberDocTheme) !== '0';
}

export function saveRememberDocTheme(enabled: boolean): void {
  write(KEYS.rememberDocTheme, enabled ? '1' : '0');
}

export function loadDocumentTheme(docKey: string, legacyTitle?: string): ThemeMode | null {
  if (!docKey) return null;
  const saved = read(KEYS.docTheme(docKey)) ?? (legacyTitle ? read(KEYS.docTheme(legacyTitle)) : null);
  return THEMES.includes(saved as ThemeMode) ? (saved as ThemeMode) : null;
}

export function saveDocumentTheme(docKey: string, theme: ThemeMode): void {
  if (!docKey) return;
  write(KEYS.docTheme(docKey), theme);
}

export function loadReadingWarmth(): number {
  const saved = read(KEYS.readingWarmth);
  const num = saved ? Number.parseInt(saved, 10) : 0;
  return Number.isFinite(num) ? Math.max(0, Math.min(100, num)) : 0;
}

export function saveReadingWarmth(warmth: number): void {
  write(KEYS.readingWarmth, String(Math.max(0, Math.min(100, Math.round(warmth)))));
}

export function loadUltraDim(): number {
  const saved = read(KEYS.ultraDim);
  const num = saved ? Number.parseInt(saved, 10) : 0;
  return Number.isFinite(num) ? Math.max(0, Math.min(80, num)) : 0;
}

export function saveUltraDim(dim: number): void {
  write(KEYS.ultraDim, String(Math.max(0, Math.min(80, Math.round(dim)))));
}

export function resolveScheduledTheme(
  schedule: ThemeScheduleMode,
  dayTheme: ThemeMode,
  nightTheme: ThemeMode,
  manualTheme: ThemeMode
): ThemeMode {
  if (schedule === 'system' && typeof window !== 'undefined') {
    const isDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
    return isDark ? nightTheme : dayTheme;
  }
  if (schedule === 'sunset') {
    const hour = new Date().getHours();
    // 7 PM (19:00) to 6:30 AM (hour < 7)
    const isNight = hour >= 19 || hour < 7;
    return isNight ? nightTheme : dayTheme;
  }
  return manualTheme;
}
