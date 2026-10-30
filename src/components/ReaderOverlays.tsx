import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { ReaderController } from '../app/useReaderController';
import { PasswordModal } from './PasswordModal';
import { SearchBar } from './SearchBar';
import { SettingsModal } from './SettingsModal';
import { Sidebar } from './Sidebar';
import { useTeaching } from './TeachingContext';

interface ReaderOverlaysProps {
  reader: ReaderController;
  /** Touch shells use a bottom sheet instead of a desktop side drawer. */
  mobile?: boolean;
}

/** Modals, drawers and status surfaces that are shared by every platform. */
export const ReaderOverlays: React.FC<ReaderOverlaysProps> = ({ reader, mobile = false }) => {
  const teaching = useTeaching();
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
        theme={reader.theme}
        onThemeChange={reader.changeTheme}
        themeSchedule={reader.themeSchedule}
        onThemeScheduleChange={reader.changeThemeSchedule}
        dayTheme={reader.dayTheme}
        onDayThemeChange={reader.changeDayTheme}
        nightTheme={reader.nightTheme}
        onNightThemeChange={reader.changeNightTheme}
        rememberDocTheme={reader.rememberDocTheme}
        onRememberDocThemeChange={reader.changeRememberDocTheme}
        keepScreenAwake={reader.keepScreenAwake}
        onKeepScreenAwakeChange={reader.changeKeepScreenAwake}
        smartBoardEnabled={teaching.prefs.boardEnabled}
        onSmartBoardEnabledChange={enabled => {
          if (!mobile) teaching.updatePrefs({ boardEnabled: enabled });
        }}
        onResetDefaults={reader.resetDefaults}
        onExportBackup={reader.exportBackup}
        onImportBackup={reader.importBackup}
      />

      <PasswordModal
        isOpen={reader.passwordModal.isOpen}
        isIncorrect={reader.passwordModal.isIncorrect}
        isLoading={reader.isLoading}
        docTitle={reader.passwordModal.title}
        lang={reader.lang}
        onSubmit={reader.handlePasswordSubmit}
        onCancel={reader.handlePasswordCancel}
      />

      {reader.documentError && !reader.isImmersive && (
        <div
          role="alert"
          aria-live="assertive"
          dir={reader.lang === 'ar' ? 'rtl' : 'ltr'}
          className="chrome-surface fixed bottom-20 inset-x-3 z-50 flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-xs text-danger-ink sm:bottom-6 sm:inset-x-auto sm:end-6"
        >
          <AlertTriangle className="w-4 h-4 text-danger-ink shrink-0 mt-0.5" />
          <span className="flex-1 leading-relaxed">{reader.documentError}</span>
          <button
            type="button"
            onClick={reader.clearDocumentError}
            aria-label={reader.lang === 'ar' ? 'إغلاق التنبيه' : 'Dismiss notice'}
            className="toolbar-icon"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {!reader.isImmersive && (reader.autoBeam.active || reader.autoBeam.error) && <div role={reader.autoBeam.error ? 'alert' : 'status'} dir={reader.lang === 'ar' ? 'rtl' : 'ltr'}
        className="chrome-surface fixed inset-x-3 top-20 z-50 mx-auto flex max-w-lg items-center gap-3 rounded-2xl px-4 py-3 text-xs text-ink shadow-lg">
        <span className="flex-1">{reader.autoBeam.error
          ? (reader.lang === 'ar' ? 'تعذر فتح الملف على السبورة تلقائياً. تحقق من الربط وأعد المحاولة.' : 'Could not open this file on the board automatically. Check the connection and retry.')
          : (reader.lang === 'ar' ? `جارٍ فتح الملف على السبورة… ${Math.round(reader.autoBeam.progress)}%` : `Opening on the board… ${Math.round(reader.autoBeam.progress)}%`)}</span>
        {reader.autoBeam.error && <><button type="button" className="min-h-11 px-2 text-accent" onClick={reader.autoBeam.retry}>{reader.lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</button><button type="button" aria-label={reader.lang === 'ar' ? 'إغلاق التنبيه' : 'Dismiss notice'} onClick={reader.autoBeam.dismiss}><X size={18} /></button></>}
      </div>}

      {reader.isLoading && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 bg-scrim backdrop-blur-xs flex flex-col items-center justify-center text-ink select-none"
        >
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
          <span className={`text-xs uppercase text-highlight ${reader.lang === 'ar' ? 'font-sans font-bold' : 'font-mono tracking-widest'}`}>
            {reader.lang === 'ar' ? 'أوتيوم • جاري تجهيز المستند...' : 'OTIUM • LOADING DOCUMENT'}
          </span>
          {reader.loadProgress !== null && (
            <span className="mt-2 font-mono text-[11px] text-ink-muted">
              {reader.loadProgress}%
            </span>
          )}
        </div>
      )}

      {/* Screen reader live announcements container */}
      <div id="a11y-live-announcer" role="status" aria-live="polite" aria-atomic="true" className="sr-only" />
    </>
  );
};
