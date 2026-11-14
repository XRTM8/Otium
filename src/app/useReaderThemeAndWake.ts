import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ThemeMode } from '../core/types';
import { triggerHaptic } from '../core/utils/haptics';
import {
  acquireScreenWakeLock,
  releaseScreenWakeLock,
  setWakeLockEnabled,
} from '../core/utils/wakeLock';
import {
  loadDayTheme,
  loadKeepScreenAwake,
  loadNightTheme,
  loadRememberDocTheme,
  loadTheme,
  loadThemeSchedule,
  resolveScheduledTheme,
  saveDayTheme,
  saveDocumentTheme,
  saveKeepScreenAwake,
  saveNightTheme,
  saveRememberDocTheme,
  saveTheme,
  saveThemeSchedule,
  type ThemeScheduleMode,
} from '../core/settings/preferences';
import { applyDomTheme, applyThemeWithoutTransition, syncNativeTheme } from '../platform/theme';
import { flushSync } from 'react-dom';
import { THEME_ORDER } from './readerControllerHelpers';

interface UseReaderThemeAndWakeOptions {
  doc: PDFDocumentProxy | null;
  docIdRef: React.MutableRefObject<string>;
}

/**
 * Manages active reading theme, per-document theme memory, automatic day/night
 * schedules, native shell color sync, and screen wake lock.
 */
export function useReaderThemeAndWake({ doc, docIdRef }: UseReaderThemeAndWakeOptions) {
  const [themeSchedule, setThemeScheduleState] = useState<ThemeScheduleMode>(loadThemeSchedule);
  const [dayTheme, setDayThemeState] = useState<ThemeMode>(loadDayTheme);
  const [nightTheme, setNightThemeState] = useState<ThemeMode>(loadNightTheme);
  const [rememberDocTheme, setRememberDocThemeState] = useState<boolean>(loadRememberDocTheme);
  const [keepScreenAwake, setKeepScreenAwakeState] = useState<boolean>(loadKeepScreenAwake);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = loadTheme();
    const sched = loadThemeSchedule();
    if (sched !== 'manual') {
      return resolveScheduledTheme(sched, loadDayTheme(), loadNightTheme(), saved);
    }
    return saved;
  });

  const rememberDocThemeRef = useRef(rememberDocTheme);
  const themeScheduleRef = useRef(themeSchedule);
  const dayThemeRef = useRef(dayTheme);
  const nightThemeRef = useRef(nightTheme);

  useLayoutEffect(() => {
    rememberDocThemeRef.current = rememberDocTheme;
    themeScheduleRef.current = themeSchedule;
    dayThemeRef.current = dayTheme;
    nightThemeRef.current = nightTheme;
  }, [rememberDocTheme, themeSchedule, dayTheme, nightTheme]);

  const changeKeepScreenAwake = useCallback(
    (enabled: boolean) => {
      setKeepScreenAwakeState(enabled);
      saveKeepScreenAwake(enabled);
      setWakeLockEnabled(enabled);
      if (enabled && doc) {
        void acquireScreenWakeLock();
      } else {
        void releaseScreenWakeLock();
      }
    },
    [doc]
  );

  useEffect(() => {
    setWakeLockEnabled(keepScreenAwake);
    if (doc && keepScreenAwake) {
      void acquireScreenWakeLock();
    } else {
      void releaseScreenWakeLock();
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && doc && keepScreenAwake) {
        void acquireScreenWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      void releaseScreenWakeLock();
    };
  }, [doc, keepScreenAwake]);

  useEffect(() => {
    syncNativeTheme(theme);
  }, [theme]);

  const changeTheme = useCallback((nextTheme: ThemeMode, persistDocument = true) => {
    if (!THEME_ORDER.includes(nextTheme)) return;
    triggerHaptic('selection');
    saveTheme(nextTheme);
    if (persistDocument && docIdRef.current && rememberDocThemeRef.current) {
      saveDocumentTheme(docIdRef.current, nextTheme);
    }

    applyThemeWithoutTransition(() => {
      applyDomTheme(nextTheme);
      flushSync(() => {
        setTheme(nextTheme);
      });
    });
  }, [docIdRef]);

  const changeThemeSchedule = useCallback(
    (mode: ThemeScheduleMode) => {
      saveThemeSchedule(mode);
      setThemeScheduleState(mode);
      if (mode !== 'manual') {
        const scheduled = resolveScheduledTheme(mode, dayTheme, nightTheme, theme);
        if (scheduled !== theme) {
          changeTheme(scheduled, false);
        }
      }
    },
    [changeTheme, dayTheme, nightTheme, theme]
  );

  const changeDayTheme = useCallback(
    (nextDayTheme: ThemeMode) => {
      saveDayTheme(nextDayTheme);
      setDayThemeState(nextDayTheme);
      if (themeSchedule !== 'manual') {
        const scheduled = resolveScheduledTheme(themeSchedule, nextDayTheme, nightTheme, theme);
        if (scheduled !== theme) {
          changeTheme(scheduled, false);
        }
      }
    },
    [changeTheme, nightTheme, theme, themeSchedule]
  );

  const changeNightTheme = useCallback(
    (nextNightTheme: ThemeMode) => {
      saveNightTheme(nextNightTheme);
      setNightThemeState(nextNightTheme);
      if (themeSchedule !== 'manual') {
        const scheduled = resolveScheduledTheme(themeSchedule, dayTheme, nextNightTheme, theme);
        if (scheduled !== theme) {
          changeTheme(scheduled, false);
        }
      }
    },
    [changeTheme, dayTheme, theme, themeSchedule]
  );

  const changeRememberDocTheme = useCallback((enabled: boolean) => {
    saveRememberDocTheme(enabled);
    setRememberDocThemeState(enabled);
  }, []);

  useEffect(() => {
    if (themeSchedule !== 'system' || typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      const targetTheme = media.matches ? nightTheme : dayTheme;
      changeTheme(targetTheme, false);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [themeSchedule, dayTheme, nightTheme, changeTheme]);

  useEffect(() => {
    if (themeSchedule !== 'sunset' || typeof window === 'undefined') return;
    const checkSunset = () => {
      const scheduled = resolveScheduledTheme('sunset', dayTheme, nightTheme, theme);
      if (scheduled !== theme) {
        changeTheme(scheduled, false);
      }
    };
    checkSunset();
    const interval = window.setInterval(checkSunset, 60_000);
    return () => window.clearInterval(interval);
  }, [themeSchedule, dayTheme, nightTheme, theme, changeTheme]);

  return {
    theme,
    themeSchedule,
    dayTheme,
    nightTheme,
    rememberDocTheme,
    keepScreenAwake,
    rememberDocThemeRef,
    themeScheduleRef,
    dayThemeRef,
    nightThemeRef,
    changeTheme,
    changeThemeSchedule,
    changeDayTheme,
    changeNightTheme,
    changeRememberDocTheme,
    changeKeepScreenAwake,
  };
}
