import React, { useEffect, useState, useCallback } from 'react';
import { Cast, Upload } from 'lucide-react';
import { useReaderController } from '../app/useReaderController';
import { getThemeBackground } from '../app/themeBackground';
import { isTauriRuntime } from '../platform/runtime';
import { invoke } from '@tauri-apps/api/core';
import { ReaderOverlays } from '../components/ReaderOverlays';
import { TextSelectionMenu } from '../components/TextSelectionMenu';
import { Toolbar } from '../components/Toolbar';
import { WelcomeScreen } from '../components/WelcomeScreen';
import { BoardSplitWorkspace } from '../board/components/BoardSplitWorkspace';
import { BeamModal } from '../board/beam/BeamModal';
import type { BoardSnippet } from '../board/types';

/** Windows shell: floating desktop toolbar, Otium Board split-screen studio, and Smart Beam. */
export const DesktopShell: React.FC = () => {
  const reader = useReaderController({ keyboard: true, dragDrop: false });
  const [isBoardOpen, setIsBoardOpen] = useState(false);
  const [isBeamOpen, setIsBeamOpen] = useState(false);
  const [snippets, setSnippets] = useState<BoardSnippet[]>([]);
  const [isDraggingOverWindow, setIsDraggingOverWindow] = useState(false);

  // Automatically open Smart Beam if launched via QR room link (e.g. /#beam?room=OTM-XXXX)
  useEffect(() => {
    try {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      if (hash.includes('room=') || hash.includes('beam') || search.includes('room=') || search.includes('beam')) {
        setIsBeamOpen(true);
      }
    } catch {}
  }, []);

  // Snippet management for Otium Whiteboard
  const handleAddSnippet = useCallback((snippet: BoardSnippet) => {
    setSnippets((prev) => [...prev, snippet]);
    setIsBoardOpen(true);
  }, []);

  const handleRemoveSnippet = useCallback((id: string) => {
    setSnippets((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleUpdateSnippetPosition = useCallback((id: string, x: number, y: number) => {
    setSnippets((prev) => prev.map((s) => (s.id === id ? { ...s, x, y } : s)));
  }, []);

  const handleClipTextToBoard = useCallback((text: string, pageNumber: number) => {
    const newSnippet: BoardSnippet = {
      id: `snippet-txt-${Date.now()}`,
      type: 'text',
      content: text,
      pageNumber,
      x: 30,
      y: 50,
      width: 300,
      height: 180,
      createdAt: Date.now()
    };
    handleAddSnippet(newSnippet);
  }, [handleAddSnippet]);

  // Window-level Drag and Drop with full visual dropzone overlay
  useEffect(() => {
    let dragCounter = 0;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer && (e.dataTransfer.types.includes('Files') || e.dataTransfer.files.length > 0)) {
        setIsDraggingOverWindow(true);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        setIsDraggingOverWindow(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setIsDraggingOverWindow(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        void reader.openFile(file);
      } else {
        reader.setDocumentError(reader.lang === 'ar' ? 'يرجى اختيار ملف PDF صالح.' : 'Please select a valid PDF file.');
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    // Tauri native OS file drop event listener
    let tauriUnlisten: (() => void) | undefined;
    if (isTauriRuntime()) {
      void import('@tauri-apps/api/webview').then(({ getCurrentWebview }) => {
        void getCurrentWebview().onDragDropEvent((event) => {
          const payload = event.payload;
          if (payload.type === 'enter' || payload.type === 'over') {
            setIsDraggingOverWindow(true);
          } else if (payload.type === 'leave') {
            setIsDraggingOverWindow(false);
          } else if (payload.type === 'drop') {
            setIsDraggingOverWindow(false);
            const filePath = payload.paths?.[0];
            if (filePath) {
              if (filePath.toLowerCase().endsWith('.pdf') || !filePath.includes('.')) {
                void invoke<ArrayBuffer | number[]>('read_pdf_bytes', { path: filePath })
                  .then((bytes) => {
                    const data = bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes as number[]).buffer;
                    const name = filePath.split(/[/\\]/).pop() || 'document.pdf';
                    void reader.loadDocumentBytes(data, name);
                  })
                  .catch((err) => {
                    console.error('Failed to read dropped file in Tauri:', err);
                    reader.setDocumentError(reader.lang === 'ar' ? 'تعذر فتح الملف المسحوب.' : 'Could not open dropped file.');
                  });
              } else {
                reader.setDocumentError(reader.lang === 'ar' ? 'يرجى اختيار ملف PDF صالح.' : 'Please select a valid PDF file.');
              }
            }
          }
        }).then((fn) => {
          tauriUnlisten = fn;
        });
      });
    }

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
      if (tauriUnlisten) tauriUnlisten();
    };
  }, [reader.openFile, reader.loadDocumentBytes]);

  // Global keyboard shortcuts: Ctrl+B / Cmd+B for Board toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setIsBoardOpen((open) => !open);
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
        <>
          <WelcomeScreen
            currentTheme={reader.theme}
            currentLang={reader.lang}
            onThemeChange={reader.changeTheme}
            onToggleLanguage={reader.changeLanguage}
            onOpenSettings={() => reader.setIsSettingsOpen(true)}
            onOpenFile={reader.openFile}
            onOpenSample={reader.openSample}
            onOpenRecent={reader.openRecent}
            onOpenBeam={() => setIsBeamOpen(true)}
          />
          {reader.isLoading && (
            <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center text-white select-none animate-in fade-in duration-200">
              <div className="w-16 h-16 rounded-3xl bg-accent/25 border border-accent/40 flex items-center justify-center mb-4 text-accent animate-pulse shadow-lg">
                <Cast className="w-8 h-8" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-white">
                {reader.lang === 'ar' ? 'جارٍ استلام وعرض المحاضرة من الهاتف...' : 'Receiving beamed document from phone...'}
              </h3>
              <p className="text-xs text-white/75 mt-1.5 max-w-sm">
                {reader.lang === 'ar' ? 'لحظات ويتم تشغيل الملزمة والسبورة الذكية تلقائياً' : 'Preparing slides and interactive board...'}
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <Toolbar
            title={reader.docTitle}
            currentPage={reader.currentPage}
            totalPages={reader.numPages}
            zoom={reader.zoom}
            minZoom={reader.minZoom}
            maxZoom={reader.maxZoom}
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
            onToggleBoard={() => setIsBoardOpen((open) => !open)}
            isBoardOpen={isBoardOpen}
            onOpenBeam={() => setIsBeamOpen(true)}
            isBeaming={Boolean(reader.beamRoom)}
            beamRoom={reader.beamRoom}
            beamRole={reader.beamRole}
            onDisconnectBeam={reader.disconnectBeam}
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
            onClipToBoard={handleClipTextToBoard}
          />

          <BoardSplitWorkspace
            reader={reader}
            isBoardOpen={isBoardOpen}
            onCloseBoard={() => setIsBoardOpen(false)}
            snippets={snippets}
            onAddSnippet={handleAddSnippet}
            onRemoveSnippet={handleRemoveSnippet}
            onUpdateSnippetPosition={handleUpdateSnippetPosition}
          />
        </>
      )}

      <ReaderOverlays reader={reader} />

      {/* Otium Smart Beam Modal */}
      <BeamModal
        isOpen={isBeamOpen}
        lang={reader.lang}
        theme={reader.theme}
        reader={reader}
        isBoardOpen={isBoardOpen}
        onSetBoardOpen={setIsBoardOpen}
        onClose={() => setIsBeamOpen(false)}
      />

      {/* Full-Window Drag and Drop Frosted Overlay */}
      {isDraggingOverWindow && (
        <div
          dir={reader.lang === 'ar' ? 'rtl' : 'ltr'}
          className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center bg-black/60 backdrop-blur-md select-none animate-in fade-in duration-200"
        >
          <div className="flex flex-col items-center justify-center p-8 sm:p-12 rounded-3xl border-2 border-dashed border-accent bg-surface/90 shadow-2xl space-y-4 max-w-md mx-4 animate-scale-in text-center">
            <div className="w-20 h-20 rounded-3xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent animate-bounce shadow-lg">
              <Upload className="w-10 h-10" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-ink">
                {reader.lang === 'ar' ? 'أفلت ملف الـ PDF هنا لفتحه فوراً' : 'Drop your PDF here to open immediately'}
              </h3>
              <p className="text-xs text-ink-muted">
                {reader.lang === 'ar'
                  ? 'يدعم جميع كتب ووثائق PDF بجودة فائقة'
                  : 'Supports all PDF documents and books in pristine quality'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
