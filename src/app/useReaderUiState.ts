import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { FontFamilyId, ReadingDirection, ViewMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { getSavedFont } from '../core/settings/fonts';
import {
  loadLanguage,
  loadMobileNavVisible,
  loadReadingDirection,
  loadViewMode,
  saveReadingDirection,
} from '../core/settings/preferences';
import { EMPTY_PASSWORD_MODAL, type PasswordModalState } from './readerControllerHelpers';

function useOverlayFlag(onOpen: () => void) {
  const [value, setRaw] = useState(false);
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  }, [value]);
  const setValue = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const resolved = typeof next === 'function' ? next(ref.current) : next;
      setRaw(resolved);
      if (resolved) onOpen();
    },
    [onOpen]
  );
  return [value, setValue] as const;
}

export function useReaderUiState() {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [docTitle, setDocTitle] = useState('');
  /** SHA-256 content identity used for every persisted reading record. */
  const [docId, setDocId] = useState('');
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const [dualFlipKey, setDualFlipKey] = useState(0);
  const [dualFlipDir, setDualFlipDir] = useState<'forward' | 'backward'>('forward');
  const [arrivalGlowKey, setArrivalGlowKey] = useState<number>(0);
  const [baseAspectRatio, setBaseAspectRatio] = useState(595 / 842);
  const [basePageSize, setBasePageSize] = useState({ width: 595, height: 842 });
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [lang, setLang] = useState<Language>(loadLanguage);
  const langRef = useRef(lang);
  useLayoutEffect(() => {
    langRef.current = lang;
  }, [lang]);

  const [fontFamily, setFontFamily] = useState<FontFamilyId>(getSavedFont);
  const [showMobileNavBar, setShowMobileNavBar] = useState<boolean>(loadMobileNavVisible);
  const [isImmersive, setIsImmersive] = useState(false);
  const [readingDirection, setReadingDirection] = useState<ReadingDirection>(loadReadingDirection);
  const [detectedDocIsRtl, setDetectedDocIsRtl] = useState<boolean>(false);
  const docIsRtl = readingDirection === 'rtl' ? true : readingDirection === 'ltr' ? false : detectedDocIsRtl;

  const changeReadingDirection = useCallback((dir: ReadingDirection) => {
    setReadingDirection(dir);
    saveReadingDirection(dir);
  }, []);

  const exitImmersive = useCallback(() => setIsImmersive(false), []);
  const [isSidebarOpen, setIsSidebarOpen] = useOverlayFlag(exitImmersive);
  const [isSearchOpen, setIsSearchOpen] = useOverlayFlag(exitImmersive);
  const [isSettingsOpen, setIsSettingsOpen] = useOverlayFlag(exitImmersive);
  const [isLoading, setIsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState<number | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchPage, setActiveSearchPage] = useState<number | null>(null);
  const [searchSeed, setSearchSeed] = useState<{ query: string; id: number } | null>(null);
  const [passwordModal, setPasswordModal] = useState<PasswordModalState>(EMPTY_PASSWORD_MODAL);
  const [fileSizeBytes, setFileSizeBytes] = useState<number>(0);

  const docRef = useRef<PDFDocumentProxy | null>(null);
  const docIdRef = useRef('');
  const pendingScrollPageRef = useRef<number | null>(null);
  const pendingScrollOffsetRef = useRef<number | null>(null);
  const pageSaveTimerRef = useRef<number | null>(null);
  const lastSavedPageRef = useRef<{ title: string; page: number } | null>(null);
  const currentPageRef = useRef(currentPage);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  return {
    doc,
    setDoc,
    docRef,
    docTitle,
    setDocTitle,
    docId,
    setDocId,
    docIdRef,
    numPages,
    setNumPages,
    currentPage,
    setCurrentPage,
    currentPageRef,
    pendingScrollPageRef,
    pendingScrollOffsetRef,
    pageSaveTimerRef,
    lastSavedPageRef,
    dualFlipKey,
    setDualFlipKey,
    dualFlipDir,
    setDualFlipDir,
    arrivalGlowKey,
    setArrivalGlowKey,
    baseAspectRatio,
    setBaseAspectRatio,
    basePageSize,
    setBasePageSize,
    viewMode,
    setViewMode,
    lang,
    setLang,
    langRef,
    fontFamily,
    setFontFamily,
    showMobileNavBar,
    setShowMobileNavBar,
    isImmersive,
    setIsImmersive,
    readingDirection,
    changeReadingDirection,
    detectedDocIsRtl,
    setDetectedDocIsRtl,
    docIsRtl,
    isSidebarOpen,
    setIsSidebarOpen,
    isSearchOpen,
    setIsSearchOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    isLoading,
    setIsLoading,
    loadProgress,
    setLoadProgress,
    documentError,
    setDocumentError,
    searchQuery,
    setSearchQuery,
    activeSearchPage,
    setActiveSearchPage,
    searchSeed,
    setSearchSeed,
    passwordModal,
    setPasswordModal,
    fileSizeBytes,
    setFileSizeBytes,
  };
}
