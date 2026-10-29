import React, { Suspense, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useReaderController } from '../app/useReaderController';
import { getThemeBackground } from '../app/themeBackground';
import { registerBackHandler } from '../core/navigation/backHandler';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ReaderOverlays } from '../components/ReaderOverlays';
import { ReaderWorkspace } from '../components/ReaderWorkspace';
import { TextSelectionMenu } from '../components/TextSelectionMenu';
import { Toolbar } from '../components/Toolbar';
import { WelcomeScreen } from '../components/WelcomeScreen';

const ScannerModal = React.lazy(() =>
  import('../scanner/ScannerModal').then((m) => ({ default: m.ScannerModal }))
);
const preloadScanner = () => import('../scanner/ScannerModal');

/** Windows shell: floating desktop toolbar, keyboard shortcuts and drag/drop. */
export const DesktopShell: React.FC = () => {
  const reader = useReaderController({ keyboard: true, dragDrop: true });
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Fallback Escape / back handler while scanner modal is active or lazy-loading
  useEffect(() => {
    if (!isScannerOpen) return;
    return registerBackHandler(() => {
      setIsScannerOpen(false);
      return true;
    });
  }, [isScannerOpen]);

  // Preload scanner code during idle moments so opening is instantaneous
  useEffect(() => {
    let timer: any = null;
    if (typeof window !== 'undefined') {
      const win = window as any;
      if (typeof win.requestIdleCallback === 'function') {
        win.requestIdleCallback(() => {
          void preloadScanner();
        });
      } else {
        timer = win.setTimeout(() => void preloadScanner(), 1500);
      }
    }
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+S / Cmd+Shift+S: global quick toggle for the scanner.
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        setIsScannerOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden flex flex-col font-sans theme-${reader.theme}`}
      style={{ backgroundColor: getThemeBackground(reader.theme) }}
    >
      {!reader.doc ? (
        <WelcomeScreen
          currentTheme={reader.theme}
          currentLang={reader.lang}
          onThemeChange={reader.changeTheme}
          onToggleLanguage={reader.changeLanguage}
          onOpenSettings={() => reader.setIsSettingsOpen(true)}
          onOpenFile={reader.openFile}
          onOpenSample={reader.openSample}
          onOpenRecent={reader.openRecent}
          onOpenScanner={() => setIsScannerOpen(true)}
        />
      ) : (
        <>
          <Toolbar
            title={reader.docTitle}
            currentPage={reader.currentPage}
            totalPages={reader.numPages}
            zoom={reader.zoom}
            theme={reader.theme}
            viewMode={reader.viewMode}
            currentLang={reader.lang}
            isFullscreen={reader.isFullscreen}
            isBookmarked={reader.bookmarks.some(
              (bookmark) => bookmark.pageNumber === reader.currentPage
            )}
            onPageChange={reader.scrollToPage}
            onPrevPage={reader.goToPrevPage}
            onNextPage={reader.goToNextPage}
            onZoomChange={reader.setZoom}
            onThemeChange={reader.changeTheme}
            onViewModeChange={reader.changeViewMode}
            onToggleBookmark={() => reader.toggleBookmark(reader.currentPage)}
            onToggleFullscreen={reader.handleToggleFullscreen}
            onToggleSidebar={() => reader.setIsSidebarOpen(true)}
            onToggleSearch={() => reader.setIsSearchOpen((open) => !open)}
            onToggleSettings={() => reader.setIsSettingsOpen(true)}
            onOpenScanner={() => setIsScannerOpen(true)}
            onCloseDocument={reader.closeDocument}
            onRenameTitle={reader.renameDocument}
            annotationsCount={reader.annotations.length}
            bookmarksCount={reader.bookmarks.length}
            fileSizeBytes={reader.fileSizeBytes}
            pageDimensions={reader.basePageSize}
          />

          <TextSelectionMenu
            onAddAnnotation={reader.addAnnotation}
            onDeleteAnnotation={reader.deleteAnnotation}
            annotations={reader.annotations}
            lang={reader.lang}
            onSearchSelectedText={reader.openSearchWithText}
          />

          <ReaderWorkspace reader={reader} />
        </>
      )}

      <ReaderOverlays reader={reader} />

      <Suspense fallback={null}>
        {isScannerOpen && (
          <ErrorBoundary
            fallback={(_err, reset) => (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 select-none backdrop-blur-sm">
                <div className="chrome-surface flex max-w-sm flex-col items-center gap-3 rounded-2xl p-6 text-center text-ink shadow-2xl border border-line">
                  <div className="w-12 h-12 rounded-xl bg-danger-ink/10 flex items-center justify-center text-danger-ink">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-sm">
                    {reader.lang === 'ar' ? 'تعذر تشغيل الماسح الضوئي' : 'Scanner Error'}
                  </h3>
                  <p className="text-xs text-ink-muted leading-relaxed">
                    {reader.lang === 'ar'
                      ? 'حدث خطأ غير متوقع أثناء تشغيل الماسح. يمكنك إعادة المحاولة أو العودة للقارئ.'
                      : 'An unexpected scanner error occurred. You can retry or return to the reader.'}
                  </p>
                  <div className="flex items-center gap-2 mt-2 w-full">
                    <button
                      type="button"
                      onClick={() => setIsScannerOpen(false)}
                      className="flex-1 px-3 py-2 rounded-xl bg-hover border border-line text-xs font-medium text-ink cursor-pointer hover:bg-hover-strong transition-colors"
                    >
                      {reader.lang === 'ar' ? 'العودة للقارئ' : 'Back to Reader'}
                    </button>
                    <button
                      type="button"
                      onClick={reset}
                      className="flex-1 px-3 py-2 rounded-xl bg-accent text-on-accent text-xs font-medium cursor-pointer hover:bg-accent-strong transition-colors"
                    >
                      {reader.lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          >
            <ScannerModal
              isOpen={isScannerOpen}
              theme={reader.theme}
              lang={reader.lang}
              onClose={() => setIsScannerOpen(false)}
              onPdfGenerated={(file) => reader.openFile(file)}
            />
          </ErrorBoundary>
        )}
      </Suspense>
    </div>
  );
};
