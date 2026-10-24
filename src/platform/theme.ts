import type { ThemeMode } from '../core/types';
import { getThemeBackground } from '../app/themeBackground';
import { getPlatformId, isTauriRuntime } from './runtime';

const LIGHT_THEMES: readonly ThemeMode[] = ['paper', 'parchment', 'eink', 'pure'];
const ALL_THEMES: readonly ThemeMode[] = [
  'paper',
  'midnight',
  'amoled',
  'parchment',
  'amber',
  'eink',
  'pure'
];

export function isLightTheme(theme: ThemeMode): boolean {
  return LIGHT_THEMES.includes(theme);
}

/** Paints the document root so portals, dialogs and native bars share a theme. */
export function applyDomTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  for (const candidate of ALL_THEMES) {
    root.classList.toggle(`theme-${candidate}`, candidate === theme);
  }
  root.dataset.theme = theme;

  const background = getThemeBackground(theme);
  const light = isLightTheme(theme);
  root.style.colorScheme = light ? 'light' : 'dark';
  root.style.backgroundColor = background;
  if (document.body) document.body.style.backgroundColor = background;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', background);
}

/**
 * Keeps the native chrome in step with the in-app theme:
 * - Windows: native dark/light title bar and resize background.
 * - Android: status/navigation bar colour plus icon appearance via OtiumTheme.
 */
export function syncNativeTheme(theme: ThemeMode): void {
  applyDomTheme(theme);
  if (!isTauriRuntime()) return;

  const background = getThemeBackground(theme);
  const light = isLightTheme(theme);

  if (getPlatformId() === 'android') {
    try {
      const bridge = (window as unknown as {
        OtiumTheme?: {
          setTheme?: (mode: string, background: string, lightTheme: boolean) => void;
        };
      }).OtiumTheme;
      bridge?.setTheme?.(light ? 'light' : 'dark', background, light);
    } catch {
      // The native bridge is best-effort; the web UI is already themed.
    }
    return;
  }

  void import('@tauri-apps/api/window')
    .then(({ getCurrentWindow }) => {
      const current = getCurrentWindow();
      void current.setTheme(light ? 'light' : 'dark').catch(() => {});
      void current.setBackgroundColor(background).catch(() => {});
    })
    .catch(() => {
      // Browser previews do not expose the Tauri window API.
    });
}
