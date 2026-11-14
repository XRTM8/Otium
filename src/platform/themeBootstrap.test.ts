import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { getThemeBackground } from '../app/themeBackground';
import { THEME_ORDER } from '../app/readerControllerHelpers';
import { isLightTheme } from './theme';

const source = readFileSync(new URL('../../public/theme-init.js', import.meta.url), 'utf8');

function bootstrap(preferences: Record<string, string>, dark = false, hour = 12) {
  const root = { classList: { add: vi.fn() }, dataset: {}, style: {} };
  const meta = { setAttribute: vi.fn() };
  const setTheme = vi.fn();
  runInNewContext(source, {
    localStorage: { getItem: (key: string) => preferences[key] ?? null },
    document: { documentElement: root, querySelector: () => meta },
    window: { matchMedia: () => ({ matches: dark }), OtiumTheme: { setTheme } },
    Date: class { getHours() { return hour; } },
  });
  return { root, meta, setTheme };
}

describe('theme before React mounts', () => {
  it.each(THEME_ORDER)('matches the runtime palette for %s', theme => {
    const { root, meta, setTheme } = bootstrap({ otium_theme: theme });
    const background = getThemeBackground(theme);
    const light = isLightTheme(theme);
    expect(root.classList.add).toHaveBeenCalledWith(`theme-${theme}`);
    expect(root.dataset).toEqual({ theme });
    expect(root.style).toEqual({ backgroundColor: background, colorScheme: light ? 'light' : 'dark' });
    expect(meta.setAttribute).toHaveBeenCalledWith('content', background);
    expect(setTheme).toHaveBeenCalledWith(light ? 'light' : 'dark', background, light);
  });

  it('starts with the selected system theme even when the stored manual theme is light', () => {
    const { root } = bootstrap({ otium_theme: 'paper', otium_theme_schedule: 'system', otium_night_theme: 'nordic' }, true);
    expect(root.dataset).toEqual({ theme: 'nordic' });
    expect(root.style).toMatchObject({ colorScheme: 'dark', backgroundColor: '#15181e' });
  });

  it.each([[6, 'amoled'], [7, 'paper'], [18, 'paper'], [19, 'amoled']])(
    'uses the scheduled defaults at hour %i', (hour, theme) => {
      const { root } = bootstrap({ otium_theme: 'forest', otium_theme_schedule: 'sunset' }, false, hour);
      expect(root.dataset).toEqual({ theme });
    },
  );

  it('falls back for inherited property names and honors the legacy key when the primary key is absent', () => {
    expect(bootstrap({ otium_theme: '__proto__', tirs_theme: 'amber' }).root.dataset).toEqual({ theme: 'paper' });
    expect(bootstrap({ tirs_theme: 'amber' }).root.dataset).toEqual({ theme: 'amber' });
  });
});
