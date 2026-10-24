import React, { useState, useEffect, useRef, useCallback, useTransition } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { pdfjsLib } from './utils/pdfWorker';
import type { ThemeMode, ViewMode, TextAnnotation, FontFamilyId, BookmarkItem } from './types';
import type { Language } from './utils/translations';
import { WelcomeScreen } from './components/WelcomeScreen';
import { Toolbar } from './components/Toolbar';
import { PdfPage } from './components/PdfPage';
import { Sidebar } from './components/Sidebar';
import { SettingsModal } from './components/SettingsModal';
import { PasswordModal } from './components/PasswordModal';
import { SearchBar } from './components/SearchBar';
import { TextSelectionMenu } from './components/TextSelectionMenu';
import { getStoredAnnotations, saveStoredAnnotations } from './utils/annotations';
import { getStoredBookmarks, saveStoredBookmarks } from './utils/bookmarks';
import { getSavedFont, saveFont, applyFontFamily } from './utils/fonts';
import { measureRefreshRate, computeOptimalPageScale } from './utils/device';
import {
  saveDocumentToStorage,
  getDocumentFromStorage,
  updateDocumentPage
} from './utils/storage';

interface PageSlotProps {
  pageNum: number;
  isNear: boolean;
  doc: PDFDocumentProxy;
  scale: number;
  theme: ThemeMode;
  annotations: TextAnnotation[];
  onDeleteAnnotation: (id: string) => void;
  baseAspectRatio: number;
  basePageWidth?: number;
  basePageHeight?: number;
  searchQuery?: string;
  isCurrentSearchPage?: boolean;
  onPageVisible: (num: number) => void;
}

const PageSlot: React.FC<PageSlotProps> = ({
  pageNum,
  isNear,
  doc,
  scale,
  theme,
  annotations,
  onDeleteAnnotation,
  baseAspectRatio,
  basePageWidth = 595,
  basePageHeight = 842,
  searchQuery,
  isCurrentSearchPage,
  onPageVisible
}) => {
  const slotRef = useRef<HTMLDivElement>(null);
  const shouldRender = isNear;

  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onPageVisible(pageNum);
        }
      },
      {
        rootMargin: '400px 0px 400px 0px',
        threshold: 0.01
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [pageNum, onPageVisible]);

  const standardWidth = Math.round(basePageWidth * scale);
  const standardHeight = Math.round(basePageHeight * scale);

  return (
    <div
      ref={slotRef}
      id={`pdf-page-${pageNum}`}
      dir="ltr"
      style={{
        width: `${standardWidth}px`,
        height: `${standardHeight}px`,
        contentVisibility: 'auto',
        containIntrinsicSize: `${standardWidth}px ${standardHeight}px`,
        contain: 'layout paint'
      }}
      className="my-5 mx-auto flex items-center justify-center transform-gpu"
    >
      {shouldRender ? (
        <PdfPage
          doc={doc}
          pageNumber={pageNum}
          scale={scale}
          theme={theme}
          annotations={annotations}
          onDeleteAnnotation={onDeleteAnnotation}
          baseAspectRatio={baseAspectRatio}
          searchQuery={searchQuery}
          isCurrentSearchPage={isCurrentSearchPage}
          onPageVisible={onPageVisible}
        />
      ) : (
        <div
          style={{ width: `${standardWidth}px`, height: `${standardHeight}px` }}
          className="rounded-sm border border-dashed border-white/5 bg-black/5 dark:bg-white/5 flex items-center justify-center font-mono text-xs opacity-20 select-none shadow-xs"
        >
          <span>صفحة {pageNum}</span>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [docTitle, setDocTitle] = useState<string>('');
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1.15);
  const [, startZoomTransition] = useTransition();

  // Dual-page flip animation
  const [dualFlipKey, setDualFlipKey] = useState<number>(0);
  const [dualFlipDir, setDualFlipDir] = useState<'forward' | 'backward'>('forward');

  const [theme, setTheme] = useState<ThemeMode>(() => {
    return (
      (localStorage.getItem('otium_theme') as ThemeMode) ||
      (localStorage.getItem('tirs_theme') as ThemeMode) ||
      'paper'
    );
  });

  const [baseAspectRatio, setBaseAspectRatio] = useState<number>(0.707);
  const [basePageSize, setBasePageSize] = useState<{ width: number; height: number }>({ width: 595, height: 842 });
  const [viewMode, setViewMode] = useState<ViewMode>('continuous');

  useEffect(() => {
    measureRefreshRate();
  }, []);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [fontFamily, setFontFamily] = useState<FontFamilyId>(getSavedFont);

  useEffect(() => {
    applyFontFamily(fontFamily);
  }, [fontFamily]);

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('otium_lang') || localStorage.getItem('tirs_lang');
    return saved === 'en' ? 'en' : 'ar';
  });

  const handleLanguageToggle = () => {
    const next = lang === 'ar' ? 'en' : 'ar';
    setLang(next);
    localStorage.setItem('otium_lang', next);
  };

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeSearchPage, setActiveSearchPage] = useState<number | null>(null);
  const [annotations, setAnnotations] = useState<TextAnnotation[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [passwordModal, setPasswordModal] = useState<{
    isOpen: boolean;
    isIncorrect: boolean;
    callback: ((pwd: string) => void) | null;
    title: string;
  }>({
    isOpen: false,
    isIncorrect: false,
    callback: null,
    title: ''
  });

  const handlePasswordSubmit = (password: string) => {
    if (passwordModal.callback) {
      setIsLoading(true);
      passwordModal.callback(password);
    }
  };

  const handlePasswordCancel = () => {
    setPasswordModal({ isOpen: false, isIncorrect: false, callback: null, title: '' });
    setIsLoading(false);
  };

  const handleToggleBookmark = (pageNum: number) => {
    setBookmarks((prev) => {
      const exists = prev.some((b) => b.pageNumber === pageNum);
      const updated = exists
        ? prev.filter((b) => b.pageNumber !== pageNum)
        : [...prev, { id: `bm_${Date.now()}`, pageNumber: pageNum, createdAt: Date.now() }];
      if (docTitle) {
        saveStoredBookmarks(docTitle, updated);
      }
      return updated;
    });
  };

  const handleAddAnnotation = (anno: TextAnnotation) => {
    setAnnotations((prev) => {
      const updated = [...prev, anno];
      if (docTitle) {
        saveStoredAnnotations(docTitle, updated);
      }
      return updated;
    });
  };

  const handleDeleteAnnotation = (id: string) => {
    setAnnotations((prev) => {
      const updated = prev.filter((a) => a.id !== id);
      if (docTitle) {
        saveStoredAnnotations(docTitle, updated);
      }
      return updated;
    });
  };

  const [touchDeltaX, setTouchDeltaX] = useState<number>(0);
  const [isDraggingTouch, setIsDraggingTouch] = useState<boolean>(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);
  const isPinchingRef = useRef<boolean>(false);

  // Native Android and Keyboard Back Step Handler
  useEffect(() => {
    const handleBackStep = (): boolean => {
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
        setDoc(null);
        setDocTitle('');
        setAnnotations([]);
        setBookmarks([]);
        return true;
      }
      return false;
    };

    (window as any).__OTIUM_HANDLE_BACK__ = handleBackStep;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleBackStep();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      delete (window as any).__OTIUM_HANDLE_BACK__;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSettingsOpen, isSearchOpen, isSidebarOpen, doc]);

  // Incoming PDF Handler (Android Intent or Windows Open-With)
  const loadPdfDataRef = useRef<(data: ArrayBuffer, title: string) => Promise<void>>(() => Promise.resolve());

  const scrollToPage = useCallback((pageNumber: number) => {
    if (pageNumber !== currentPage) {
      setDualFlipDir(pageNumber > currentPage ? 'forward' : 'backward');
      setDualFlipKey((k) => k + 1);
    }
    setCurrentPage(pageNumber);
    if (docTitle) {
      localStorage.setItem(`otium_page_${docTitle}`, pageNumber.toString());
      updateDocumentPage(docTitle, pageNumber);
    }

    if (viewMode === 'continuous') {
      const targetEl = document.getElementById(`pdf-page-${pageNumber}`);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [docTitle, viewMode, currentPage]);

  const navigateToPage = scrollToPage;

  const goToNextPage = useCallback(() => {
    if (viewMode === 'dual') {
      if (currentPage + 2 <= numPages) {
        scrollToPage(currentPage + 2);
      } else if (currentPage + 1 <= numPages) {
        scrollToPage(currentPage + 1);
      }
    } else {
      if (currentPage < numPages) {
        scrollToPage(currentPage + 1);
      }
    }
  }, [currentPage, numPages, scrollToPage, viewMode]);

  const goToPrevPage = useCallback(() => {
    if (viewMode === 'dual') {
      scrollToPage(Math.max(1, currentPage - 2));
    } else {
      if (currentPage > 1) {
        scrollToPage(currentPage - 1);
      }
    }
  }, [currentPage, scrollToPage, viewMode]);

  const lastWheelTimeRef = useRef<number>(0);
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((prev) => Math.min(3.5, Math.max(0.5, Number((prev + zoomDelta).toFixed(2)))));
      return;
    }

    if (viewMode === 'single' || viewMode === 'dual') {
      const now = Date.now();
      if (now - lastWheelTimeRef.current < 260) return;
      if (Math.abs(e.deltaY) > 20) {
        if (e.deltaY > 0) {
          goToNextPage();
        } else {
          goToPrevPage();
        }
        lastWheelTimeRef.current = now;
      }
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch gesture starting — capture both fingers
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (dist > 10) {
        pinchStartDistRef.current = dist;
        pinchStartZoomRef.current = zoom;
        isPinchingRef.current = true;
      }
      // Cancel any swipe in progress
      touchStartX.current = null;
      touchStartY.current = null;
      setIsDraggingTouch(false);
      setTouchDeltaX(0);
      return;
    }

    if (e.touches.length === 1 && !isPinchingRef.current && (viewMode === 'single' || viewMode === 'dual')) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      setIsDraggingTouch(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Active pinch zoom
    if (e.touches.length === 2 && pinchStartDistRef.current !== null && pinchStartDistRef.current > 0) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / pinchStartDistRef.current;
      const targetZoom = Math.min(3.5, Math.max(0.5, Number((pinchStartZoomRef.current * factor).toFixed(2))));
      startZoomTransition(() => { setZoom(targetZoom); });
      return;
    }

    // If a second finger appeared mid-swipe, abort swipe
    if (e.touches.length >= 2) {
      touchStartX.current = null;
      setIsDraggingTouch(false);
      setTouchDeltaX(0);
      return;
    }

    if (touchStartX.current !== null && isDraggingTouch && !isPinchingRef.current && (viewMode === 'single' || viewMode === 'dual')) {
      const dx = e.touches[0].clientX - touchStartX.current;
      const dy = e.touches[0].clientY - (touchStartY.current || 0);
      if (Math.abs(dx) > Math.abs(dy)) {
        setTouchDeltaX(dx);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    // If all fingers lifted, reset pinch state
    if (e.touches.length === 0) {
      isPinchingRef.current = false;
      pinchStartDistRef.current = null;
    }
    // If still pinching (one finger still down), just cancel swipe
    if (isPinchingRef.current || e.touches.length > 0) {
      touchStartX.current = null;
      touchStartY.current = null;
      setIsDraggingTouch(false);
      setTouchDeltaX(0);
      return;
    }

    setIsDraggingTouch(false);
    if (touchStartX.current === null) return;
    const deltaX = touchDeltaX;

    if ((viewMode === 'single' || viewMode === 'dual') && Math.abs(deltaX) > 40) {
      if (deltaX < 0) {
        goToNextPage();
      } else if (deltaX > 0) {
        goToPrevPage();
      }
    }
    setTouchDeltaX(0);
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const handleViewModeChange = (newMode: ViewMode) => {
    setViewMode(newMode);
    if (basePageSize.width && basePageSize.height) {
      const optimal = computeOptimalPageScale(
        basePageSize.width,
        basePageSize.height,
        window.innerWidth,
        window.innerHeight,
        newMode
      );
      setZoom(optimal);
    }
  };

  useEffect(() => {
    const handleResize = () => {
      if (doc && basePageSize.width && basePageSize.height) {
        const optimal = computeOptimalPageScale(
          basePageSize.width,
          basePageSize.height,
          window.innerWidth,
          window.innerHeight,
          viewMode
        );
        setZoom(optimal);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [doc, basePageSize, viewMode]);

  const handleThemeChange = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    localStorage.setItem('otium_theme', newTheme);
  };

  // Load document from Uint8Array / ArrayBuffer
  const loadPdfData = async (data: ArrayBuffer, title: string) => {
    setIsLoading(true);
    try {
      const storageBuffer = data && data.byteLength > 0 ? data.slice(0) : null;

      const baseUrl = window.location.origin;
      const loadingTask = pdfjsLib.getDocument({
        data,
        cMapUrl: `${baseUrl}/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${baseUrl}/standard_fonts/`,
        wasmUrl: `${baseUrl}/wasm/`,
        enableXfa: true,
      });

      loadingTask.onPassword = (callback: (pwd: string) => void, reason: number) => {
        setIsLoading(false);
        setPasswordModal({
          isOpen: true,
          isIncorrect: reason === 2,
          callback,
          title,
        });
      };

      const loadedDoc = await loadingTask.promise;
      setPasswordModal({ isOpen: false, isIncorrect: false, callback: null, title: '' });
      setDoc(loadedDoc);
      setDocTitle(title);
      setNumPages(loadedDoc.numPages);
      setAnnotations(getStoredAnnotations(title));
      setBookmarks(getStoredBookmarks(title));

      try {
        const p1 = await loadedDoc.getPage(1);
        const vp = p1.getViewport({ scale: 1 });
        if (vp.width && vp.height) {
          setBaseAspectRatio(vp.width / vp.height);
          setBasePageSize({ width: vp.width, height: vp.height });
          const optimal = computeOptimalPageScale(
            vp.width,
            vp.height,
            window.innerWidth,
            window.innerHeight,
            viewMode
          );
          setZoom(optimal);
        }
      } catch {
        // default 0.707
      }

      // Check last saved page
      const stored = localStorage.getItem(`otium_page_${title}`) || localStorage.getItem(`tirs_page_${title}`);
      const savedPage = stored ? parseInt(stored, 10) : 1;
      const initialPage = savedPage > 0 && savedPage <= loadedDoc.numPages ? savedPage : 1;
      setCurrentPage(initialPage);

      if (storageBuffer && storageBuffer.byteLength > 0) {
        await saveDocumentToStorage(title, storageBuffer, loadedDoc.numPages, initialPage);
      } else {
        await updateDocumentPage(title, initialPage);
      }

      if (initialPage > 1) {
        setTimeout(() => {
          scrollToPage(initialPage);
        }, 400);
      }
    } catch (err) {
      console.error('Error loading PDF:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPdfDataRef.current = loadPdfData;
  });

  // Native bridges are exposed after the PDF loader ref is bound, so a cold-start
  // Android intent cannot be acknowledged before the loader is ready.
  useEffect(() => {
    const loadFromBase64 = (base64Data: string, fileName: string) => {
      try {
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        void loadPdfDataRef.current(bytes.buffer, fileName);
      } catch (err) {
        console.error('Failed to parse incoming PDF:', err);
      }
    };

    (window as any).__OTIUM_LOAD_PDF_BASE64__ = loadFromBase64;

    // Desktop Tauri: check if the app was launched with a PDF path.
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('get_initial_pdf').then((initial: any) => {
          if (initial?.path) {
            invoke('read_pdf_bytes', { path: initial.path }).then((bytes: any) => {
              if (bytes?.length) {
                const arr = new Uint8Array(bytes);
                void loadPdfDataRef.current(arr.buffer, initial.name || 'document.pdf');
              }
            }).catch(() => {});
          }
        }).catch(() => {});
      }).catch(() => {});
    }

    return () => {
      delete (window as any).__OTIUM_LOAD_PDF_BASE64__;
    };
  }, []);

  const handleOpenFile = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    loadPdfData(arrayBuffer, file.name);
  };

  const handleOpenSample = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/sample.pdf');
      const arrayBuffer = await res.arrayBuffer();
      loadPdfData(arrayBuffer, 'The Art of Vibe Reading.pdf');
    } catch (err) {
      console.error('Error loading sample:', err);
      setIsLoading(false);
    }
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'j':
        case 'arrowdown':
        case 'arrowright':
        case 'pagedown':
        case ' ':
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
          if (viewMode === 'single') {
            goToPrevPage();
          } else {
            scrollContainerRef.current?.scrollBy({ top: -220, behavior: 'smooth' });
          }
          break;
        case '+':
        case '=':
          setZoom((prev) => Math.min(2.5, prev + 0.15));
          break;
        case '-':
        case '_':
          setZoom((prev) => Math.max(0.5, prev - 0.15));
          break;
        case '0':
          setZoom(1.15);
          break;
        case 't': {
          const themes: ThemeMode[] = ['paper', 'midnight', 'amoled', 'parchment', 'amber', 'eink', 'pure'];
          const nextIdx = (themes.indexOf(theme) + 1) % themes.length;
          handleThemeChange(themes[nextIdx]);
          break;
        }
        case 'f':
          handleToggleFullscreen();
          break;
        case 's':
          setIsSidebarOpen((prev) => !prev);
          break;
        case 'escape':
          setIsSidebarOpen(false);
          setIsSearchOpen(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [numPages, currentPage, viewMode, theme, scrollToPage, goToNextPage, goToPrevPage]);

  const handleOpenFileRef = useRef(handleOpenFile);
  useEffect(() => {
    handleOpenFileRef.current = handleOpenFile;
  });

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => e.preventDefault();
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          handleOpenFileRef.current(file);
        }
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  const getContainerBg = () => {
    switch (theme) {
      case 'paper':
        return '#f4ede1';
      case 'midnight':
        return '#06090f';
      case 'eink':
        return '#dfdfdf';
      case 'amber':
        return '#14100c';
      case 'amoled':
        return '#000000';
      case 'parchment':
        return '#ede2cd';
      case 'pure':
      default:
        return '#f1f5f9';
    }
  };

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden flex flex-col font-sans transition-colors duration-300 theme-${theme}`}
      style={{ backgroundColor: getContainerBg() }}
    >
      {!doc ? (
        <WelcomeScreen
          currentTheme={theme}
          currentLang={lang}
          onThemeChange={handleThemeChange}
          onToggleLanguage={handleLanguageToggle}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenFile={handleOpenFile}
          onOpenSample={handleOpenSample}
          onOpenRecent={async (recent) => {
            if (recent.name === 'The Art of Vibe Reading.pdf') {
              handleOpenSample();
              return;
            }
            setIsLoading(true);
            const data = await getDocumentFromStorage(recent.name);
            if (data) {
              loadPdfData(data, recent.name);
            } else {
              setIsLoading(false);
            }
          }}
        />
      ) : (
        <>
          {/* Subtle Ambient Top Progress Line */}
          <div className="fixed top-0 inset-x-0 h-[2px] bg-black/10 dark:bg-white/10 z-40">
            <div
              className="h-full bg-amber-500 transition-all duration-300"
              style={{ width: `${(currentPage / numPages) * 100}%` }}
            />
          </div>

          {/* Floating Aesthetic Toolbar */}
          <Toolbar
            title={docTitle}
            currentPage={currentPage}
            totalPages={numPages}
            zoom={zoom}
            theme={theme}
            viewMode={viewMode}
            currentLang={lang}
            isFullscreen={isFullscreen}
            isBookmarked={bookmarks.some((b) => b.pageNumber === currentPage)}
            onPageChange={navigateToPage}
            onZoomChange={setZoom}
            onThemeChange={handleThemeChange}
            onViewModeChange={handleViewModeChange}
            onToggleBookmark={() => handleToggleBookmark(currentPage)}
            onToggleFullscreen={handleToggleFullscreen}
            onToggleSidebar={() => setIsSidebarOpen(true)}
            onToggleSearch={() => setIsSearchOpen((prev) => !prev)}
            onToggleSettings={() => setIsSettingsOpen(true)}
            onCloseDocument={() => {
              setDoc(null);
              setDocTitle('');
              setAnnotations([]);
              setBookmarks([]);
            }}
          />

          {/* Floating Contextual Text Selection Toolbar */}
          <TextSelectionMenu
            onAddAnnotation={handleAddAnnotation}
            onDeleteAnnotation={handleDeleteAnnotation}
            annotations={annotations}
          />

          {/* Search Bar (Ctrl + F) */}
          <SearchBar
            isOpen={isSearchOpen}
            doc={doc}
            lang={lang}
            onNavigateToPage={scrollToPage}
            onQueryChange={(q, page) => {
              setSearchQuery(q);
              setActiveSearchPage(page);
            }}
            onClose={() => {
              setIsSearchOpen(false);
              setSearchQuery('');
              setActiveSearchPage(null);
            }}
          />

          {/* Sidebar Drawer */}
          <Sidebar
            isOpen={isSidebarOpen}
            doc={doc}
            totalPages={numPages}
            currentPage={currentPage}
            lang={lang}
            bookmarks={bookmarks}
            annotations={annotations}
            onSelectPage={navigateToPage}
            onToggleBookmark={handleToggleBookmark}
            onDeleteAnnotation={handleDeleteAnnotation}
            onClose={() => setIsSidebarOpen(false)}
          />

          {/* Main Reading Canvas Area */}
          <div
            ref={scrollContainerRef}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              paddingTop: 'max(4.5rem, calc(env(safe-area-inset-top, 0px) + 4.2rem))',
              touchAction: 'pan-x pan-y pinch-zoom'
            }}
            className="flex-1 w-full h-full overflow-y-auto overflow-x-auto pb-20 sm:pb-24 px-2 sm:px-4 relative"
          >
            {/* Quick-Flip Side Navigation Buttons (Single & Dual Mode) */}
            {(viewMode === 'single' || viewMode === 'dual') && (
              <>
                <button
                  type="button"
                  onClick={goToPrevPage}
                  disabled={currentPage <= 1}
                  title="الصفحة السابقة"
                  aria-label="Previous Page"
                  className="fixed left-2 sm:left-5 top-1/2 -translate-y-1/2 z-30 p-2 sm:p-2.5 rounded-full bg-neutral-900/60 hover:bg-neutral-900/90 text-white backdrop-blur-md opacity-25 hover:opacity-100 disabled:opacity-0 transition-all cursor-pointer shadow-xl border border-white/10"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={goToNextPage}
                  disabled={viewMode === 'dual' ? currentPage >= numPages : currentPage >= numPages}
                  title="الصفحة التالية"
                  aria-label="Next Page"
                  className="fixed right-2 sm:right-5 top-1/2 -translate-y-1/2 z-30 p-2 sm:p-2.5 rounded-full bg-neutral-900/60 hover:bg-neutral-900/90 text-white backdrop-blur-md opacity-25 hover:opacity-100 disabled:opacity-0 transition-all cursor-pointer shadow-xl border border-white/10"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            {viewMode === 'continuous' ? (
              // Continuous Vertical Scroll with Windowed Virtualization
              <div className="flex flex-col items-center">
                {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                  <PageSlot
                    key={pageNum}
                    pageNum={pageNum}
                    isNear={Math.abs(pageNum - currentPage) <= 4}
                    doc={doc}
                    scale={zoom}
                    theme={theme}
                    annotations={annotations}
                    onDeleteAnnotation={handleDeleteAnnotation}
                    baseAspectRatio={baseAspectRatio}
                    basePageWidth={basePageSize.width}
                    basePageHeight={basePageSize.height}
                    searchQuery={searchQuery}
                    isCurrentSearchPage={activeSearchPage === pageNum}
                    onPageVisible={(visiblePage) => {
                      setCurrentPage(visiblePage);
                      if (docTitle) {
                        localStorage.setItem(`otium_page_${docTitle}`, visiblePage.toString());
                      }
                    }}
                  />
                ))}
              </div>
            ) : viewMode === 'dual' ? (
              // Authentic Dual-Page Book Spread with Flip Animation
              <div className="min-h-full flex items-center justify-center py-2 sm:py-4 overflow-hidden">
                <div
                  key={dualFlipKey}
                  className="flex flex-row items-center justify-center gap-1 sm:gap-2 shadow-2xl"
                  style={{
                    transform: isDraggingTouch && touchDeltaX !== 0 ? `translateX(${touchDeltaX}px)` : undefined,
                    animation: !isDraggingTouch && dualFlipKey > 0
                      ? `dualPageFlip${dualFlipDir === 'forward' ? 'Forward' : 'Backward'} 280ms cubic-bezier(0.16, 1, 0.3, 1) both`
                      : undefined,
                  }}
                >
                  {/* Left Page (currentPage) */}
                  <div className="relative">
                    <PdfPage
                      key={`dual-page-${currentPage}`}
                      doc={doc}
                      pageNumber={currentPage}
                      scale={zoom}
                      theme={theme}
                      annotations={annotations}
                      onDeleteAnnotation={handleDeleteAnnotation}
                      baseAspectRatio={baseAspectRatio}
                      searchQuery={searchQuery}
                      isCurrentSearchPage={activeSearchPage === currentPage}
                    />
                  </div>

                  {/* Right Page (currentPage + 1 if available) */}
                  {currentPage + 1 <= numPages ? (
                    <div className="relative border-l border-neutral-700/20">
                      <PdfPage
                        key={`dual-page-${currentPage + 1}`}
                        doc={doc}
                        pageNumber={currentPage + 1}
                        scale={zoom}
                        theme={theme}
                        annotations={annotations}
                        onDeleteAnnotation={handleDeleteAnnotation}
                        baseAspectRatio={baseAspectRatio}
                        searchQuery={searchQuery}
                        isCurrentSearchPage={activeSearchPage === currentPage + 1}
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        width: Math.round(basePageSize.width * zoom),
                        height: Math.round(basePageSize.height * zoom),
                      }}
                      className="hidden sm:flex items-center justify-center border border-dashed border-white/10 rounded-xs text-xs text-neutral-500 font-mono"
                    >
                      {lang === 'ar' ? 'نهاية المستند' : 'End of Document'}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // Single Page Mode - Instant, Centered, 0 Lag, 0 Annoying Slide
              <div
                style={{
                  transform: isDraggingTouch && touchDeltaX !== 0 ? `translateX(${touchDeltaX}px)` : undefined,
                }}
                className="min-h-full flex items-center justify-center py-2 sm:py-4"
              >
                <PdfPage
                  key={`single-page-${currentPage}`}
                  doc={doc}
                  pageNumber={currentPage}
                  scale={zoom}
                  theme={theme}
                  annotations={annotations}
                  onDeleteAnnotation={handleDeleteAnnotation}
                  baseAspectRatio={baseAspectRatio}
                  searchQuery={searchQuery}
                  isCurrentSearchPage={activeSearchPage === currentPage}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentFont={fontFamily}
        onFontChange={(newFont) => {
          setFontFamily(newFont);
          saveFont(newFont);
        }}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        lang={lang}
        onResetDefaults={() => {
          setFontFamily('tajawal');
          saveFont('tajawal');
          setViewMode('continuous');
          setTheme('paper');
        }}
      />

      {/* Password Modal */}
      <PasswordModal
        isOpen={passwordModal.isOpen}
        isIncorrect={passwordModal.isIncorrect}
        docTitle={passwordModal.title}
        lang={lang}
        onSubmit={handlePasswordSubmit}
        onCancel={handlePasswordCancel}
      />

      {/* Global Loading Spinner */}
      {isLoading && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center text-white">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-3" />
          <span className="text-xs font-mono tracking-widest uppercase text-amber-200">
            OTIUM • LOADING DOCUMENT
          </span>
        </div>
      )}
    </div>
  );
};

export default App;
