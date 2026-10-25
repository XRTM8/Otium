import type { ThemeMode, ViewMode } from '../types';
import type { Language } from '../i18n/translations';

const THEMES: ThemeMode[] = ['paper', 'midnight', 'eink', 'amber', 'pure', 'amoled', 'parchment'];
const VIEW_MODES: ViewMode[] = ['continuous', 'single', 'dual'];

const KEYS = {
  theme: 'otium_theme',
  legacyTheme: 'tirs_theme',
  language: 'otium_lang',
  legacyLanguage: 'tirs_lang',
  viewMode: 'otium_view_mode',
  mobileNav: 'otium_mobile_nav',
  page: (title: string) => `otium_page_${title}`,
  legacyPage: (title: string) => `tirs_page_${title}`
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
