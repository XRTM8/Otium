import { describe, expect, it, beforeEach } from 'vitest';
import {
  loadTheme,
  saveTheme,
  loadDocumentTheme,
  saveDocumentTheme,
  loadThemeSchedule,
  saveThemeSchedule,
  loadDayTheme,
  saveDayTheme,
  loadNightTheme,
  saveNightTheme,
  loadRememberDocTheme,
  saveRememberDocTheme,
  loadReadingWarmth,
  saveReadingWarmth,
  loadUltraDim,
  saveUltraDim,
  resolveScheduledTheme
} from './preferences';

describe('Theme preferences & visual comfort', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('supports saving and loading new signature themes (forest, nordic)', () => {
    saveTheme('forest');
    expect(loadTheme()).toBe('forest');

    saveTheme('nordic');
    expect(loadTheme()).toBe('nordic');
  });

  it('persists and retrieves per-document theme overrides', () => {
    expect(loadDocumentTheme('doc-123')).toBeNull();

    saveDocumentTheme('doc-123', 'forest');
    expect(loadDocumentTheme('doc-123')).toBe('forest');

    saveDocumentTheme('doc-456', 'nordic');
    expect(loadDocumentTheme('doc-456')).toBe('nordic');
    expect(loadDocumentTheme('doc-123')).toBe('forest');
  });

  it('resolves scheduled theme correctly for manual, system, and sunset modes', () => {
    expect(resolveScheduledTheme('manual', 'paper', 'amoled', 'sakura')).toBe('sakura');

    // System mode falls back safely
    const sysResolved = resolveScheduledTheme('system', 'paper', 'midnight', 'pure');
    expect(['paper', 'midnight']).toContain(sysResolved);

    // Sunset mode returns night theme during evening/night or day theme in daytime
    const sunsetResolved = resolveScheduledTheme('sunset', 'paper', 'forest', 'pure');
    expect(['paper', 'forest']).toContain(sunsetResolved);
  });

  it('manages reading warmth and ultra-dim within clamped boundaries', () => {
    expect(loadReadingWarmth()).toBe(0);
    saveReadingWarmth(35);
    expect(loadReadingWarmth()).toBe(35);
    saveReadingWarmth(150); // clamped to 100
    expect(loadReadingWarmth()).toBe(100);

    expect(loadUltraDim()).toBe(0);
    saveUltraDim(50);
    expect(loadUltraDim()).toBe(50);
    saveUltraDim(999); // clamped to 80
    expect(loadUltraDim()).toBe(80);
  });

  it('saves and loads theme schedule settings', () => {
    expect(loadThemeSchedule()).toBe('manual');
    saveThemeSchedule('sunset');
    expect(loadThemeSchedule()).toBe('sunset');

    expect(loadDayTheme()).toBe('paper');
    saveDayTheme('pure');
    expect(loadDayTheme()).toBe('pure');

    expect(loadNightTheme()).toBe('amoled');
    saveNightTheme('nordic');
    expect(loadNightTheme()).toBe('nordic');

    expect(loadRememberDocTheme()).toBe(true);
    saveRememberDocTheme(false);
    expect(loadRememberDocTheme()).toBe(false);
  });
});
