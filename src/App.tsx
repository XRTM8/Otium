import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  searchQuery,
  isCurrentSearchPage,
  onPageVisible
}) => {
  const slotRef = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(isNear);

  useEffect(() => {
    if (isNear) {
      setShouldRender(true);
    }
  }, [isNear]);

  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onPageVisible(pageNum);
          setShouldRender(true);
        }
      },
      {
        rootMargin: '300px 0px 300px 0px',
        threshold: 0.01
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [pageNum, onPageVisible]);

  const standardWidth = Math.round(600 * scale);
  const standardHeight = Math.round(standardWidth / (baseAspectRatio || 0.707));

  return (
    <div
      ref={slotRef}
      id={`pdf-page-${pageNum}`}
      dir="ltr"
      style={{
        minWidth: `${standardWidth}px`,
        minHeight: `${standardHeight}px`
      }}
      className="my-5 mx-auto flex items-center justify-center will-change-transform"
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

export const App: React.FC = () => {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [docTitle, setDocTitle] = useState<string>('');
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1.15);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    return (
      (localStorage.getItem('otium_theme') as ThemeMode) ||
      (localStorage.getItem('tirs_theme') as ThemeMode) ||
      'paper'
    );
  });

  const [baseAspectRatio, setBaseAspectRatio] = useState<number>(0.707);
  const [viewMode, setViewMode] = useState<ViewMode>('continuous');
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

  // Page Turn Animation state
  const [pageSlideDir, setPageSlideDir] = useState<'next' | 'prev' | null>(null);
  const [touchDeltaX, setTouchDeltaX] = useState<number>(0);
  const [isDraggingTouch, setIsDraggingTouch] = useState<boolean>(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const scrollToPage = useCallback((pageNumber: number) => {
    if (pageNumber !== currentPage && viewMode === 'single') {
      setPageSlideDir(pageNumber > currentPage ? 'next' : 'prev');
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
  }, [currentPage, docTitle, viewMode]);

  const goToNextPage = useCallback(() => {
    if (currentPage < numPages) {
      setPageSlideDir('next');
      scrollToPage(currentPage + 1);
    }
  }, [currentPage, numPages, scrollToPage]);

  const goToPrevPage = useCallback(() => {
    if (currentPage > 1) {
      setPageSlideDir('prev');
      scrollToPage(currentPage - 1);
    }
  }, [currentPage, scrollToPage]);

  const lastWheelTimeRef = useRef<number>(0);
  const handleWheel = (e: React.WheelEvent) => {
    if (viewMode === 'single') {
      const now = Date.now();
      if (now - lastWheelTimeRef.current < 350) return;
      if (Math.abs(e.deltaY) > 25) {
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
    if (e.touches.length === 1 && viewMode === 'single') {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      setIsDraggingTouch(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current !== null && isDraggingTouch && viewMode === 'single') {
      const dx = e.touches[0].clientX - touchStartX.current;
      const dy = e.touches[0].clientY - (touchStartY.current || 0);
      if (Math.abs(dx) > Math.abs(dy)) {
        setTouchDeltaX(dx);
      }
    }
  };

  const handleTouchEnd = () => {
    setIsDraggingTouch(false);
    if (touchStartX.current === null) return;
    const deltaX = touchDeltaX;

    if (viewMode === 'single' && Math.abs(deltaX) > 40) {
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

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 640 && doc) {
        doc.getPage(1).then((p) => {
          const vp = p.getViewport({ scale: 1 });
          const mobileTarget = window.innerWidth - 16;
          const mobileScale = Math.min(1.1, Math.max(0.4, Number((mobileTarget / vp.width).toFixed(2))));
          setZoom(mobileScale);
        }).catch(() => {});
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [doc]);

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
          const screenWidth = window.innerWidth;
          if (screenWidth < 640) {
            const mobileTarget = screenWidth - 16;
            const mobileScale = Math.min(1.1, Math.max(0.4, Number((mobileTarget / vp.width).toFixed(2))));
            setZoom(mobileScale);
          } else if (screenWidth < 1024) {
            const tabletTarget = Math.min(screenWidth - 36, 750);
            const tabletScale = Math.min(1.2, Math.max(0.6, Number((tabletTarget / vp.width).toFixed(2))));
            setZoom(tabletScale);
          } else {
            setZoom(1.15);
          }
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

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => e.preventDefault();
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          handleOpenFile(file);
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
            onPageChange={scrollToPage}
            onZoomChange={setZoom}
            onThemeChange={handleThemeChange}
            onViewModeChange={setViewMode}
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
            onSelectPage={scrollToPage}
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
            className="flex-1 w-full h-full overflow-y-auto overflow-x-auto pt-14 sm:pt-16 pb-20 sm:pb-24 px-2 sm:px-4 relative"
          >
            {/* Quick-Flip Side Navigation Buttons (Single Mode) */}
            {viewMode === 'single' && (
              <>
                <button
                  type="button"
                  onClick={goToPrevPage}
                  disabled={currentPage <= 1}
                  title="الصفحة السابقة"
                  className="fixed left-2 sm:left-5 top-1/2 -translate-y-1/2 z-30 p-2 sm:p-2.5 rounded-full bg-neutral-900/60 hover:bg-neutral-900/90 text-white backdrop-blur-md opacity-25 hover:opacity-100 disabled:opacity-0 transition-all cursor-pointer shadow-xl border border-white/10"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={goToNextPage}
                  disabled={currentPage >= numPages}
                  title="الصفحة التالية"
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
            ) : (
              // Single Page Presentation Mode with Kinetic Slide Animation
              <div
                key={currentPage}
                onAnimationEnd={() => setPageSlideDir(null)}
                style={{
                  transform: isDraggingTouch && touchDeltaX !== 0 ? `translateX(${touchDeltaX}px)` : undefined,
                  transition: isDraggingTouch ? 'none' : undefined,
                }}
                className={`min-h-full flex items-center justify-center will-change-transform ${
                  pageSlideDir === 'next'
                    ? 'animate-page-slide-next'
                    : pageSlideDir === 'prev'
                    ? 'animate-page-slide-prev'
                    : ''
                }`}
              >
                <PdfPage
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
        onViewModeChange={setViewMode}
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
