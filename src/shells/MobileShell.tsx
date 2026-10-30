import React, { Suspense, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useReaderController } from '../app/useReaderController';
import { getThemeBackground } from '../app/themeBackground';
import { registerBackHandler } from '../core/navigation/backHandler';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { MobileToolbar } from '../components/MobileToolbar';
import { ReaderOverlays } from '../components/ReaderOverlays';
import { ReaderWorkspace } from '../components/ReaderWorkspace';
import { TextSelectionMenu } from '../components/TextSelectionMenu';
import { WelcomeScreen } from '../components/WelcomeScreen';
import { BeamModal } from '../board/beam/BeamModal';
import { TeachingProvider, useTeaching } from '../components/TeachingContext';
import { DocumentInkProvider } from '../components/DocumentInk';
import { useMobileFullscreen } from '../platform/useMobileFullscreen';

const ScannerModal = React.lazy(() =>
  import('../scanner/ScannerModal').then((m) => ({ default: m.ScannerModal }))
);
const preloadScanner = () => import('../scanner/ScannerModal');

/** Android shell: touch-first bars, swipe gestures and no keyboard shortcuts. */
export const MobileShell: React.FC = () => <TeachingProvider mobile><MobileReader /></TeachingProvider>;
const MobileReader: React.FC = () => {
  const teaching = useTeaching();
  const reader = useReaderController({ keyboard: false, dragDrop: false });
  useMobileFullscreen();
  React.useEffect(() => {
    teaching.setPresentation(reader.isImmersive);
    teaching.setReaderTools(!reader.isImmersive);
  }, [reader.isImmersive, teaching.setPresentation, teaching.setReaderTools]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isBeamOpen, setIsBeamOpen] = useState(false);

  // Fallback hardware back handler for mobile shell while scanner modal is active or lazy-loading
  React.useEffect(() => {
    if (!isScannerOpen) return;
    return registerBackHandler(() => {
      setIsScannerOpen(false);
      return true;
    });
  }, [isScannerOpen]);

  // Hardware back handler for Otium Beam modal on mobile
  React.useEffect(() => {
    if (!isBeamOpen) return;
    return registerBackHandler(() => {
      setIsBeamOpen(false);
      return true;
    });
  }, [isBeamOpen]);

  // Automatically open Smart Beam if launched via QR room link (e.g. /#beam?room=OTM-XXXX)
  React.useEffect(() => {
    try {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      if (hash.includes('room=') || hash.includes('beam') || search.includes('room=') || search.includes('beam')) {
        setIsBeamOpen(true);
      }
    } catch {}
  }, []);

  // Preload scanner chunk during idle moments so opening is 100% instant and lag-free
  React.useEffect(() => {
    let timer: any = null;
    if (typeof window !== 'undefined') {
      const win = window as any;
      if (typeof win.requestIdleCallback === 'function') {
        win.requestIdleCallback(() => {
          void preloadScanner();
        });
      } else {
        timer = win.setTimeout(() => void preloadScanner(), 1200);
      }
    }
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, []);

  return (
    <DocumentInkProvider reader={reader}>
    <div
      className={`relative w-full h-screen overflow-hidden flex flex-col font-sans theme-${reader.theme}`}
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
          onOpenBeam={() => setIsBeamOpen(true)}
        />
      ) : (
        <>
          <div hidden={reader.isImmersive || !teaching.readerTools || teaching.presentation}><MobileToolbar
            title={reader.docTitle}
            currentPage={reader.currentPage}
            totalPages={reader.numPages}
            theme={reader.theme}
            viewMode={reader.viewMode}
            currentLang={reader.lang}
            readingDirection={reader.docIsRtl ? 'rtl' : 'ltr'}
            isBookmarked={reader.bookmarks.some(
              (bookmark) => bookmark.pageNumber === reader.currentPage
            )}
            showBottomBar={false}
            immersive={reader.isImmersive}
            onPageChange={reader.scrollToPage}
            onPrevPage={reader.goToPrevPage}
            onNextPage={reader.goToNextPage}
            onThemeChange={reader.changeTheme}
            onViewModeChange={reader.changeViewMode}
            onToggleBookmark={() => reader.toggleBookmark(reader.currentPage)}
            onToggleSearch={() => reader.setIsSearchOpen((open) => !open)}
            onOpenSidebar={() => reader.setIsSidebarOpen(true)}
            onOpenScanner={() => setIsScannerOpen(true)}
            onOpenBeam={() => setIsBeamOpen(true)}
            isBeaming={reader.beamPeerConnected}
            beamRoom={reader.beamRoom}
            beamRole={reader.beamRole}
            onDisconnectBeam={reader.disconnectBeam}
            onOpenSettings={() => reader.setIsSettingsOpen(true)}
            onCloseDocument={reader.closeDocument}
          /></div>

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

      {/* Otium Smart Beam Modal */}
      <BeamModal
        isOpen={isBeamOpen}
        lang={reader.lang}
        theme={reader.theme}
        reader={reader}
        formFactor="mobile"
        isBoardOpen={false}
        onSetBoardOpen={() => {}}
        onClose={() => setIsBeamOpen(false)}
      />
    </div>
    </DocumentInkProvider>
  );
};
