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
import { TeachingProvider } from '../components/TeachingContext';
import { useTeaching } from '../components/teachingContextValue';
import { DocumentInkProvider } from '../components/DocumentInk';
import { useMobileFullscreen } from '../platform/useMobileFullscreen';
import { useBeamRemoteKeys } from '../board/beam/useBeamRemoteKeys';
import { beamService } from '../board/beam/beamService';
import { useDeviceUsage } from '../platform/deviceUsage';
import type { BoardSnippet } from '../board/types';
import { useAppMedia } from '../media/useAppMedia';
const MediaWorkspace = React.lazy(() => import('../media/MediaWorkspace').then(module => ({ default: module.MediaWorkspace })));
const BoardSplitWorkspace = React.lazy(() => import('../board/components/BoardSplitWorkspace').then(module => ({ default: module.BoardSplitWorkspace })));
const BeamModal = React.lazy(() => import('../board/beam/BeamModal').then(module => ({ default: module.BeamModal })));

const ScannerModal = React.lazy(() =>
  import('../scanner/ScannerModal').then((m) => ({ default: m.ScannerModal }))
);
const preloadScanner = () => import('../scanner/ScannerModal');

function makeScannerErrorFallback(lang: 'ar' | 'en', onClose: () => void) {
  return (_err: Error, reset: () => void) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 select-none backdrop-blur-sm">
      <div className="chrome-surface flex max-w-sm flex-col items-center gap-3 rounded-2xl p-6 text-center text-ink shadow-2xl border border-line">
        <div className="w-12 h-12 rounded-xl bg-danger-ink/10 flex items-center justify-center text-danger-ink">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="font-bold text-sm">
          {lang === 'ar' ? 'تعذر تشغيل الماسح الضوئي' : 'Scanner Error'}
        </h3>
        <p className="text-xs text-ink-muted leading-relaxed">
          {lang === 'ar'
            ? 'حدث خطأ غير متوقع أثناء تشغيل الماسح. يمكنك إعادة المحاولة أو العودة للقارئ.'
            : 'An unexpected scanner error occurred. You can retry or return to the reader.'}
        </p>
        <div className="flex items-center gap-2 mt-2 w-full">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-3 py-2 rounded-xl bg-hover border border-line text-xs font-medium text-ink cursor-pointer hover:bg-hover-strong transition-colors"
          >
            {lang === 'ar' ? 'العودة للقارئ' : 'Back to Reader'}
          </button>
          <button
            type="button"
            onClick={reset}
            className="flex-1 px-3 py-2 rounded-xl bg-accent text-on-accent text-xs font-medium cursor-pointer hover:bg-accent-strong transition-colors"
          >
            {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Android shell: touch-first bars, swipe gestures and no keyboard shortcuts. */
export const MobileShell: React.FC = () => {
  const { compact } = useDeviceUsage();
  return <TeachingProvider mobile={compact}><MobileReader /></TeachingProvider>;
};
const MobileReader: React.FC = () => {
  const teaching = useTeaching();
  const { receiver } = useDeviceUsage();
  const reader = useReaderController({ keyboard: false, dragDrop: false });
  const media = useAppMedia(reader);
  const { setPresentation, setReaderTools, setLayout, setTarget, presentation, layout } = teaching;
  const { boardEnabled } = teaching.prefs;
  const { isImmersive, setIsImmersive } = reader;
  useMobileFullscreen();
  React.useEffect(() => {
    setPresentation(isImmersive);
    setReaderTools(!isImmersive);
  }, [isImmersive, setPresentation, setReaderTools]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isBeamOpen, setIsBeamOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      return hash.includes('room=') || hash.includes('beam') || search.includes('room=') || search.includes('beam');
    } catch {
      return false;
    }
  });
  const [snippets, setSnippets] = useState<BoardSnippet[]>([]);
  useBeamRemoteKeys(reader, Boolean(media.active), isScannerOpen || reader.isSettingsOpen || reader.isSearchOpen ||
    reader.isSidebarOpen || reader.passwordModal.isOpen || (isBeamOpen && Boolean(reader.doc)));
  const isBoardOpen = teaching.prefs.boardEnabled && teaching.layout !== 'document';
  const setBoardOpen = React.useCallback((open: boolean) => {
    if (!boardEnabled) return;
    setLayout(open ? 'split' : 'document');
    setTarget(open ? 'board' : 'document');
    if (!open) setReaderTools(true);
  }, [boardEnabled, setLayout, setTarget, setReaderTools]);
  React.useEffect(() => registerBackHandler(() => {
    if (presentation || isImmersive) {
      setPresentation(false); setReaderTools(true); setIsImmersive(false); return true;
    }
    if (layout !== 'document') { setLayout('document'); return true; }
    return false;
  }), [presentation, layout, setPresentation, setReaderTools, setLayout, isImmersive, setIsImmersive]);

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

  // Preload scanner chunk during idle moments so opening is 100% instant and lag-free
  React.useEffect(() => {
    let timer: number | null = null;
    if (typeof window !== 'undefined') {
      const win = window as Window & {
        requestIdleCallback?: (cb: () => void) => number;
      };
      if (typeof win.requestIdleCallback === 'function') {
        win.requestIdleCallback(() => {
          void preloadScanner();
        });
      } else {
        timer = window.setTimeout(() => void preloadScanner(), 1200);
      }
    }
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  return (
    <DocumentInkProvider reader={reader}>
    <div
      className={`relative w-full h-screen overflow-hidden flex flex-col font-sans theme-${reader.theme} transition-colors duration-500 ease-out`}
      style={{ backgroundColor: getThemeBackground(reader.theme), height: '100dvh' }}
    >
      {media.active ? <Suspense fallback={<p className="m-auto text-ink-muted">جارٍ فتح الملف…</p>}>
        <MediaWorkspace key={media.active.item.id} source={media.active} reader={reader}
          onClose={() => void media.close()} onOpen={file => void media.open(file)}
          onProgress={media.updateProgress} onOpenBeam={() => setIsBeamOpen(true)}
          remotePage={media.beam.remotePage} enableVolumePages={!isBeamOpen} />
      </Suspense> : !reader.doc ? (
        <WelcomeScreen
          currentTheme={reader.theme}
          currentLang={reader.lang}
          onThemeChange={reader.changeTheme}
          onToggleLanguage={reader.changeLanguage}
          onOpenSettings={() => reader.setIsSettingsOpen(true)}
          onOpenFile={media.open}
          onOpenSample={reader.openSample}
          onOpenRecent={media.openRecent}
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
            onToggleBoard={teaching.prefs.boardEnabled ? () => setBoardOpen(!isBoardOpen) : undefined}
            isBoardOpen={isBoardOpen}
            isBeaming={reader.beamPeerConnected}
            beamRoom={beamService.isLanSession() ? 'LAN' : reader.beamRoom}
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
            mobile={teaching.mobile}
          />

          {teaching.prefs.boardEnabled ? (
            <Suspense fallback={<ReaderWorkspace reader={reader} compact={teaching.mobile} />}>
              <BoardSplitWorkspace
                reader={reader}
                snippets={snippets} onRestoreSnippets={setSnippets}
                onAddSnippet={snippet => { setSnippets(previous => [...previous, snippet]); setBoardOpen(true); }}
                onRemoveSnippet={id => setSnippets(previous => previous.filter(snippet => snippet.id !== id))}
                onUpdateSnippetPosition={(id, x, y) => setSnippets(previous => previous.map(snippet => snippet.id === id ? { ...snippet, x, y } : snippet))}
              />
            </Suspense>
          ) : <ReaderWorkspace reader={reader} compact={teaching.mobile} />}
        </>
      )}

      <ReaderOverlays reader={reader} mobile={teaching.mobile} />
      {media.pending && !reader.passwordModal.isOpen && <div role="status" className="fixed inset-0 z-[60] flex items-center justify-center bg-scrim text-ink">{reader.lang === 'ar' ? 'جارٍ فتح الملف…' : 'Opening file…'}</div>}

      <Suspense fallback={null}>
        {isScannerOpen && (
          <ErrorBoundary
            fallback={makeScannerErrorFallback(reader.lang, () => setIsScannerOpen(false))}
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
      {isBeamOpen && (
        <Suspense fallback={null}>
          <BeamModal
            isOpen={isBeamOpen}
            lang={reader.lang}
            theme={reader.theme}
            reader={reader}
            mediaFile={media.beam.canSend ? media.active?.file : null}
            mediaError={media.beam.error}
            retryMedia={media.beam.retry}
            onOpenFile={media.open}
            formFactor="mobile"
            preferredRole={receiver ? 'receiver' : 'sender'}
            isBoardOpen={isBoardOpen}
            onSetBoardOpen={setBoardOpen}
            onClose={() => setIsBeamOpen(false)}
          />
        </Suspense>
      )}
    </div>
    </DocumentInkProvider>
  );
};
