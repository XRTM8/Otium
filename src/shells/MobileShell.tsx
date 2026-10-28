import React, { Suspense, useState } from 'react';
import { useReaderController } from '../app/useReaderController';
import { getThemeBackground } from '../app/themeBackground';
import { MobileToolbar } from '../components/MobileToolbar';
import { ReaderOverlays } from '../components/ReaderOverlays';
import { ReaderWorkspace } from '../components/ReaderWorkspace';
import { TextSelectionMenu } from '../components/TextSelectionMenu';
import { WelcomeScreen } from '../components/WelcomeScreen';

const ScannerModal = React.lazy(() =>
  import('../scanner/ScannerModal').then((m) => ({ default: m.ScannerModal }))
);

/** Android shell: touch-first bars, swipe gestures and no keyboard shortcuts. */
export const MobileShell: React.FC = () => {
  const reader = useReaderController({ keyboard: false, dragDrop: false });
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  return (
    <div
      className={`relative w-full h-screen overflow-hidden flex flex-col font-sans transition-colors duration-300 theme-${reader.theme}`}
      style={{ backgroundColor: getThemeBackground(reader.theme), height: '100dvh' }}
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
          <MobileToolbar
            title={reader.docTitle}
            currentPage={reader.currentPage}
            totalPages={reader.numPages}
            theme={reader.theme}
            viewMode={reader.viewMode}
            currentLang={reader.lang}
            isBookmarked={reader.bookmarks.some(
              (bookmark) => bookmark.pageNumber === reader.currentPage
            )}
            showBottomBar={reader.showMobileNavBar}
            immersive={reader.isImmersive}
            onPageChange={reader.scrollToPage}
            onThemeChange={reader.changeTheme}
            onViewModeChange={reader.changeViewMode}
            onToggleBookmark={() => reader.toggleBookmark(reader.currentPage)}
            onToggleSearch={() => reader.setIsSearchOpen((open) => !open)}
            onOpenSidebar={() => reader.setIsSidebarOpen(true)}
            onOpenSettings={() => reader.setIsSettingsOpen(true)}
            onOpenScanner={() => setIsScannerOpen(true)}
            onCloseDocument={reader.closeDocument}
          />

          <TextSelectionMenu
            onAddAnnotation={reader.addAnnotation}
            onDeleteAnnotation={reader.deleteAnnotation}
            annotations={reader.annotations}
            lang={reader.lang}
            onSearchSelectedText={reader.openSearchWithText}
            mobile
          />

          <ReaderWorkspace reader={reader} compact />
        </>
      )}

      <ReaderOverlays reader={reader} mobile />

      <Suspense fallback={null}>
        {isScannerOpen && (
          <ScannerModal
            isOpen={isScannerOpen}
            onClose={() => setIsScannerOpen(false)}
            onPdfGenerated={(file) => reader.openFile(file)}
          />
        )}
      </Suspense>
    </div>
  );
};
