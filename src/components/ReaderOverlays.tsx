import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { ReaderController } from '../app/useReaderController';
import { PasswordModal } from './PasswordModal';
import { SearchBar } from './SearchBar';
import { SettingsModal } from './SettingsModal';
import { Sidebar } from './Sidebar';

interface ReaderOverlaysProps {
  reader: ReaderController;
}

/** Modals, drawers and status surfaces that are identical on every platform. */
export const ReaderOverlays: React.FC<ReaderOverlaysProps> = ({ reader }) => {
  return (
    <>
      <SearchBar
        isOpen={reader.isSearchOpen}
        doc={reader.doc}
        lang={reader.lang}
        onNavigateToPage={reader.scrollToPage}
        onQueryChange={reader.handleSearchQueryChange}
        onClose={reader.closeSearch}
      />

      <Sidebar
        isOpen={reader.isSidebarOpen}
        doc={reader.doc}
        totalPages={reader.numPages}
        currentPage={reader.currentPage}
        lang={reader.lang}
        bookmarks={reader.bookmarks}
        annotations={reader.annotations}
        onSelectPage={reader.scrollToPage}
        onToggleBookmark={reader.toggleBookmark}
        onDeleteAnnotation={reader.deleteAnnotation}
        onClose={() => reader.setIsSidebarOpen(false)}
      />

      <SettingsModal
        isOpen={reader.isSettingsOpen}
        onClose={() => reader.setIsSettingsOpen(false)}
        currentFont={reader.fontFamily}
        onFontChange={reader.changeFont}
        viewMode={reader.viewMode}
        onViewModeChange={reader.changeViewMode}
        lang={reader.lang}
        onResetDefaults={reader.resetDefaults}
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
          className="fixed bottom-20 sm:bottom-6 inset-x-3 sm:inset-x-auto sm:right-6 z-50 flex items-start gap-2.5 rounded-2xl border border-rose-400/30 bg-neutral-900/98 px-3.5 py-3 text-xs text-rose-100 shadow-2xl backdrop-blur-xl"
        >
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span className="flex-1 leading-relaxed">{reader.documentError}</span>
          <button
            type="button"
            onClick={reader.clearDocumentError}
            aria-label="Dismiss"
            className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {reader.isLoading && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center text-white">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-3" />
          <span className="text-xs font-mono tracking-widest uppercase text-amber-200">
            OTIUM • LOADING DOCUMENT
          </span>
          {reader.loadProgress !== null && (
            <span className="mt-2 font-mono text-[11px] text-neutral-300">
              {reader.loadProgress}%
            </span>
          )}
        </div>
      )}
    </>
  );
};
