import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import type { TouchEvent as ReactTouchEvent, WheelEvent as ReactWheelEvent } from 'react';
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
  getDocumentFromStorage,
  saveDocumentToStorage,
  updateDocumentPage
} from '../core/storage/documents';
import {
  getStoredAnnotations,
  saveStoredAnnotations
} from '../core/storage/annotations';
import { getStoredBookmarks, saveStoredBookmarks } from '../core/storage/bookmarks';
import { applyFontFamily, getSavedFont, saveFont } from '../core/settings/fonts';
import {
  loadLanguage,
  loadLastPage,
  loadTheme,
  loadViewMode,
  saveLanguage,
  saveLastPage,
  saveTheme,
  saveViewMode
} from '../core/settings/preferences';
import { computeOptimalPageScale, measureRefreshRate } from '../core/reader/device';
import { registerIncomingDocumentHandler } from '../platform/incomingDocument';

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

function destroyDocumentSoon(doc: PDFDocumentProxy | null): void {
  if (!doc) return;
  window.setTimeout(() => {
    void doc.loadingTask.destroy().catch(() => {});
  }, 250);
}

function describeDocumentError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'InvalidPDFException') return 'This file is not a valid PDF document.';
    if (error.name === 'PasswordException') return 'This document is password protected.';
    if (error.name === 'MissingPDFException') return 'The selected file could not be found.';
    return error.message || 'Could not open this document.';
  }
  return 'Could not open this document.';
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

export function useReaderController(capabilities: ReaderCapabilities) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [docTitle, setDocTitle] = useState('');
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

  const [touchDeltaX, setTouchDeltaX] = useState(0);
  const [isDraggingTouch, setIsDraggingTouch] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(1);
  const isPinchingRef = useRef(false);

  const docRef = useRef<PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const loadGenerationRef = useRef(0);
  const pendingScrollPageRef = useRef<number | null>(null);
  const lastWheelTimeRef = useRef(0);
  const pageSaveTimerRef = useRef<number | null>(null);
  const lastSavedPageRef = useRef<{ title: string; page: number } | null>(null);

  useEffect(() => {
    measureRefreshRate();
  }, []);

  useEffect(() => {
    applyFontFamily(fontFamily);
  }, [fontFamily]);

  useEffect(() => {
    if (!docTitle) return;
    saveStoredAnnotations(docTitle, annotations);
  }, [annotations, docTitle]);

  useEffect(() => {
    if (!docTitle) return;
    saveStoredBookmarks(docTitle, bookmarks);
  }, [bookmarks, docTitle]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    return () => {
      if (pageSaveTimerRef.current !== null) {
        window.clearTimeout(pageSaveTimerRef.current);
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

  const persistVisiblePage = useCallback((title: string, pageNumber: number) => {
    saveLastPage(title, pageNumber);
    if (lastSavedPageRef.current?.title === title && lastSavedPageRef.current.page === pageNumber) {
      return;
    }
    lastSavedPageRef.current = { title, page: pageNumber };
    if (pageSaveTimerRef.current !== null) {
      window.clearTimeout(pageSaveTimerRef.current);
    }
    pageSaveTimerRef.current = window.setTimeout(() => {
      pageSaveTimerRef.current = null;
      void updateDocumentPage(title, pageNumber);
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

      if (docTitle) {
        persistVisiblePage(docTitle, nextPage);
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
    [currentPage, docTitle, numPages, persistVisiblePage, scrollToRenderedPage, viewMode]
  );

  useEffect(() => {
    if (viewMode !== 'continuous' || pendingScrollPageRef.current === null) return;
    const pageNumber = pendingScrollPageRef.current;
    pendingScrollPageRef.current = null;
    scrollToRenderedPage(pageNumber);
  }, [currentPage, doc, viewMode, scrollToRenderedPage]);

  const handlePageVisible = useCallback(
    (pageNumber: number) => {
      setCurrentPage((current) => (current === pageNumber ? current : pageNumber));
      if (docTitle) {
        persistVisiblePage(docTitle, pageNumber);
      }
    },
    [docTitle, persistVisiblePage]
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
      setViewMode(nextMode);
      saveViewMode(nextMode);
      if (basePageSize.width && basePageSize.height && typeof window !== 'undefined') {
        setZoom(
          computeOptimalPageScale(
            basePageSize.width,
            basePageSize.height,
            window.innerWidth,
            window.innerHeight,
            nextMode
          )
        );
      }
    },
    [basePageSize]
  );

  useEffect(() => {
    const handleResize = () => {
      if (doc && basePageSize.width && basePageSize.height) {
        setZoom(
          computeOptimalPageScale(
            basePageSize.width,
            basePageSize.height,
            window.innerWidth,
            window.innerHeight,
            viewMode
          )
        );
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [doc, basePageSize, viewMode]);

  const closeDocument = useCallback(() => {
    const activeDoc = docRef.current;
    docRef.current = null;
    setDoc(null);
    setDocTitle('');
    setNumPages(0);
    setCurrentPage(1);
    setAnnotations([]);
    setBookmarks([]);
    setSearchQuery('');
    setActiveSearchPage(null);
    setIsSearchOpen(false);
    setIsSidebarOpen(false);
    setIsSettingsOpen(false);
    setPasswordModal(EMPTY_PASSWORD_MODAL);
    setDocumentError(null);
    setIsLoading(false);
    setLoadProgress(null);
    if (activeDoc) destroyDocumentSoon(activeDoc);
  }, []);

  const handleBackStep = useCallback((): boolean => {
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
  }, [closeDocument, doc, isSearchOpen, isSettingsOpen, isSidebarOpen]);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__OTIUM_HANDLE_BACK__ = handleBackStep;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (handleBackStep()) {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', handleEscape);

    return () => {
      delete (window as unknown as Record<string, unknown>).__OTIUM_HANDLE_BACK__;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [handleBackStep]);

  const loadPdfData = async (data: ArrayBuffer, title: string) => {
    if (!data || data.byteLength === 0) {
      setDocumentError('The selected file is empty.');
      return;
    }

    const generation = ++loadGenerationRef.current;
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

      loadingTaskRef.current = null;
      const previousDoc = docRef.current;
      docRef.current = opened.doc;

      setDoc(opened.doc);
      setDocTitle(title);
      setNumPages(opened.numPages);
      setAnnotations(getStoredAnnotations(title));
      setBookmarks(getStoredBookmarks(title));
      setBasePageSize(opened.basePageSize);
      setBaseAspectRatio(opened.baseAspectRatio);
      setPasswordModal(EMPTY_PASSWORD_MODAL);
      setSearchQuery('');
      setActiveSearchPage(null);
      setIsSearchOpen(false);
      setIsSidebarOpen(false);
      setDocumentError(null);

      if (opened.basePageSize.width && opened.basePageSize.height && typeof window !== 'undefined') {
        setZoom(
          computeOptimalPageScale(
            opened.basePageSize.width,
            opened.basePageSize.height,
            window.innerWidth,
            window.innerHeight,
            viewMode
          )
        );
      }

      const savedPage = loadLastPage(title);
      const initialPage =
        savedPage > 0 && savedPage <= opened.numPages ? savedPage : 1;
      pendingScrollPageRef.current = initialPage > 1 ? initialPage : null;
      setCurrentPage(initialPage);

      if (storageBuffer.byteLength > 0) {
        void saveDocumentToStorage(title, storageBuffer, opened.numPages, initialPage);
      } else {
        void updateDocumentPage(title, initialPage);
      }

      if (previousDoc && previousDoc !== opened.doc) {
        destroyDocumentSoon(previousDoc);
      }
    } catch (error) {
      if (generation !== loadGenerationRef.current) return;
      loadingTaskRef.current = null;
      setPasswordModal(EMPTY_PASSWORD_MODAL);
      setDocumentError(describeDocumentError(error));
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
      setDocumentError(describeDocumentError(error));
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
      setDocumentError(describeDocumentError(error));
      setIsLoading(false);
      console.error('Error loading sample:', error);
    }
  }, []);

  const openRecent = useCallback(async (recent: RecentDocItem) => {
    if (recent.name === SAMPLE_DOCUMENT_NAME) {
      await openSample();
      return;
    }

    setIsLoading(true);
    setDocumentError(null);
    const data = await getDocumentFromStorage(recent.name);
    if (!data) {
      setIsLoading(false);
      setDocumentError('This document is no longer stored on this device.');
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

  const handlePasswordSubmit = useCallback(
    (password: string) => {
      if (!passwordModal.callback) return;
      setIsLoading(true);
      passwordModal.callback(password);
    },
    [passwordModal]
  );

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

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (event.ctrlKey) {
        event.preventDefault();
        const delta = event.deltaY > 0 ? -0.1 : 0.1;
        setZoom((current) =>
          Math.min(3.5, Math.max(0.5, Number((current + delta).toFixed(2))))
        );
        return;
      }

      if (viewMode !== 'single' && viewMode !== 'dual') return;

      const now = Date.now();
      if (now - lastWheelTimeRef.current < 260) return;
      if (Math.abs(event.deltaY) <= 20) return;

      if (event.deltaY > 0) {
        goToNextPage();
      } else {
        goToPrevPage();
      }
      lastWheelTimeRef.current = now;
    },
    [goToNextPage, goToPrevPage, viewMode]
  );

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) {
      const distance = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY
      );
      if (distance > 10) {
        pinchStartDistRef.current = distance;
        pinchStartZoomRef.current = zoom;
        isPinchingRef.current = true;
      }
      touchStartX.current = null;
      touchStartY.current = null;
      setIsDraggingTouch(false);
      setTouchDeltaX(0);
      return;
    }

    if (
      event.touches.length === 1 &&
      !isPinchingRef.current &&
      (viewMode === 'single' || viewMode === 'dual')
    ) {
      touchStartX.current = event.touches[0].clientX;
      touchStartY.current = event.touches[0].clientY;
      setIsDraggingTouch(true);
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
      setTouchDeltaX(0);
      return;
    }

    if (
      touchStartX.current !== null &&
      isDraggingTouch &&
      !isPinchingRef.current &&
      (viewMode === 'single' || viewMode === 'dual')
    ) {
      const deltaX = event.touches[0].clientX - touchStartX.current;
      const deltaY = event.touches[0].clientY - (touchStartY.current || 0);
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        setTouchDeltaX(deltaX);
      }
    }
  };

  const handleTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 0) {
      isPinchingRef.current = false;
      pinchStartDistRef.current = null;
    }
    if (isPinchingRef.current || event.touches.length > 0) {
      touchStartX.current = null;
      touchStartY.current = null;
      setIsDraggingTouch(false);
      setTouchDeltaX(0);
      return;
    }

    setIsDraggingTouch(false);
    if (touchStartX.current === null) return;

    if ((viewMode === 'single' || viewMode === 'dual') && Math.abs(touchDeltaX) > 40) {
      if (touchDeltaX < 0) {
        goToNextPage();
      } else {
        goToPrevPage();
      }
    }

    setTouchDeltaX(0);
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const handleTouchCancel = () => {
    isPinchingRef.current = false;
    pinchStartDistRef.current = null;
    touchStartX.current = null;
    touchStartY.current = null;
    setIsDraggingTouch(false);
    setTouchDeltaX(0);
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
        case 'arrowright':
        case 'pagedown':
        case ' ':
          event.preventDefault();
          if (viewMode === 'single') {
            goToNextPage();
          } else {
            scrollContainerRef.current?.scrollBy({ top: 220, behavior: 'smooth' });
          }
          break;
        case 'k':
        case 'arrowup':
        case 'arrowleft':
        case 'pageup':
          event.preventDefault();
          if (viewMode === 'single') {
            goToPrevPage();
          } else {
            scrollContainerRef.current?.scrollBy({ top: -220, behavior: 'smooth' });
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
    theme,
    toggleBookmark,
    viewMode
  ]);

  const handleSearchQueryChange = useCallback((query: string, page: number | null) => {
    setSearchQuery(query);
    setActiveSearchPage(page);
  }, []);

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setActiveSearchPage(null);
  }, []);

  const resetDefaults = useCallback(() => {
    changeFont('tajawal');
    changeViewMode('continuous');
    changeTheme('paper');
  }, [changeFont, changeTheme, changeViewMode]);

  return {
    doc,
    docTitle,
    numPages,
    currentPage,
    zoom,
    setZoom,
    theme,
    viewMode,
    lang,
    fontFamily,
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
    annotations,
    bookmarks,
    passwordModal,
    dualFlipKey,
    dualFlipDir,
    touchDeltaX,
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
    toggleBookmark,
    addAnnotation,
    deleteAnnotation,
    handlePasswordSubmit,
    handlePasswordCancel,
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    handleToggleFullscreen,
    handleSearchQueryChange,
    closeSearch,
    setIsSidebarOpen,
    setIsSearchOpen,
    setIsSettingsOpen,
    resetDefaults
  };
}

export type ReaderController = ReturnType<typeof useReaderController>;
