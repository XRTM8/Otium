import { useCallback } from 'react';
import type { FontFamilyId, ThemeMode, ViewMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { renameStoredDocument } from '../core/storage/documents';
import { saveFont } from '../core/settings/fonts';
import { saveLanguage, saveMobileNavVisible, type ThemeScheduleMode } from '../core/settings/preferences';

interface UseReaderDocumentActionsParams {
  docId: string;
  setLang: React.Dispatch<React.SetStateAction<Language>>;
  setFontFamily: (font: FontFamilyId) => void;
  setDocTitle: (title: string) => void;
  setSearchQuery: (query: string) => void;
  setActiveSearchPage: (page: number | null) => void;
  setSearchSeed: (seed: { query: string; id: number } | null) => void;
  setIsSearchOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  setShowMobileNavBar: (visible: boolean) => void;
  changeTheme: (theme: ThemeMode) => void;
  changeThemeSchedule: (mode: ThemeScheduleMode) => void;
  changeDayTheme: (theme: ThemeMode) => void;
  changeNightTheme: (theme: ThemeMode) => void;
  changeRememberDocTheme: (remember: boolean) => void;
  changeViewMode: (mode: ViewMode) => void;
}

/** Provides reader document search, preferences reset, font/language toggles, and rename handlers. */
export function useReaderDocumentActions({
  docId,
  setLang,
  setFontFamily,
  setDocTitle,
  setSearchQuery,
  setActiveSearchPage,
  setSearchSeed,
  setIsSearchOpen,
  setShowMobileNavBar,
  changeTheme,
  changeThemeSchedule,
  changeDayTheme,
  changeNightTheme,
  changeRememberDocTheme,
  changeViewMode,
}: UseReaderDocumentActionsParams) {
  const changeLanguage = useCallback(() => {
    setLang((current) => {
      const next = current === 'ar' ? 'en' : 'ar';
      saveLanguage(next);
      return next;
    });
  }, [setLang]);

  const changeFont = useCallback((nextFont: FontFamilyId) => {
    setFontFamily(nextFont);
    saveFont(nextFont);
  }, [setFontFamily]);

  const handleSearchQueryChange = useCallback(
    (query: string, page: number | null) => {
      setSearchQuery(query);
      setActiveSearchPage(page);
    },
    [setActiveSearchPage, setSearchQuery]
  );

  const openSearchWithText = useCallback(
    (text: string) => {
      const query = text.replace(/\s+/g, ' ').trim().slice(0, 96);
      setIsSearchOpen(true);
      setSearchSeed(query ? { query, id: Date.now() } : null);
    },
    [setIsSearchOpen, setSearchSeed]
  );

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setActiveSearchPage(null);
    setSearchSeed(null);
  }, [setActiveSearchPage, setIsSearchOpen, setSearchQuery, setSearchSeed]);

  const changeMobileNavVisibility = useCallback(
    (visible: boolean) => {
      setShowMobileNavBar(visible);
      saveMobileNavVisible(visible);
    },
    [setShowMobileNavBar]
  );

  const resetDefaults = useCallback(() => {
    changeFont('tajawal');
    changeViewMode('continuous');
    changeTheme('paper');
    changeThemeSchedule('manual');
    changeDayTheme('paper');
    changeNightTheme('amoled');
    changeRememberDocTheme(true);
    setShowMobileNavBar(true);
    saveMobileNavVisible(true);
  }, [
    changeDayTheme,
    changeFont,
    changeNightTheme,
    changeRememberDocTheme,
    changeTheme,
    changeThemeSchedule,
    changeViewMode,
    setShowMobileNavBar,
  ]);

  const renameCurrentDocument = useCallback(
    (newTitle: string) => {
      const trimmed = newTitle.trim();
      if (!trimmed) return;
      setDocTitle(trimmed);
      if (docId) {
        void renameStoredDocument(docId, trimmed);
      }
    },
    [docId, setDocTitle]
  );

  return {
    changeLanguage,
    changeFont,
    handleSearchQueryChange,
    openSearchWithText,
    closeSearch,
    changeMobileNavVisibility,
    resetDefaults,
    renameCurrentDocument,
  };
}
