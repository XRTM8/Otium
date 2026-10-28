import React, { Suspense, useEffect, useState } from 'react';
import { useReaderController } from '../app/useReaderController';
import { getThemeBackground } from '../app/themeBackground';
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
      className={`relative w-screen h-screen overflow-hidden flex flex-col font-sans transition-colors duration-300 theme-${reader.theme}`}
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
          <ScannerModal
            isOpen={isScannerOpen}
            theme={reader.theme}
            lang={reader.lang}
            onClose={() => setIsScannerOpen(false)}
            onPdfGenerated={(file) => reader.openFile(file)}
          />
        )}
      </Suspense>
    </div>
  );
};
