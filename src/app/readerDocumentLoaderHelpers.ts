import type React from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfLoadingTaskHandle } from '../core/pdf/document';
import type { BookmarkItem, TextAnnotation, ThemeMode, ViewMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import type { RecentDocItem } from '../core/storage/documents';
import { getDocumentFromStorage } from '../core/storage/documents';
import {
  loadDocumentTheme,
  loadTheme,
  resolveScheduledTheme,
  type ThemeScheduleMode,
} from '../core/settings/preferences';
import {
  detectIsArabicScript,
  type PasswordModalState,
} from './readerControllerHelpers';

export interface UseReaderDocumentLoaderOptions {
  dragDropEnabled: boolean;
  lang: Language;
  langRef: React.MutableRefObject<Language>;
  viewMode: ViewMode;
  chromeInset: number;
  docRef: React.MutableRefObject<PDFDocumentProxy | null>;
  docIdRef: React.MutableRefObject<string>;
  annotationsGenerationRef: React.MutableRefObject<number>;
  annotationsHydratedRef: React.MutableRefObject<boolean>;
  bookmarksHydratedRef: React.MutableRefObject<boolean>;
  pendingScrollPageRef: React.MutableRefObject<number | null>;
  pendingScrollOffsetRef: React.MutableRefObject<number | null>;
  pageSaveTimerRef: React.MutableRefObject<number | null>;
  currentPageRef: React.MutableRefObject<number>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  lastFitScaleRef: React.MutableRefObject<number>;
  rememberDocThemeRef: React.MutableRefObject<boolean>;
  themeScheduleRef: React.MutableRefObject<ThemeScheduleMode>;
  dayThemeRef: React.MutableRefObject<ThemeMode>;
  nightThemeRef: React.MutableRefObject<ThemeMode>;
  passwordModal: PasswordModalState;
  setPasswordModal: React.Dispatch<React.SetStateAction<PasswordModalState>>;
  setDoc: React.Dispatch<React.SetStateAction<PDFDocumentProxy | null>>;
  setDocTitle: React.Dispatch<React.SetStateAction<string>>;
  setDocId: React.Dispatch<React.SetStateAction<string>>;
  setNumPages: React.Dispatch<React.SetStateAction<number>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  setAnnotations: React.Dispatch<React.SetStateAction<TextAnnotation[]>>;
  setBookmarks: React.Dispatch<React.SetStateAction<BookmarkItem[]>>;
  setBasePageSize: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
  setBaseAspectRatio: React.Dispatch<React.SetStateAction<number>>;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setActiveSearchPage: React.Dispatch<React.SetStateAction<number | null>>;
  setSearchSeed: React.Dispatch<React.SetStateAction<{ query: string; id: number } | null>>;
  setIsSearchOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  setIsSidebarOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  setIsSettingsOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  setIsImmersive: React.Dispatch<React.SetStateAction<boolean>>;
  setDocumentError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setLoadProgress: React.Dispatch<React.SetStateAction<number | null>>;
  setDetectedDocIsRtl: React.Dispatch<React.SetStateAction<boolean>>;
  setFitScaleState: React.Dispatch<React.SetStateAction<number>>;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  setFileSizeBytes: React.Dispatch<React.SetStateAction<number>>;
  changeTheme: (nextTheme: ThemeMode, persistDocument?: boolean) => void;
}

export function destroyPdfTaskQuietly(
  task: PdfLoadingTaskHandle | null | undefined,
  context: string
): void {
  if (!task) return;
  task.destroy().then(undefined, (err: unknown) => {
    console.debug(context, err);
  });
}

export async function detectDocumentArabicScript(
  doc: PDFDocumentProxy,
  isCurrent: () => boolean
): Promise<boolean | null> {
  let pageText = '';
  try {
    for (let page = 1; page <= Math.min(3, doc.numPages); page++) {
      if (!isCurrent()) return null;
      const pdfPage = await doc.getPage(page);
      const textContent = await pdfPage.getTextContent();
      pageText +=
        ' ' +
        textContent.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .slice(0, 6000);
    }
  } catch (err) {
    console.debug('[useReaderDocumentLoader] Image-only or unreadable text layer, defaulting RTL check:', err);
  }
  return isCurrent() ? detectIsArabicScript(pageText) : null;
}

export function resolveInitialPageNumber(
  startPage: number | undefined,
  savedPage: number,
  numPages: number
): number {
  const requestedPage =
    typeof startPage === 'number' && Number.isFinite(startPage) ? Math.round(startPage) : 0;
  if (requestedPage > 0 && requestedPage <= numPages) return requestedPage;
  if (savedPage > 0 && savedPage <= numPages) return savedPage;
  return 1;
}

export function applyInitialDocumentTheme(args: {
  rememberDocTheme: boolean;
  documentId: string;
  title: string;
  themeSchedule: ThemeScheduleMode;
  dayTheme: ThemeMode;
  nightTheme: ThemeMode;
  changeTheme: (nextTheme: ThemeMode, persistDocument?: boolean) => void;
}): void {
  if (!args.rememberDocTheme) return;
  const savedDocTheme = loadDocumentTheme(args.documentId, args.title);
  if (savedDocTheme) {
    args.changeTheme(savedDocTheme, false);
  } else if (args.themeSchedule !== 'manual') {
    const scheduled = resolveScheduledTheme(
      args.themeSchedule,
      args.dayTheme,
      args.nightTheme,
      loadTheme()
    );
    args.changeTheme(scheduled, false);
  }
}

export async function readRecentDocumentBytes(
  recent: RecentDocItem,
  lang: Language
): Promise<{ ok: true; data: ArrayBuffer } | { ok: false; error: string }> {
  if (!recent.available) {
    return {
      ok: false,
      error:
        lang === 'ar'
          ? 'هذا المستند في مكتبتك لكن ملفه غير موجود على هذا الجهاز. أعد فتح ملف الـ PDF لاستعادته.'
          : 'This book is in your library but its PDF is not on this device. Open the PDF file again to restore it.',
    };
  }
  let data: ArrayBuffer | null;
  try {
    data = await getDocumentFromStorage(recent.id);
  } catch (err) {
    console.warn('[useReaderDocumentLoader] Failed reading recent doc from IndexedDB:', err);
    return {
      ok: false,
      error:
        lang === 'ar'
          ? 'تعذر قراءة المستند المحفوظ. حاول مجدداً أو أعد استيراد الملف.'
          : 'Could not read the saved document. Try again or import the file again.',
    };
  }
  if (!data) {
    return {
      ok: false,
      error:
        lang === 'ar'
          ? 'هذا المستند لم يعد محفوظاً على هذا الجهاز.'
          : 'This document is no longer stored on this device.',
    };
  }
  return { ok: true, data };
}
