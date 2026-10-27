import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';
import type { TouchEvent as ReactTouchEvent } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import type {
  BookmarkItem,
  FontFamilyId,
  TextAnnotation,
  ThemeMode,
  ViewMode
} from '../core/types';
import type { Language } from '../core/i18n/translations';
import type { RecentDocItem } from '../core/storage/documents';
import { openPdf } from '../core/pdf/document';
import {
  adoptLegacyDocumentRecord,
  getDocumentFromStorage,
  saveDocumentToStorage,
  updateDocumentPage
} from '../core/storage/documents';
import { fingerprintDocument } from '../core/storage/documentIdentity';
import { applyBackupJson, createBackupJson } from '../core/storage/backupService';
import { mergeAnnotations, type RestoreSummary } from '../core/storage/backupFormat';
import { mergeBookmarks } from '../core/storage/bookmarks';
import { saveTextFile, type SaveTextOutcome } from '../platform/saveFile';
import { loadStoredAnnotations, saveStoredAnnotations } from '../core/storage/annotations';
import { getStoredBookmarks, saveStoredBookmarks } from '../core/storage/bookmarks';
import { applyFontFamily, getSavedFont, saveFont } from '../core/settings/fonts';
import {
  loadLanguage,
  loadLastPage,
  loadMobileNavVisible,
  loadTheme,
  loadViewMode,
  saveLanguage,
  saveLastPage,
  saveMobileNavVisible,
  saveTheme,
  saveViewMode
} from '../core/settings/preferences';
import { computeOptimalPageScale, measureRefreshRate } from '../core/reader/device';
import { clearSearchTextCache } from '../core/search/documentSearch';
import { registerIncomingDocumentHandler } from '../platform/incomingDocument';
import { syncNativeTheme } from '../platform/theme';
import { syncNativeImmersive } from '../platform/ui';
import { stopTts } from '../platform/tts';

export interface ReaderCapabilities {
  keyboard: boolean;
  dragDrop: boolean;
}

interface PasswordModalState {
  isOpen: boolean;
  isIncorrect: boolean;
  callback: ((password: string) => void) | null;
  title: string;
}

const EMPTY_PASSWORD_MODAL: PasswordModalState = {
  isOpen: false,
  isIncorrect: false,
  callback: null,
  title: ''
};

const THEME_ORDER: ThemeMode[] = [
  'paper',
  'midnight',
  'amoled',
  'parchment',
  'amber',
  'eink',
  'pure'
];

const SAMPLE_DOCUMENT_NAME = 'The Art of Vibe Reading.pdf';

/**
 * Page-turn physics. A wheel gesture or a swipe must travel this far before it
 * flips a page, and a short cooldown prevents trackpads from tumbling through
 * several pages when one gesture ends.
 */
const WHEEL_TURN_THRESHOLD = 96;
const WHEEL_TURN_COOLDOWN_MS = 320;
const TOUCH_SWIPE_TURN_THRESHOLD = 46;
const TOUCH_VERTICAL_TURN_THRESHOLD = 64;
const DOUBLE_TAP_MS = 320;
const ZOOM_ANIMATION_MS = 260;

interface ZoomAnchor {
  element: HTMLElement;
  fractionX: number;
  fractionY: number;
}

function destroyDocumentSoon(doc: PDFDocumentProxy | null): void {
  if (!doc) return;
  window.setTimeout(() => {
    void doc.loadingTask.destroy().catch(() => {});
  }, 250);
}

function describeDocumentError(error: unknown, lang?: Language): string {
  const ar = lang === 'ar';
  if (error instanceof Error) {
    if (error.name === 'InvalidPDFException') {
      return ar ? 'هذا الملف ليس مستند PDF صالحاً.' : 'This file is not a valid PDF document.';
    }
    if (error.name === 'PasswordException') {
      return ar ? 'هذا المستند محمي بكلمة مرور.' : 'This document is password protected.';
    }
    if (error.name === 'MissingPDFException') {
      return ar ? 'تعذر العثور على الملف المحدد.' : 'The selected file could not be found.';
    }
    return error.message || (ar ? 'تعذر فتح هذا المستند.' : 'Could not open this document.');
  }
  return ar ? 'تعذر فتح هذا المستند.' : 'Could not open this document.';
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'button, a, input, textarea, select, [role="button"], [contenteditable="true"]'
    )
  );
}

export function useReaderController(capabilities: ReaderCapabilities) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [docTitle, setDocTitle] = useState('');
  /** SHA-256 content identity used for every persisted reading record. */
  const [docId, setDocId] = useState('');
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.15);
  const [, startZoomTransition] = useTransition();

  const [dualFlipKey, setDualFlipKey] = useState(0);
  const [dualFlipDir, setDualFlipDir] = useState<'forward' | 'backward'>('forward');
  const [theme, setTheme] = useState<ThemeMode>(loadTheme);
  const [baseAspectRatio, setBaseAspectRatio] = useState(0.707);
  const [basePageSize, setBasePageSize] = useState({ width: 595, height: 842 });
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [lang, setLang] = useState<Language>(loadLanguage);
  const [fontFamily, setFontFamily] = useState<FontFamilyId>(getSavedFont);
  const [showMobileNavBar, setShowMobileNavBar] = useState<boolean>(loadMobileNavVisible);
  const [isImmersive, setIsImmersive] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState<number | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchPage, setActiveSearchPage] = useState<number | null>(null);
  const [annotations, setAnnotations] = useState<TextAnnotation[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [passwordModal, setPasswordModal] =
    useState<PasswordModalState>(EMPTY_PASSWORD_MODAL);

  const [isDraggingTouch, setIsDraggingTouch] = useState(false);
  const [searchSeed, setSearchSeed] = useState<{ query: string; id: number } | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartTimeRef = useRef(0);
  const touchDeltaXRef = useRef(0);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(1);
  const isPinchingRef = useRef(false);
  const zoomAnchorRef = useRef<ZoomAnchor | null>(null);
  const zoomFocusRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const singleTapTimerRef = useRef<number | null>(null);
  const selectionAtTouchStartRef = useRef(false);
  const swipeFrameRef = useRef<number | null>(null);
  const pendingSwipeXRef = useRef(0);

  /**
   * Touch pans update a CSS variable instead of React state. A page swipe can
   * fire 60-120 move events per second; re-rendering the whole reading surface
   * for each one is what made the flagship phone feel choppy.
   */
  const applySwipeOffset = useCallback((value: number) => {
    pendingSwipeXRef.current = value;
    if (swipeFrameRef.current !== null) return;
    swipeFrameRef.current = window.requestAnimationFrame(() => {
      swipeFrameRef.current = null;
      scrollContainerRef.current?.style.setProperty(
        '--otium-swipe-x',
        `${pendingSwipeXRef.current}px`
      );
    });
  }, []);

  const resetSwipeOffset = useCallback(() => {
    pendingSwipeXRef.current = 0;
    if (swipeFrameRef.current !== null) {
      window.cancelAnimationFrame(swipeFrameRef.current);
      swipeFrameRef.current = null;
    }
    scrollContainerRef.current?.style.setProperty('--otium-swipe-x', '0px');
  }, []);

  const cancelPendingSingleTap = useCallback(() => {
    if (singleTapTimerRef.current === null) return;
    window.clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = null;
  }, []);

  useEffect(() => {
    syncNativeImmersive(isImmersive);
  }, [isImmersive]);

  useEffect(() => {
    return () => {
      cancelPendingSingleTap();
      syncNativeImmersive(false);
    };
  }, [cancelPendingSingleTap]);

  // Any overlay must bring the chrome back so its own controls stay reachable.
  useEffect(() => {
    if (isImmersive && (isSidebarOpen || isSearchOpen || isSettingsOpen)) {
      setIsImmersive(false);
    }
  }, [isImmersive, isSearchOpen, isSettingsOpen, isSidebarOpen]);

  useEffect(() => {
    return () => {
      if (swipeFrameRef.current !== null) {
        window.cancelAnimationFrame(swipeFrameRef.current);
        swipeFrameRef.current = null;
      }
    };
  }, []);

  const docRef = useRef<PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const loadGenerationRef = useRef(0);
  const annotationsGenerationRef = useRef(0);
  const annotationsHydratedRef = useRef(false);
  const bookmarksHydratedRef = useRef(false);
  const docIdRef = useRef('');
  const pendingScrollPageRef = useRef<number | null>(null);
  const lastWheelTimeRef = useRef(0);
  const wheelAccumRef = useRef(0);
  const wheelDirectionRef = useRef(0);
  const wheelIdleTimerRef = useRef<number | null>(null);
  const lastFitScaleRef = useRef(0);
  const pageSaveTimerRef = useRef<number | null>(null);
  const lastSavedPageRef = useRef<{ title: string; page: number } | null>(null);
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  useEffect(() => {
    measureRefreshRate();
  }, []);

  // Android chrome floats above the reader: the top bar and the bottom nav
  // cover part of the scroll area, so paged fit calculations reserve for them.
  const chromeInset = capabilities.keyboard ? 0 : 96;

  const getFitScale = useCallback(() => {
    if (!basePageSize.width || !basePageSize.height || typeof window === 'undefined') {
      return 1.15;
    }
    return computeOptimalPageScale(
      basePageSize.width,
      basePageSize.height,
      window.innerWidth,
      window.innerHeight - chromeInset,
      viewMode
    );
  }, [basePageSize, chromeInset, viewMode]);

  const cachedScrollMetricsRef = useRef<{
    maxScrollX: number;
    maxScrollY: number;
    isOverflowingX: boolean;
    isOverflowingY: boolean;
  }>({
    maxScrollX: 0,
    maxScrollY: 0,
    isOverflowingX: false,
    isOverflowingY: false
  });

  const canScrollVertically = useCallback(
    (direction: number) => {
      const container = scrollContainerRef.current;
      if (!container) return false;

      const metrics = cachedScrollMetricsRef.current;
      if (viewMode !== 'continuous' && !metrics.isOverflowingY) {
        return false;
      }

      if (metrics.maxScrollY <= 2) return false;
      return direction > 0 ? container.scrollTop < metrics.maxScrollY - 1 : container.scrollTop > 1;
    },
    [viewMode]
  );

  const canScrollHorizontally = useCallback(
    (direction: number) => {
      const container = scrollContainerRef.current;
      if (!container) return false;

      const metrics = cachedScrollMetricsRef.current;
      if (viewMode !== 'continuous' && !metrics.isOverflowingX) {
        return false;
      }

      if (metrics.maxScrollX <= 2) return false;
      return direction > 0 ? container.scrollLeft < metrics.maxScrollX - 1 : container.scrollLeft > 1;
    },
    [viewMode]
  );

  const resetPageGesture = useCallback(() => {
    resetSwipeOffset();
    touchDeltaXRef.current = 0;
  }, [resetSwipeOffset]);

  /** Remembers which point of which page sits under the user's fingers. */
  const captureZoomAnchor = useCallback((clientX: number, clientY: number) => {
    const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const page = target?.closest<HTMLElement>('[data-pdf-page]');
    if (!page) {
      zoomAnchorRef.current = null;
      zoomFocusRef.current = null;
      return;
    }
    const rect = page.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      zoomAnchorRef.current = null;
      zoomFocusRef.current = null;
      return;
    }
    zoomAnchorRef.current = {
      element: page,
      fractionX: (clientX - rect.left) / rect.width,
      fractionY: (clientY - rect.top) / rect.height
    };
    zoomFocusRef.current = { x: clientX, y: clientY };
  }, []);

  const clearZoomAnchor = useCallback(() => {
    zoomAnchorRef.current = null;
    zoomFocusRef.current = null;
  }, []);

  // Zooming changes page geometry. Keep the anchored page point under the
  // gesture focus so pinch and double-tap feel spatial instead of jumping.
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    const focus = zoomFocusRef.current;
    const container = scrollContainerRef.current;
    if (!anchor || !focus || !container || !anchor.element.isConnected) return;

    const rect = anchor.element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const targetX = rect.left + anchor.fractionX * rect.width;
    const targetY = rect.top + anchor.fractionY * rect.height;
    const deltaX = targetX - focus.x;
    const deltaY = targetY - focus.y;

    if (Math.abs(deltaX) > 1) container.scrollLeft += deltaX;
    if (Math.abs(deltaY) > 1) container.scrollTop += deltaY;
  }, [zoom]);

  useEffect(() => {
    applyFontFamily(fontFamily);
  }, [fontFamily]);

  // Reading direction follows the content language. Chrome may pin itself to
  // LTR, but the document root always mirrors the language for dialogs,
  // typography and text alignment.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  // Recolour every surface and tell the native shell to match.
  useEffect(() => {
    syncNativeTheme(theme);
  }, [theme]);

  // Annotation writes are debounced and persisted off the interaction path;
  // highlighting never waits for IndexedDB or blocks the canvas.
  useEffect(() => {
    if (!docId || !annotationsHydratedRef.current) return;
    const timer = window.setTimeout(() => {
      void saveStoredAnnotations(docId, annotations);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [annotations, docId]);

  useEffect(() => {
    if (!docId || !bookmarksHydratedRef.current) return;
    saveStoredBookmarks(docId, bookmarks);
  }, [bookmarks, docId]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    return () => {
      stopTts();
      if (pageSaveTimerRef.current !== null) {
        window.clearTimeout(pageSaveTimerRef.current);
      }
      if (wheelIdleTimerRef.current !== null) {
        window.clearTimeout(wheelIdleTimerRef.current);
      }
      if (loadingTaskRef.current) {
        void loadingTaskRef.current.destroy().catch(() => {});
      }
      if (docRef.current) {
        void docRef.current.loadingTask.destroy().catch(() => {});
      }
    };
  }, []);

  const scrollToRenderedPage = useCallback((pageNumber: number) => {
    const target = document.getElementById(`pdf-page-${pageNumber}`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const persistVisiblePage = useCallback((documentId: string, pageNumber: number) => {
    saveLastPage(documentId, pageNumber);
    if (
      lastSavedPageRef.current?.title === documentId &&
      lastSavedPageRef.current.page === pageNumber
    ) {
      return;
    }
    lastSavedPageRef.current = { title: documentId, page: pageNumber };
    if (pageSaveTimerRef.current !== null) {
      window.clearTimeout(pageSaveTimerRef.current);
    }
    pageSaveTimerRef.current = window.setTimeout(() => {
      pageSaveTimerRef.current = null;
      void updateDocumentPage(documentId, pageNumber);
    }, 600);
  }, []);

  const scrollToPage = useCallback(
    (pageNumber: number) => {
      const nextPage = Math.min(Math.max(1, pageNumber), Math.max(1, numPages));
      if (nextPage !== currentPage) {
        setDualFlipDir(nextPage > currentPage ? 'forward' : 'backward');
        setDualFlipKey((key) => key + 1);
      }
      setCurrentPage(nextPage);

      if (docId) {
        persistVisiblePage(docId, nextPage);
      }

      if (viewMode === 'continuous') {
        pendingScrollPageRef.current = nextPage;
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            if (pendingScrollPageRef.current === nextPage) {
              pendingScrollPageRef.current = null;
              scrollToRenderedPage(nextPage);
            }
          });
        });
      }
    },
    [currentPage, docId, numPages, persistVisiblePage, scrollToRenderedPage, viewMode]
  );

  useEffect(() => {
    if (viewMode !== 'continuous' || pendingScrollPageRef.current === null) return;
    const pageNumber = pendingScrollPageRef.current;
    pendingScrollPageRef.current = null;
    scrollToRenderedPage(pageNumber);
  }, [currentPage, doc, viewMode, scrollToRenderedPage]);

  // Single and dual pages are separate viewports: a new page starts at the
  // top, never wherever the previous page happened to be scrolled.
  useEffect(() => {
    if (viewMode === 'continuous') return;
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTop = 0;
    container.scrollLeft = 0;
    wheelAccumRef.current = 0;
    wheelDirectionRef.current = 0;
    resetPageGesture();
  }, [currentPage, viewMode, resetPageGesture]);

  const handlePageVisible = useCallback(
    (pageNumber: number) => {
      setCurrentPage((current) => (current === pageNumber ? current : pageNumber));
      if (docId) {
        persistVisiblePage(docId, pageNumber);
      }
    },
    [docId, persistVisiblePage]
  );

  const goToNextPage = useCallback(() => {
    if (viewMode === 'dual') {
      if (currentPage + 2 <= numPages) {
        scrollToPage(currentPage + 2);
      } else if (currentPage + 1 <= numPages) {
        scrollToPage(currentPage + 1);
      }
    } else if (currentPage < numPages) {
      scrollToPage(currentPage + 1);
    }
  }, [currentPage, numPages, scrollToPage, viewMode]);

  const goToPrevPage = useCallback(() => {
    if (viewMode === 'dual') {
      scrollToPage(Math.max(1, currentPage - 2));
    } else if (currentPage > 1) {
      scrollToPage(currentPage - 1);
    }
  }, [currentPage, scrollToPage, viewMode]);

  const changeTheme = useCallback((nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    saveTheme(nextTheme);
  }, []);

  const changeLanguage = useCallback(() => {
    setLang((current) => {
      const next = current === 'ar' ? 'en' : 'ar';
      saveLanguage(next);
      return next;
    });
  }, []);

  const changeFont = useCallback((nextFont: FontFamilyId) => {
    setFontFamily(nextFont);
    saveFont(nextFont);
  }, []);

  const changeViewMode = useCallback(
    (nextMode: ViewMode) => {
      // Continuous has no page viewport of its own, so remember which page the
      // reader was on and scroll to it once the new layout has mounted.
      if (nextMode === 'continuous' && currentPage > 1) {
        pendingScrollPageRef.current = currentPage;
      }
      setViewMode(nextMode);
      saveViewMode(nextMode);
      if (basePageSize.width && basePageSize.height && typeof window !== 'undefined') {
        const fit = computeOptimalPageScale(
          basePageSize.width,
          basePageSize.height,
          window.innerWidth,
          window.innerHeight - chromeInset,
          nextMode
        );
        lastFitScaleRef.current = fit;
        setZoom(fit);
      }
    },
    [basePageSize, chromeInset, currentPage]
  );

  // Orientation changes and window resizes keep a fit-to-page zoom, but never
  // throw away a manual zoom the reader chose.
  useEffect(() => {
    let timer: number | null = null;
    let stabilizeTimer: number | null = null;

    const rescale = () => {
      if (typeof window === 'undefined') return;
      if (window.innerWidth <= 0 || window.innerHeight <= 0) return;
      if (!doc || !basePageSize.width || !basePageSize.height) return;

      const fit = computeOptimalPageScale(
        basePageSize.width,
        basePageSize.height,
        window.innerWidth,
        window.innerHeight - chromeInset,
        viewMode
      );
      const previousFit = lastFitScaleRef.current;
      lastFitScaleRef.current = fit;
      setZoom((current) =>
        current <= (previousFit || fit) * 1.08
          ? fit
          : Math.min(3.5, Math.max(0.5, current))
      );
    };

    const handleResizeOrOrientation = () => {
      if (timer !== null) window.clearTimeout(timer);
      if (stabilizeTimer !== null) window.clearTimeout(stabilizeTimer);
      timer = window.setTimeout(rescale, 80);
      // Android WebView orientation changes take up to ~300ms to complete layout reflow
      stabilizeTimer = window.setTimeout(rescale, 320);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        rescale();
        window.setTimeout(rescale, 220);
      } else if (document.visibilityState === 'hidden') {
        stopTts();
        const activeDocId = docIdRef.current;
        const activePage = currentPageRef.current;
        if (pageSaveTimerRef.current !== null && activeDocId) {
          window.clearTimeout(pageSaveTimerRef.current);
          pageSaveTimerRef.current = null;
          void updateDocumentPage(activeDocId, activePage);
        }
      }
    };

    window.addEventListener('resize', handleResizeOrOrientation);
    window.addEventListener('orientationchange', handleResizeOrOrientation);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      if (stabilizeTimer !== null) window.clearTimeout(stabilizeTimer);
      window.removeEventListener('resize', handleResizeOrOrientation);
      window.removeEventListener('orientationchange', handleResizeOrOrientation);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [doc, basePageSize, chromeInset, viewMode]);

  // React registers wheel listeners as passive, so preventDefault inside
  // onWheel is ignored. This native listener owns paged wheel physics: a
  // gesture that has nowhere left to scroll immediately turns the page; one
  // that can still scroll stays entirely native.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !doc) return;

    const handleNativeWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
        const delta = event.deltaY > 0 ? -0.1 : 0.1;
        setZoom((current) =>
          Math.min(3.5, Math.max(0.5, Number((current + delta).toFixed(2))))
        );
        return;
      }

      if (viewMode === 'continuous') return;

      const multiplier =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1;
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      const rawDelta = horizontal ? event.deltaX : event.deltaY;
      const delta = rawDelta * multiplier;
      if (Math.abs(delta) < 1) return;

      const direction = delta > 0 ? 1 : -1;
      const canScroll = horizontal
        ? canScrollHorizontally(direction)
        : canScrollVertically(direction);

      if (canScroll) {
        wheelAccumRef.current = 0;
        wheelDirectionRef.current = 0;
        return;
      }

      // The page fits: no vertical drift is allowed before the turn.
      event.preventDefault();

      const now = performance.now();
      if (now - lastWheelTimeRef.current < WHEEL_TURN_COOLDOWN_MS) return;

      if (wheelDirectionRef.current !== direction) {
        wheelDirectionRef.current = direction;
        wheelAccumRef.current = 0;
      }
      wheelAccumRef.current += Math.abs(delta);

      if (wheelIdleTimerRef.current !== null) {
        window.clearTimeout(wheelIdleTimerRef.current);
      }
      wheelIdleTimerRef.current = window.setTimeout(() => {
        wheelIdleTimerRef.current = null;
        wheelAccumRef.current = 0;
        wheelDirectionRef.current = 0;
      }, 180);

      if (wheelAccumRef.current < WHEEL_TURN_THRESHOLD) return;

      wheelAccumRef.current = 0;
      wheelDirectionRef.current = 0;
      lastWheelTimeRef.current = now;

      if (direction > 0) goToNextPage();
      else goToPrevPage();
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleNativeWheel);
  }, [
    canScrollHorizontally,
    canScrollVertically,
    doc,
    goToNextPage,
    goToPrevPage,
    viewMode
  ]);

  const closeDocument = useCallback(() => {
    stopTts();
    if (pageSaveTimerRef.current !== null && docIdRef.current) {
      window.clearTimeout(pageSaveTimerRef.current);
      pageSaveTimerRef.current = null;
      void updateDocumentPage(docIdRef.current, currentPageRef.current);
    }
    const activeDoc = docRef.current;
    clearSearchTextCache(activeDoc);
    docRef.current = null;
    docIdRef.current = '';
    annotationsGenerationRef.current += 1;
    annotationsHydratedRef.current = false;
    bookmarksHydratedRef.current = false;
    setDoc(null);
    setDocTitle('');
    setDocId('');
    setNumPages(0);
    setCurrentPage(1);
    setAnnotations([]);
    setBookmarks([]);
    setSearchQuery('');
    setActiveSearchPage(null);
    setSearchSeed(null);
    setIsSearchOpen(false);
    setIsSidebarOpen(false);
    setIsSettingsOpen(false);
    setIsImmersive(false);
    lastTapRef.current = null;
    cancelPendingSingleTap();
    setPasswordModal(EMPTY_PASSWORD_MODAL);
    setDocumentError(null);
    setIsLoading(false);
    setLoadProgress(null);
    lastFitScaleRef.current = 0;
    if (activeDoc) destroyDocumentSoon(activeDoc);
  }, [cancelPendingSingleTap]);

  const handlePasswordCancel = useCallback(() => {
    loadGenerationRef.current += 1;
    const task = loadingTaskRef.current;
    loadingTaskRef.current = null;
    if (task) {
      void task.destroy().catch(() => {});
    }
    setPasswordModal(EMPTY_PASSWORD_MODAL);
    setIsLoading(false);
    setLoadProgress(null);
  }, []);

  const handleBackStep = useCallback((): boolean => {
    // 1. Give topmost menus/sheets a chance to handle the back action
    if (typeof window !== 'undefined') {
      const backEvent = new CustomEvent('otium:back', { cancelable: true });
      window.dispatchEvent(backEvent);
      if (backEvent.defaultPrevented) {
        return true;
      }
    }

    const selection = typeof window !== 'undefined' ? window.getSelection() : null;
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
      selection.removeAllRanges();
      return true;
    }
    if (passwordModal.isOpen) {
      handlePasswordCancel();
      return true;
    }
    if (isImmersive) {
      setIsImmersive(false);
      return true;
    }
    if (isSettingsOpen) {
      setIsSettingsOpen(false);
      return true;
    }
    if (isSearchOpen) {
      setIsSearchOpen(false);
      setSearchQuery('');
      setActiveSearchPage(null);
      return true;
    }
    if (isSidebarOpen) {
      setIsSidebarOpen(false);
      return true;
    }
    if (doc) {
      closeDocument();
      return true;
    }
    return false;
  }, [closeDocument, doc, handlePasswordCancel, isImmersive, isSearchOpen, isSettingsOpen, isSidebarOpen, passwordModal.isOpen]);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__OTIUM_HANDLE_BACK__ = handleBackStep;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (handleBackStep()) {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', handleEscape);

    // Support Android hardware back button and gesture navigation via popstate
    let isPopping = false;
    const handlePopState = () => {
      if (isPopping) return;
      isPopping = true;
      const stepped = handleBackStep();
      if (stepped) {
        window.history.pushState(null, '', window.location.href);
      }
      setTimeout(() => {
        isPopping = false;
      }, 50);
    };

    window.addEventListener('popstate', handlePopState);
    window.history.pushState(null, '', window.location.href);

    return () => {
      delete (window as unknown as Record<string, unknown>).__OTIUM_HANDLE_BACK__;
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [handleBackStep]);

  const loadPdfData = async (data: ArrayBuffer, title: string) => {
    if (!data || data.byteLength === 0) {
      setDocumentError(lang === 'ar' ? 'الملف المحدد فارغ.' : 'The selected file is empty.');
      return;
    }

    const generation = ++loadGenerationRef.current;
    const annotationGeneration = ++annotationsGenerationRef.current;
    annotationsHydratedRef.current = false;
    bookmarksHydratedRef.current = false;
    setDocumentError(null);
    setLoadProgress(null);
    setIsLoading(true);
    setPasswordModal(EMPTY_PASSWORD_MODAL);

    const previousTask = loadingTaskRef.current;
    loadingTaskRef.current = null;
    if (previousTask) {
      void previousTask.destroy().catch(() => {});
    }

    // pdf.js transfers the buffer to its worker, so keep a copy for recents.
    const storageBuffer = data.slice(0);
    const identityPromise = fingerprintDocument(storageBuffer).catch(() => '');

    const handle = openPdf(data, {
      onPassword: ({ callback, reason }) => {
        if (generation !== loadGenerationRef.current) return;
        setIsLoading(false);
        setPasswordModal({
          isOpen: true,
          isIncorrect: reason === 2,
          callback,
          title
        });
      },
      onProgress: (loaded, total) => {
        if (generation !== loadGenerationRef.current || total <= 0) return;
        setLoadProgress(Math.min(100, Math.round((loaded / total) * 100)));
      }
    });

    loadingTaskRef.current = handle.loadingTask;

    try {
      const opened = await handle.promise;
      if (generation !== loadGenerationRef.current) {
        destroyDocumentSoon(opened.doc);
        return;
      }

      // Identity follows the bytes, so a renamed file keeps its highlights.
      const documentId = (await identityPromise) || title;
      if (generation !== loadGenerationRef.current) {
        destroyDocumentSoon(opened.doc);
        return;
      }

      loadingTaskRef.current = null;
      const previousDoc = docRef.current;
      docRef.current = opened.doc;
      docIdRef.current = documentId;

      setDoc(opened.doc);
      setDocTitle(title);
      setDocId(documentId);
      setNumPages(opened.numPages);
      setAnnotations([]);
      void loadStoredAnnotations(documentId, title)
        .then((stored) => {
          if (annotationGeneration !== annotationsGenerationRef.current) return;
          annotationsHydratedRef.current = true;
          setAnnotations(stored);
        })
        .catch(() => {
          if (annotationGeneration !== annotationsGenerationRef.current) return;
          annotationsHydratedRef.current = true;
          setAnnotations([]);
        });
      setBookmarks(getStoredBookmarks(documentId, title));
      bookmarksHydratedRef.current = true;
      setBasePageSize(opened.basePageSize);
      setBaseAspectRatio(opened.baseAspectRatio);
      setPasswordModal(EMPTY_PASSWORD_MODAL);
      setSearchQuery('');
      setActiveSearchPage(null);
      setSearchSeed(null);
      setIsSearchOpen(false);
      setIsSidebarOpen(false);
      setIsImmersive(false);
      setDocumentError(null);

      if (opened.basePageSize.width && opened.basePageSize.height && typeof window !== 'undefined') {
        const fit = computeOptimalPageScale(
          opened.basePageSize.width,
          opened.basePageSize.height,
          window.innerWidth,
          window.innerHeight - chromeInset,
          viewMode
        );
        lastFitScaleRef.current = fit;
        setZoom(fit);
      }

      const savedPage = loadLastPage(documentId, title);
      const initialPage =
        savedPage > 0 && savedPage <= opened.numPages ? savedPage : 1;
      pendingScrollPageRef.current = initialPage > 1 ? initialPage : null;
      setCurrentPage(initialPage);

      if (storageBuffer.byteLength > 0) {
        void saveDocumentToStorage(documentId, title, storageBuffer, opened.numPages, initialPage);
        // A pre-1.5 record was keyed by filename. Remove it only after its bytes
        // prove they are the same document, so same-named books stay separate.
        void adoptLegacyDocumentRecord(title, documentId);
      } else {
        void updateDocumentPage(documentId, initialPage);
      }

      if (previousDoc && previousDoc !== opened.doc) {
        clearSearchTextCache(previousDoc);
        destroyDocumentSoon(previousDoc);
      }
    } catch (error) {
      if (generation !== loadGenerationRef.current) return;
      loadingTaskRef.current = null;
      setPasswordModal(EMPTY_PASSWORD_MODAL);
      setDocumentError(describeDocumentError(error, lang));
      console.error('Error loading PDF:', error);
    } finally {
      if (generation === loadGenerationRef.current) {
        setIsLoading(false);
        setLoadProgress(null);
      }
    }
  };

  const loadDocumentRef = useRef(loadPdfData);
  useEffect(() => {
    loadDocumentRef.current = loadPdfData;
  });

  useEffect(() => {
    return registerIncomingDocumentHandler((incoming) => {
      void loadDocumentRef.current(incoming.data, incoming.name);
    });
  }, []);

  const openFile = useCallback(async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      await loadDocumentRef.current(buffer, file.name);
    } catch (error) {
      setDocumentError(describeDocumentError(error, lang));
      console.error('Error reading file:', error);
    }
  }, []);

  const openFileRef = useRef(openFile);
  useEffect(() => {
    openFileRef.current = openFile;
  });

  useEffect(() => {
    if (!capabilities.dragDrop) return;

    const handleDragOver = (event: DragEvent) => event.preventDefault();
    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        void openFileRef.current(file);
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [capabilities.dragDrop]);

  const openSample = useCallback(async () => {
    setIsLoading(true);
    setDocumentError(null);
    try {
      const response = await fetch('/sample.pdf');
      if (!response.ok) throw new Error(`Sample document returned ${response.status}`);
      const buffer = await response.arrayBuffer();
      await loadDocumentRef.current(buffer, SAMPLE_DOCUMENT_NAME);
    } catch (error) {
      setDocumentError(describeDocumentError(error, lang));
      setIsLoading(false);
      console.error('Error loading sample:', error);
    }
  }, []);

  const openRecent = useCallback(async (recent: RecentDocItem) => {
    if (recent.name === SAMPLE_DOCUMENT_NAME) {
      await openSample();
      return;
    }

    if (!recent.available) {
      setDocumentError(
        lang === 'ar'
          ? 'هذا المستند في مكتبتك لكن ملفه غير موجود على هذا الجهاز. أعد فتح ملف الـ PDF لاستعادته.'
          : 'This book is in your library but its PDF is not on this device. Open the PDF file again to restore it.'
      );
      return;
    }

    setIsLoading(true);
    setDocumentError(null);
    const data = await getDocumentFromStorage(recent.id);
    if (!data) {
      setIsLoading(false);
      setDocumentError(
        lang === 'ar'
          ? 'هذا المستند لم يعد محفوظاً على هذا الجهاز.'
          : 'This document is no longer stored on this device.'
      );
      return;
    }
    await loadDocumentRef.current(data, recent.name);
  }, [openSample]);

  const toggleBookmark = useCallback(
    (pageNumber: number) => {
      setBookmarks((current) => {
        const exists = current.some((bookmark) => bookmark.pageNumber === pageNumber);
        if (exists) {
          return current.filter((bookmark) => bookmark.pageNumber !== pageNumber);
        }
        return [
          ...current,
          { id: `bm_${Date.now()}`, pageNumber, createdAt: Date.now() }
        ];
      });
    },
    []
  );

  const addAnnotation = useCallback((annotation: TextAnnotation) => {
    setAnnotations((current) => [...current, annotation]);
  }, []);

  const deleteAnnotation = useCallback((annotationId: string) => {
    setAnnotations((current) => current.filter((annotation) => annotation.id !== annotationId));
  }, []);

  const updateAnnotationNote = useCallback((annotationId: string, note: string) => {
    const trimmed = note.trim();
    setAnnotations((current) =>
      current.map((annotation) =>
        annotation.id === annotationId
          ? {
              ...annotation,
              note: trimmed ? trimmed.slice(0, 4000) : undefined,
              updatedAt: Date.now()
            }
          : annotation
      )
    );
  }, []);

  const exportBackup = useCallback(async (): Promise<SaveTextOutcome> => {
    const json = await createBackupJson(__APP_VERSION__, {
      id: docId,
      annotations,
      bookmarks,
      lastPage: currentPage
    });
    const date = new Date().toISOString().slice(0, 10);
    return saveTextFile(
      `otium-backup-${date}.json`,
      json,
      'application/json;charset=utf-8'
    );
  }, [annotations, bookmarks, currentPage, docId]);

  const importBackup = useCallback(
    async (text: string): Promise<RestoreSummary> => {
      const outcome = await applyBackupJson(text);

      // A restore can target the book that is already open. Merge the backup
      // into the live state so the sidebar updates without reopening the PDF.
      if (docId) {
        const restored = outcome.file.documents.find((document) => document.id === docId);
        if (restored) {
          setAnnotations((current) => mergeAnnotations(current, restored.annotations));
          setBookmarks((current) => mergeBookmarks(current, restored.bookmarks));
        }
      }

      const preferences = outcome.preferences;
      if (preferences?.theme) changeTheme(preferences.theme);
      if (preferences?.viewMode) changeViewMode(preferences.viewMode);
      if (preferences?.fontFamily) changeFont(preferences.fontFamily);
      if (preferences?.language) {
        setLang(preferences.language);
        saveLanguage(preferences.language);
      }

      return outcome.summary;
    },
    [changeFont, changeTheme, changeViewMode, docId]
  );

  const handlePasswordSubmit = useCallback(
    (password: string) => {
      if (!passwordModal.callback) return;
      setIsLoading(true);
      passwordModal.callback(password);
    },
    [passwordModal]
  );

  const handleDoubleTap = useCallback(
    (clientX: number, clientY: number) => {
      const fit = getFitScale();
      captureZoomAnchor(clientX, clientY);
      // Double-tap toggles between fit and roughly 2x fit. Any other zoom
      // level (including a pinch below fit) returns to fit first.
      const nearFit = Math.abs(zoom - fit) <= Math.max(0.08, fit * 0.1);
      const target = nearFit ? Math.min(3.5, Math.max(1.6, fit * 2)) : fit;
      startZoomTransition(() => setZoom(Number(target.toFixed(2))));

      const captured = zoomAnchorRef.current;
      window.setTimeout(() => {
        if (zoomAnchorRef.current === captured) clearZoomAnchor();
      }, ZOOM_ANIMATION_MS);
    },
    [captureZoomAnchor, clearZoomAnchor, getFitScale, startZoomTransition, zoom]
  );

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    // A new touch may be the second half of a double tap. Hold the pending
    // single-tap chrome toggle until the gesture resolves.
    cancelPendingSingleTap();

    if (event.touches.length === 2) {
      lastTapRef.current = null;
      selectionAtTouchStartRef.current = false;
      const distance = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY
      );
      if (distance > 10) {
        pinchStartDistRef.current = distance;
        pinchStartZoomRef.current = zoom;
        isPinchingRef.current = true;
        captureZoomAnchor(
          (event.touches[0].clientX + event.touches[1].clientX) / 2,
          (event.touches[0].clientY + event.touches[1].clientY) / 2
        );
      }
      touchStartX.current = null;
      touchStartY.current = null;
      setIsDraggingTouch(false);
      resetSwipeOffset();
      touchDeltaXRef.current = 0;
      return;
    }

    if (event.touches.length === 1 && !isPinchingRef.current) {
      const touch = event.touches[0];
      const selection = window.getSelection();
      selectionAtTouchStartRef.current = Boolean(
        selection && !selection.isCollapsed && selection.toString().trim().length > 0
      );
      touchStartX.current = touch.clientX;
      touchStartY.current = touch.clientY;
      touchStartTimeRef.current = performance.now();
      resetSwipeOffset();
      touchDeltaXRef.current = 0;

      // Cache scroll metrics once at touchstart to eliminate layout thrashing during touchmove
      const container = scrollContainerRef.current;
      if (container) {
        const maxScrollX = Math.max(0, container.scrollWidth - container.clientWidth);
        const maxScrollY = Math.max(0, container.scrollHeight - container.clientHeight);
        cachedScrollMetricsRef.current = {
          maxScrollX,
          maxScrollY,
          isOverflowingX: maxScrollX > 2,
          isOverflowingY: maxScrollY > 2
        };
      }

      if (viewMode === 'single' || viewMode === 'dual') {
        setIsDraggingTouch(true);
      }
    }
  };

  const handleTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (
      event.touches.length === 2 &&
      pinchStartDistRef.current !== null &&
      pinchStartDistRef.current > 0
    ) {
      const distance = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY
      );
      zoomFocusRef.current = {
        x: (event.touches[0].clientX + event.touches[1].clientX) / 2,
        y: (event.touches[0].clientY + event.touches[1].clientY) / 2
      };
      const factor = distance / pinchStartDistRef.current;
      const targetZoom = Math.min(
        3.5,
        Math.max(0.5, Number((pinchStartZoomRef.current * factor).toFixed(2)))
      );
      startZoomTransition(() => setZoom(targetZoom));
      return;
    }

    if (event.touches.length >= 2) {
      touchStartX.current = null;
      setIsDraggingTouch(false);
      resetSwipeOffset();
      touchDeltaXRef.current = 0;
      return;
    }

    if (
      touchStartX.current === null ||
      touchStartY.current === null ||
      isPinchingRef.current ||
      (viewMode !== 'single' && viewMode !== 'dual')
    ) {
      return;
    }

    // A drag that is extending a text selection must never turn a page.
    const selection = typeof window !== 'undefined' ? window.getSelection() : null;
    const hasSelection =
      selectionAtTouchStartRef.current ||
      Boolean(selection && !selection.isCollapsed && selection.toString().trim().length > 0);
    if (hasSelection) {
      if (touchDeltaXRef.current !== 0) {
        resetSwipeOffset();
        touchDeltaXRef.current = 0;
      }
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = touch.clientY - touchStartY.current;

    if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
      lastTapRef.current = null;
    }

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      const scrollDirection = deltaX < 0 ? 1 : -1;
      if (canScrollHorizontally(scrollDirection)) {
        if (touchDeltaXRef.current !== 0) {
          resetSwipeOffset();
          touchDeltaXRef.current = 0;
        }
        return;
      }

      // Elastic, horizontal-only feedback. The page never drifts vertically.
      const resisted = Math.max(-72, Math.min(72, deltaX * 0.35));
      applySwipeOffset(resisted);
      touchDeltaXRef.current = resisted;
      return;
    }

    if (Math.abs(deltaY) < 8 || Math.abs(deltaX) > 18) return;

    // Once the gesture is clearly vertical, discard horizontal travel so a
    // wobbly swipe cannot turn the page sideways at release.
    if (touchDeltaXRef.current !== 0) {
      resetSwipeOffset();
      touchDeltaXRef.current = 0;
    }

    // Overflowing pages scroll natively first. Fit pages stay perfectly still
    // and turn only when the finger is released.
    const direction = deltaY < 0 ? 1 : -1;
    if (canScrollVertically(direction)) return;
  };

  const handleTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    const wasPinching = isPinchingRef.current;
    if (event.touches.length === 0) {
      isPinchingRef.current = false;
      pinchStartDistRef.current = null;
      const captured = zoomAnchorRef.current;
      window.setTimeout(() => {
        if (zoomAnchorRef.current === captured) clearZoomAnchor();
      }, 0);
    }
    if (wasPinching || event.touches.length > 0) {
      touchStartX.current = null;
      touchStartY.current = null;
      selectionAtTouchStartRef.current = false;
      setIsDraggingTouch(false);
      resetSwipeOffset();
      touchDeltaXRef.current = 0;
      return;
    }

    const startX = touchStartX.current;
    const startY = touchStartY.current;
    const duration = performance.now() - touchStartTimeRef.current;
    const touch = event.changedTouches[0];

    setIsDraggingTouch(false);
    touchStartX.current = null;
    touchStartY.current = null;
    resetSwipeOffset();
    touchDeltaXRef.current = 0;

    if (startX === null || startY === null || !touch) return;

    const movedX = touch.clientX - startX;
    const movedY = touch.clientY - startY;

    const selection = window.getSelection();
    const selectionIsActive =
      selectionAtTouchStartRef.current ||
      Boolean(selection && !selection.isCollapsed && selection.toString().trim().length > 0);
    selectionAtTouchStartRef.current = false;
    if (selectionIsActive) {
      // The tap dismissed or adjusted a text selection; the selection menu
      // owns this gesture and the chrome must stay exactly as it was.
      lastTapRef.current = null;
      return;
    }

    if (viewMode === 'single' || viewMode === 'dual') {
      const horizontal =
        Math.abs(movedX) > TOUCH_SWIPE_TURN_THRESHOLD &&
        Math.abs(movedX) > Math.abs(movedY) * 1.2;
      if (horizontal) {
        lastTapRef.current = null;
        cancelPendingSingleTap();
        const next = lang === 'ar' ? movedX > 0 : movedX < 0;
        if (next) goToNextPage();
        else goToPrevPage();
        return;
      }

      const vertical =
        Math.abs(movedY) > TOUCH_VERTICAL_TURN_THRESHOLD &&
        Math.abs(movedY) > Math.abs(movedX) * 1.2;
      if (vertical) {
        const direction = movedY < 0 ? 1 : -1;
        if (!canScrollVertically(direction)) {
          lastTapRef.current = null;
          cancelPendingSingleTap();
          if (direction > 0) goToNextPage();
          else goToPrevPage();
          return;
        }
      }
    }

    const isTap =
      duration < 280 &&
      Math.abs(movedX) < 12 &&
      Math.abs(movedY) < 12 &&
      !isInteractiveTarget(event.target);

    if (!isTap) {
      lastTapRef.current = null;
      return;
    }

    const now = performance.now();
    const previous = lastTapRef.current;
    if (
      previous &&
      now - previous.time < DOUBLE_TAP_MS &&
      Math.hypot(touch.clientX - previous.x, touch.clientY - previous.y) < 40
    ) {
      lastTapRef.current = null;
      cancelPendingSingleTap();
      handleDoubleTap(touch.clientX, touch.clientY);
      return;
    }

    lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };

    // Wait out the double-tap window, then toggle the immersive reading mode.
    // A second tap cancels this timer in handleTouchStart and zooms instead.
    singleTapTimerRef.current = window.setTimeout(() => {
      singleTapTimerRef.current = null;
      setIsImmersive((hidden) => !hidden);
    }, DOUBLE_TAP_MS);
  };

  const handleTouchCancel = () => {
    isPinchingRef.current = false;
    pinchStartDistRef.current = null;
    clearZoomAnchor();
    touchStartX.current = null;
    touchStartY.current = null;
    selectionAtTouchStartRef.current = false;
    cancelPendingSingleTap();
    lastTapRef.current = null;
    setIsDraggingTouch(false);
    resetSwipeOffset();
    touchDeltaXRef.current = 0;
  };

  const handleToggleFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (!document.fullscreenElement) {
      if (typeof root.requestFullscreen === 'function') {
        void root.requestFullscreen().catch(() => {});
      }
    } else if (typeof document.exitFullscreen === 'function') {
      void document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!capabilities.keyboard) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setIsSearchOpen((open) => !open);
        return;
      }

      switch (event.key.toLowerCase()) {
        case 'j':
        case 'arrowdown':
        case 'pagedown':
        case ' ':
          event.preventDefault();
          if (viewMode === 'continuous') {
            scrollContainerRef.current?.scrollBy({ top: 220, behavior: 'smooth' });
          } else {
            goToNextPage();
          }
          break;
        case 'arrowright':
          event.preventDefault();
          if (viewMode === 'continuous') {
            scrollContainerRef.current?.scrollBy({ top: lang === 'ar' ? -220 : 220, behavior: 'smooth' });
          } else if (lang === 'ar') {
            goToPrevPage();
          } else {
            goToNextPage();
          }
          break;
        case 'arrowleft':
          event.preventDefault();
          if (viewMode === 'continuous') {
            scrollContainerRef.current?.scrollBy({ top: lang === 'ar' ? 220 : -220, behavior: 'smooth' });
          } else if (lang === 'ar') {
            goToNextPage();
          } else {
            goToPrevPage();
          }
          break;
        case 'k':
        case 'arrowup':
        case 'pageup':
          event.preventDefault();
          if (viewMode === 'continuous') {
            scrollContainerRef.current?.scrollBy({ top: -220, behavior: 'smooth' });
          } else {
            goToPrevPage();
          }
          break;
        case '+':
        case '=':
          event.preventDefault();
          setZoom((current) => Math.min(2.5, current + 0.15));
          break;
        case '-':
        case '_':
          event.preventDefault();
          setZoom((current) => Math.max(0.5, current - 0.15));
          break;
        case '0':
          event.preventDefault();
          setZoom(1.15);
          break;
        case 't': {
          event.preventDefault();
          const nextIndex = (THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length;
          changeTheme(THEME_ORDER[nextIndex]);
          break;
        }
        case 'm':
          event.preventDefault();
          changeViewMode(
            viewMode === 'continuous' ? 'dual' : viewMode === 'dual' ? 'single' : 'continuous'
          );
          break;
        case 'b':
          event.preventDefault();
          toggleBookmark(currentPage);
          break;
        case 'f':
          event.preventDefault();
          handleToggleFullscreen();
          break;
        case 's':
          event.preventDefault();
          setIsSidebarOpen((open) => !open);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    capabilities.keyboard,
    changeTheme,
    changeViewMode,
    currentPage,
    goToNextPage,
    goToPrevPage,
    handleToggleFullscreen,
    lang,
    theme,
    toggleBookmark,
    viewMode
  ]);

  const handleSearchQueryChange = useCallback((query: string, page: number | null) => {
    setSearchQuery(query);
    setActiveSearchPage(page);
  }, []);

  const openSearchWithText = useCallback((text: string) => {
    const query = text.replace(/\s+/g, ' ').trim().slice(0, 96);
    setIsSearchOpen(true);
    setSearchSeed(query ? { query, id: Date.now() } : null);
  }, []);

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setActiveSearchPage(null);
    setSearchSeed(null);
  }, []);

  const changeMobileNavVisibility = useCallback((visible: boolean) => {
    setShowMobileNavBar(visible);
    saveMobileNavVisible(visible);
  }, []);

  const resetDefaults = useCallback(() => {
    changeFont('tajawal');
    changeViewMode('continuous');
    changeTheme('paper');
    setShowMobileNavBar(true);
    saveMobileNavVisible(true);
  }, [changeFont, changeTheme, changeViewMode]);

  return {
    doc,
    docTitle,
    docId,
    numPages,
    currentPage,
    zoom,
    setZoom,
    theme,
    viewMode,
    lang,
    fontFamily,
    showMobileNavBar,
    isImmersive,
    baseAspectRatio,
    basePageSize,
    isSidebarOpen,
    isSearchOpen,
    isSettingsOpen,
    isFullscreen,
    isLoading,
    loadProgress,
    documentError,
    searchQuery,
    activeSearchPage,
    searchSeed,
    annotations,
    bookmarks,
    passwordModal,
    dualFlipKey,
    dualFlipDir,
    isDraggingTouch,
    scrollContainerRef,
    openFile,
    openSample,
    openRecent,
    closeDocument,
    clearDocumentError: () => setDocumentError(null),
    handlePageVisible,
    scrollToPage,
    goToNextPage,
    goToPrevPage,
    changeTheme,
    changeLanguage,
    changeFont,
    changeViewMode,
    changeMobileNavVisibility,
    toggleBookmark,
    addAnnotation,
    deleteAnnotation,
    updateAnnotationNote,
    exportBackup,
    importBackup,
    handlePasswordSubmit,
    handlePasswordCancel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    handleToggleFullscreen,
    handleSearchQueryChange,
    openSearchWithText,
    closeSearch,
    setIsSidebarOpen,
    setIsSearchOpen,
    setIsSettingsOpen,
    resetDefaults
  };
}

export type ReaderController = ReturnType<typeof useReaderController>;
