import { useEffect } from 'react';
import type { FontFamilyId } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { applyFontFamily } from '../core/settings/fonts';
import { measureRefreshRate } from '../core/reader/device';
import { syncNativeImmersive } from '../platform/ui';
import { stopTts } from '../platform/tts';

interface UseReaderEffectsOptions {
  keyboardCapable: boolean;
  isImmersive: boolean;
  fontFamily: FontFamilyId;
  lang: Language;
  cancelPendingPageSave: () => void;
}

export function useReaderEffects({
  keyboardCapable,
  isImmersive,
  fontFamily,
  lang,
  cancelPendingPageSave,
}: UseReaderEffectsOptions) {
  useEffect(() => {
    measureRefreshRate();
  }, []);

  useEffect(() => {
    syncNativeImmersive(!keyboardCapable || isImmersive);
  }, [isImmersive, keyboardCapable]);

  useEffect(() => {
    return () => {
      syncNativeImmersive(false);
    };
  }, []);

  useEffect(() => {
    applyFontFamily(fontFamily);
  }, [fontFamily]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    return () => {
      stopTts();
      cancelPendingPageSave();
    };
  }, [cancelPendingPageSave]);
}
