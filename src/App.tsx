import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pdfjsLib } from './utils/pdfWorker';
import { ambientAudio } from './utils/ambientAudio';
import type { ThemeMode, ViewMode, RecentDoc } from './types';
import { WelcomeScreen } from './components/WelcomeScreen';
import { Toolbar } from './components/Toolbar';
import { PdfPage } from './components/PdfPage';
import { FocusRuler } from './components/FocusRuler';
import { Sidebar } from './components/Sidebar';
import { ShortcutsModal } from './components/ShortcutsModal';

interface PageSlotProps {
  pageNum: number;
  isNear: boolean;
  doc: PDFDocumentProxy;
  scale: number;
  theme: ThemeMode;
  baseAspectRatio: number;
  onPageVisible: (num: number) => void;
}

const PageSlot: React.FC<PageSlotProps> = ({
  pageNum,
  isNear,
  doc,
  scale,
  theme,
  baseAspectRatio,
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
          baseAspectRatio={baseAspectRatio}
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
    return (localStorage.getItem('vibe_theme') as ThemeMode) || 'paper';
  });
  const [baseAspectRatio, setBaseAspectRatio] = useState<number>(0.707);
  const [viewMode, setViewMode] = useState<ViewMode>('continuous');
  const [isFocusRulerActive, setIsFocusRulerActive] = useState<boolean>(false);
  const [isAmbientActive, setIsAmbientActive] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Save theme preference
  const handleThemeChange = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    localStorage.setItem('vibe_theme', newTheme);
  };

  // Load document from Uint8Array / ArrayBuffer
  const loadPdfData = async (data: ArrayBuffer, title: string) => {
    setIsLoading(true);
    try {
      const baseUrl = window.location.origin;
      const loadingTask = pdfjsLib.getDocument({
        data,
        cMapUrl: `${baseUrl}/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${baseUrl}/standard_fonts/`,
        wasmUrl: `${baseUrl}/wasm/`,
        enableXfa: true,
      });
      const loadedDoc = await loadingTask.promise;
      setDoc(loadedDoc);
      setDocTitle(title);
      setNumPages(loadedDoc.numPages);

      try {
        const p1 = await loadedDoc.getPage(1);
        const vp = p1.getViewport({ scale: 1 });
        if (vp.width && vp.height) {
          setBaseAspectRatio(vp.width / vp.height);
        }
      } catch {
        // default 0.707
      }

      // Check last saved page
      const stored = localStorage.getItem(`vibe_page_${title}`);
      const savedPage = stored ? parseInt(stored, 10) : 1;
      const initialPage = savedPage > 0 && savedPage <= loadedDoc.numPages ? savedPage : 1;
      setCurrentPage(initialPage);

      // Save to recents
      updateRecents(title, initialPage, loadedDoc.numPages);

      // Scroll to saved page if not page 1
      if (initialPage > 1) {
        setTimeout(() => {
          scrollToPage(initialPage);
        }, 400);
      }
    } catch (err) {
      console.error('Error loading PDF:', err);
      alert('تعذر فتح ملف الـ PDF. يرجى التأكد من سلامة الملف.');
    } finally {
      setIsLoading(false);
    }
  };

  const updateRecents = (name: string, page: number, total: number) => {
    try {
      const stored = localStorage.getItem('vibe_recent_docs');
      let recents: RecentDoc[] = stored ? JSON.parse(stored) : [];
      recents = recents.filter((r) => r.name !== name);
      recents.unshift({
        id: name + '_' + Date.now(),
        name,
        lastOpened: Date.now(),
        lastPage: page,
        totalPages: total
      });
      localStorage.setItem('vibe_recent_docs', JSON.stringify(recents.slice(0, 5)));
    } catch {
      // ignore
    }
  };

  // Open local file
  const handleOpenFile = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    loadPdfData(arrayBuffer, file.name);
  };

  // Open sample book
  const handleOpenSample = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/sample.pdf');
      const arrayBuffer = await res.arrayBuffer();
      loadPdfData(arrayBuffer, 'The Art of Vibe Reading.pdf');
    } catch (err) {
      console.error('Error loading sample:', err);
      alert('تعذر تحميل كتاب العينة.');
      setIsLoading(false);
    }
  };

  // Jump to specific page
  const scrollToPage = useCallback((pageNumber: number) => {
    setCurrentPage(pageNumber);
    if (docTitle) {
      localStorage.setItem(`vibe_page_${docTitle}`, pageNumber.toString());
      updateRecents(docTitle, pageNumber, numPages);
    }

    if (viewMode === 'continuous') {
      const targetEl = document.getElementById(`pdf-page-${pageNumber}`);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [docTitle, numPages, viewMode]);

  // Handle ambient rain sound
  const handleToggleAmbient = () => {
    const active = ambientAudio.toggle();
    setIsAmbientActive(active);
  };

  // Handle Fullscreen
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement) return;

      switch (e.key.toLowerCase()) {
        case 'j':
        case 'arrowdown':
          if (viewMode === 'single') {
            scrollToPage(Math.min(numPages, currentPage + 1));
          } else {
            scrollContainerRef.current?.scrollBy({ top: 180, behavior: 'smooth' });
          }
          break;
        case 'k':
        case 'arrowup':
          if (viewMode === 'single') {
            scrollToPage(Math.max(1, currentPage - 1));
          } else {
            scrollContainerRef.current?.scrollBy({ top: -180, behavior: 'smooth' });
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
          const themes: ThemeMode[] = ['paper', 'midnight', 'eink', 'amber', 'pure'];
          const nextIdx = (themes.indexOf(theme) + 1) % themes.length;
          handleThemeChange(themes[nextIdx]);
          break;
        }
        case 'r':
          setIsFocusRulerActive((prev) => !prev);
          break;
        case 'f':
          handleToggleFullscreen();
          break;
        case 's':
          setIsSidebarOpen((prev) => !prev);
          break;
        case '?':
          setIsShortcutsOpen((prev) => !prev);
          break;
        case 'escape':
          setIsSidebarOpen(false);
          setIsShortcutsOpen(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [numPages, currentPage, viewMode, theme, scrollToPage]);

  // Handle global drag & drop
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
        return '#080c14';
      case 'eink':
        return '#dfdfdf';
      case 'amber':
        return '#14100c';
      case 'pure':
      default:
        return '#f1f5f9';
    }
  };

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden flex flex-col font-sans transition-colors duration-500 theme-${theme}`}
      style={{ backgroundColor: getContainerBg() }}
    >
      {/* If No document is opened, show Welcome Screen */}
      {!doc ? (
        <WelcomeScreen
          onOpenFile={handleOpenFile}
          onOpenSample={handleOpenSample}
          onOpenRecent={(recent) => {
            if (recent.name === 'The Art of Vibe Reading.pdf') {
              handleOpenSample();
            } else {
              alert('يرجى سحب وإفلات الملف لإعادة فتحه من محله.');
            }
          }}
        />
      ) : (
        <>
          {/* Subtle Ambient Top Progress Line */}
          <div className="fixed top-0 inset-x-0 h-1 bg-black/10 dark:bg-white/10 z-40">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-300"
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
            isFocusRulerActive={isFocusRulerActive}
            isAmbientActive={isAmbientActive}
            isFullscreen={isFullscreen}
            onPageChange={scrollToPage}
            onZoomChange={setZoom}
            onThemeChange={handleThemeChange}
            onViewModeChange={setViewMode}
            onToggleFocusRuler={() => setIsFocusRulerActive((prev) => !prev)}
            onToggleAmbient={handleToggleAmbient}
            onToggleFullscreen={handleToggleFullscreen}
            onToggleSidebar={() => setIsSidebarOpen(true)}
            onToggleShortcuts={() => setIsShortcutsOpen(true)}
            onCloseDocument={() => {
              setDoc(null);
              setDocTitle('');
            }}
          />

          {/* Reading Focus Ruler */}
          <FocusRuler active={isFocusRulerActive} />

          {/* Sidebar Drawer */}
          <Sidebar
            isOpen={isSidebarOpen}
            doc={doc}
            totalPages={numPages}
            currentPage={currentPage}
            onSelectPage={scrollToPage}
            onClose={() => setIsSidebarOpen(false)}
          />

          {/* Shortcuts Modal */}
          <ShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />

          {/* Main Reading Canvas Area */}
          <div
            ref={scrollContainerRef}
            className="flex-1 w-full h-full overflow-y-auto overflow-x-hidden pt-16 pb-24 px-4"
          >
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
                    baseAspectRatio={baseAspectRatio}
                    onPageVisible={(visiblePage) => {
                      setCurrentPage(visiblePage);
                      if (docTitle) {
                        localStorage.setItem(`vibe_page_${docTitle}`, visiblePage.toString());
                      }
                    }}
                  />
                ))}
              </div>
            ) : (
              // Single Page Presentation Mode
              <div className="min-h-full flex items-center justify-center">
                <PdfPage
                  key={currentPage}
                  doc={doc}
                  pageNumber={currentPage}
                  scale={zoom}
                  theme={theme}
                  baseAspectRatio={baseAspectRatio}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* Global Loading Spinner */}
      {isLoading && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center text-white">
          <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mb-3" />
          <span className="text-sm font-medium tracking-wide">جارٍ تحميل كتابك الهادئ...</span>
        </div>
      )}
    </div>
  );
};

export default App;
