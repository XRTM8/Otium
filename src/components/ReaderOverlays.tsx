import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { ReaderController } from '../app/useReaderController';
import { PasswordModal } from './PasswordModal';
import { SearchBar } from './SearchBar';
import { SettingsModal } from './SettingsModal';
import { Sidebar } from './Sidebar';

interface ReaderOverlaysProps {
  reader: ReaderController;
  /** Touch shells use a bottom sheet instead of a desktop side drawer. */
  mobile?: boolean;
}

/** Modals, drawers and status surfaces that are shared by every platform. */
export const ReaderOverlays: React.FC<ReaderOverlaysProps> = ({ reader, mobile = false }) => {
  return (
    <>
      <SearchBar
        isOpen={reader.isSearchOpen}
        doc={reader.doc}
        lang={reader.lang}
        initialQuery={reader.searchSeed}
        onNavigateToPage={reader.scrollToPage}
        onQueryChange={reader.handleSearchQueryChange}
        onClose={reader.closeSearch}
      />

      <Sidebar
        isOpen={reader.isSidebarOpen}
        doc={reader.doc}
        docTitle={reader.docTitle}
        totalPages={reader.numPages}
        currentPage={reader.currentPage}
        lang={reader.lang}
        bookmarks={reader.bookmarks}
        annotations={reader.annotations}
        onSelectPage={reader.scrollToPage}
        onToggleBookmark={reader.toggleBookmark}
        onDeleteAnnotation={reader.deleteAnnotation}
        onUpdateAnnotationNote={reader.updateAnnotationNote}
        onClose={() => reader.setIsSidebarOpen(false)}
        variant={mobile ? 'sheet' : 'drawer'}
      />

      <SettingsModal
        isOpen={reader.isSettingsOpen}
        onClose={() => reader.setIsSettingsOpen(false)}
        currentFont={reader.fontFamily}
        onFontChange={reader.changeFont}
        viewMode={reader.viewMode}
        onViewModeChange={reader.changeViewMode}
        lang={reader.lang}
        mobile={mobile}
        mobileNavVisible={reader.showMobileNavBar}
        onMobileNavVisibleChange={reader.changeMobileNavVisibility}
        onResetDefaults={reader.resetDefaults}
        onExportBackup={reader.exportBackup}
        onImportBackup={reader.importBackup}
      />

      <PasswordModal
        isOpen={reader.passwordModal.isOpen}
        isIncorrect={reader.passwordModal.isIncorrect}
        docTitle={reader.passwordModal.title}
        lang={reader.lang}
        onSubmit={reader.handlePasswordSubmit}
        onCancel={reader.handlePasswordCancel}
      />

      {reader.documentError && (
        <div
          dir={reader.lang === 'ar' ? 'rtl' : 'ltr'}
          className="chrome-surface fixed bottom-20 inset-x-3 z-50 flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-xs text-danger-ink sm:bottom-6 sm:inset-x-auto sm:right-6"
        >
          <AlertTriangle className="w-4 h-4 text-danger-ink shrink-0 mt-0.5" />
          <span className="flex-1 leading-relaxed">{reader.documentError}</span>
          <button
            type="button"
            onClick={reader.clearDocumentError}
            aria-label="Dismiss"
            className="toolbar-icon"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {reader.isLoading && (
        <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-xs flex flex-col items-center justify-center text-ink">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
          <span className="text-xs font-mono tracking-widest uppercase text-highlight">
            OTIUM • LOADING DOCUMENT
          </span>
          {reader.loadProgress !== null && (
            <span className="mt-2 font-mono text-[11px] text-ink-muted">
              {reader.loadProgress}%
            </span>
          )}
        </div>
      )}
    </>
  );
};
