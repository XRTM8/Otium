import React, { useRef, useState, useEffect } from 'react';
import {
  Cast,
  House,
  LibraryBig,
  ScanLine,
  Upload,
  Settings2
} from 'lucide-react';
import type { ThemeMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { getTranslations } from '../core/i18n/translations';
import {
  getRecentDocumentsList,
  removeDocumentFromStorage,
  clearAllStoredDocuments
} from '../core/storage/documents';
import { OtiumLogo } from './OtiumLogo';
import { registerBackHandler } from '../core/navigation/backHandler';
import './welcome.css';
import { BrowserFullscreenButton } from './BrowserFullscreenButton';
import { APP_FILE_ACCEPT, listMedia, removeMedia } from '../media/library';
import { ConfirmDialog } from '../library/ConfirmDialog';
import {
  WelcomeFooterDock,
  WelcomeRecentsShelf,
} from './WelcomeRecentsShelf';
import {
  type WelcomeLibraryItem,
  getLibraryNavigationState,
  updateLibraryNavigationState,
} from './welcomeRecentsHelpers';
import { WelcomeThemeMenu } from './WelcomeThemeMenu';
import { WelcomeHeroResumeCard } from './WelcomeHeroResumeCard';
import { triggerHaptic } from '../core/utils/haptics';

type LibraryItem = WelcomeLibraryItem;

interface WelcomeScreenProps {
  currentTheme: ThemeMode;
  currentLang: Language;
  onThemeChange: (theme: ThemeMode) => void;
  onToggleLanguage: () => void;
  onOpenSettings?: () => void;
  onOpenFile: (file: File) => void;
  onOpenRecent: (item: LibraryItem) => void;
  onOpenScanner?: () => void;
  onOpenBeam?: () => void;
  onOpenSample?: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  currentTheme,
  currentLang,
  onThemeChange,
  onToggleLanguage,
  onOpenSettings,
  onOpenFile,
  onOpenRecent,
  onOpenScanner,
  onOpenBeam,
  onOpenSample: _onOpenSample
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [libraryOpen, setLibraryOpenState] = useState(() => getLibraryNavigationState().fullLibrary);
  const setLibraryOpen = React.useCallback((open: boolean) => {
    updateLibraryNavigationState({ fullLibrary: open });
    setLibraryOpenState(open);
  }, []);
  const [loaded, setLoaded] = useState(false);
  const ar = currentLang === 'ar';

  useEffect(() => {
    if (!libraryOpen) return;
    return registerBackHandler(() => { setLibraryOpen(false); return true; });
  }, [libraryOpen, setLibraryOpen]);

  const [isDragging, setIsDragging] = useState(false);
  const [recents, setRecents] = useState<LibraryItem[]>([]);
  const [libraryError, setLibraryError] = useState('');
  const [libraryLoadFailed, setLibraryLoadFailed] = useState(false);
  const [deleting, setDeleting] = useState<LibraryItem | 'all' | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const t = getTranslations(currentLang);

  const [referenceNow] = useState(() => Date.now());

  const refreshId = useRef<symbol | null>(null);
  const loadRecents = React.useCallback(async () => {
    const request = Symbol();
    refreshId.current = request;
    const [docs, media] = await Promise.allSettled([getRecentDocumentsList(), listMedia()]);
    if (request !== refreshId.current) return;
    setLoaded(true);
    setLibraryLoadFailed(docs.status === 'rejected' || media.status === 'rejected');
    setRecents(previous => [
      ...(docs.status === 'fulfilled' ? docs.value : previous.filter(item => !item.mediaKind)),
      ...(media.status === 'fulfilled' ? media.value : previous.filter(item => !!item.mediaKind))
    ].sort((a, b) => b.lastOpened - a.lastOpened));
  }, []);

  useEffect(() => {
    void loadRecents();
    return () => { refreshId.current = null; };
  }, [loadRecents]);

  const resumeItem = recents.find(item => item.available);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      onOpenFile(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onOpenFile(file);
    }
    e.target.value = '';
  };

  return (
    <div
      dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
      className="welcome-page flex-1 min-h-0 overflow-y-auto bg-[var(--app-bg)] text-ink"
    >
      <header className="welcome-header">
        <div className="welcome-header-inner">
          <div className="flex items-center gap-2.5" dir="ltr">
            <OtiumLogo theme={currentTheme} size={32} />
            <span className="welcome-brand">Otium</span>
          </div>
          <div dir="ltr" className="flex items-center gap-2">
            <BrowserFullscreenButton ar={currentLang === 'ar'} />
            <button
              onClick={onToggleLanguage}
              title={currentLang === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}
              aria-label={currentLang === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}
              className="welcome-circle-btn"
            >
              <span className={`text-[12px] font-bold ${currentLang === 'ar' ? 'font-mono' : 'font-sans'}`}>
                {currentLang === 'ar' ? 'EN' : 'ع'}
              </span>
            </button>

            {onOpenBeam && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onOpenBeam();
                }}
                title={ar ? 'بث واستقبال السبورة (Smart Beam)' : 'Smart Beam & Cast'}
                aria-label={ar ? 'بث واستقبال السبورة (Smart Beam)' : 'Smart Beam & Cast'}
                className="welcome-circle-btn"
              >
                <Cast size={18} className="text-ink-muted hover:text-accent transition-colors" />
              </button>
            )}

            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                title={t.settingsTitle}
                aria-label={t.settingsTitle}
                className="welcome-circle-btn"
              >
                <Settings2 size={18} className="text-ink-muted hover:text-ink transition-colors" />
              </button>
            )}

            <WelcomeThemeMenu
              currentTheme={currentTheme}
              currentLang={currentLang}
              t={t}
              onThemeChange={onThemeChange}
            />
          </div>
        </div>
      </header>

      <main className="welcome-content">
        <nav className="welcome-nav" aria-label={ar ? 'التنقل الرئيسي' : 'Main navigation'}>
          <button type="button" onClick={() => setLibraryOpen(false)} aria-current={!libraryOpen ? 'page' : undefined}>
            <House size={17} />{ar ? 'الرئيسية' : 'Home'}
          </button>
          <button type="button" onClick={() => setLibraryOpen(true)} aria-current={libraryOpen ? 'page' : undefined}>
            <LibraryBig size={17} />{ar ? 'المكتبة' : 'Library'}
          </button>
        </nav>
        <div className="welcome-heading">
          <h1>{libraryOpen ? (ar ? 'المكتبة' : 'Library') : (ar ? 'مساحة القراءة' : 'Reading room')}</h1>
          {(libraryOpen || resumeItem) && <button type="button" className="welcome-open" onClick={() => fileInputRef.current?.click()}>
            <Upload size={17} />{ar ? 'فتح ملف' : 'Open file'}
          </button>}
        </div>
        <input ref={fileInputRef} type="file" accept={APP_FILE_ACCEPT} className="hidden" onChange={handleFileInput} />
        {!libraryOpen && (
          <section className={isDragging ? 'welcome-desk is-dragging' : 'welcome-desk'} onDragOver={handleDragOver}
            onDragLeave={handleDragLeave} onDrop={handleDrop}>
            {resumeItem ? (
              <WelcomeHeroResumeCard heroRecent={resumeItem} currentLang={currentLang} t={t} onOpenRecent={onOpenRecent} />
            ) : (
              <button type="button" className="welcome-import" onClick={() => fileInputRef.current?.click()}>
                <Upload size={26} />
                <strong>{ar ? 'فتح ملف' : 'Open file'}</strong>
                <span>PDF · PPTX · {ar ? 'صور ووسائط' : 'Images and media'}</span>
              </button>
            )}
          </section>
        )}
        <WelcomeRecentsShelf
          fullLibrary={libraryOpen}
          loaded={loaded}
          currentLang={currentLang}
          t={t}
          recents={recents}
          libraryError={libraryError}
          libraryLoadFailed={libraryLoadFailed}
          referenceNow={referenceNow}
          fileInputRef={fileInputRef}
          onRetryLoad={() => { setLibraryError(''); void loadRecents(); }}
          onOpenRecent={onOpenRecent}
          onRequestDelete={(target) => setDeleting(target)}
        />

        <WelcomeFooterDock currentLang={currentLang} />
      </main>

      {/* Mobile Floating Bottom Bar */}
      <nav
        className="mobile-dock"
        data-active-tab={libraryOpen ? 'library' : 'home'}
        aria-label={ar ? 'التنقل السريع' : 'Quick navigation'}
      >

        <button
          type="button"
          className={`dock-btn ${!libraryOpen ? 'active' : ''}`}
          onClick={() => {
            triggerHaptic('light');
            setLibraryOpen(false);
          }}
          aria-current={!libraryOpen ? 'page' : undefined}
        >
          <House size={18} className="dock-icon" />
          <span className="dock-label">{ar ? 'الرئيسية' : 'Home'}</span>
        </button>

        <button
          type="button"
          className={`dock-btn ${libraryOpen ? 'active' : ''}`}
          onClick={() => {
            triggerHaptic('light');
            setLibraryOpen(true);
          }}
          aria-current={libraryOpen ? 'page' : undefined}
        >
          <LibraryBig size={18} className="dock-icon" />
          <span className="dock-label">{ar ? 'المكتبة' : 'Library'}</span>
        </button>

        <button
          type="button"
          className="dock-btn dock-btn-action"
          onClick={() => {
            triggerHaptic('medium');
            fileInputRef.current?.click();
          }}
          title={ar ? 'فتح ملف جديد' : 'Open new file'}
          aria-label={ar ? 'فتح ملف جديد' : 'Open new file'}
        >
          <div className="dock-action-badge">
            <Upload size={16} />
          </div>
          <span className="dock-label">{ar ? 'فتح ملف' : 'Open'}</span>
        </button>

        {onOpenScanner && (
          <button
            type="button"
            className="dock-btn"
            onClick={() => {
              triggerHaptic('light');
              onOpenScanner();
            }}
            title={ar ? 'الماسح الضوئي' : 'Document Scanner'}
            aria-label={ar ? 'الماسح الضوئي' : 'Document Scanner'}
          >
            <ScanLine size={18} className="dock-icon" />
            <span className="dock-label">{ar ? 'الماسح' : 'Scan'}</span>
          </button>
        )}
      </nav>

      {deleting && (
        <ConfirmDialog
          title={currentLang === 'ar' ? 'حذف من مكتبة الجهاز؟' : 'Delete from this device library?'}
          confirmLabel={currentLang === 'ar' ? 'حذف' : 'Delete'}
          cancelLabel={currentLang === 'ar' ? 'إلغاء' : 'Cancel'}
          busy={deletingBusy}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            setDeletingBusy(true);
            try {
              if (deleting === 'all') {
                await clearAllStoredDocuments();
                await removeMedia();
              } else if (deleting.id.startsWith('media:')) {
                await removeMedia(deleting.id);
              } else {
                await removeDocumentFromStorage(deleting.id);
              }
              setLibraryError('');
              setDeleting(null);
            } catch {
              setLibraryError(currentLang === 'ar' ? 'تعذر إكمال الحذف؛ حاول مجدداً.' : 'Could not complete deletion. Try again.');
              setDeleting(null);
            } finally {
              await loadRecents();
              setDeletingBusy(false);
            }
          }}
        >
          <p>{deleting === 'all'
            ? (ar ? 'ستُحذف جميع الملفات المحفوظة من مكتبة هذا الجهاز.' : 'This removes all saved files from this device library.')
            : (ar ? 'سيُحذف الملف المحفوظ من مكتبة هذا الجهاز.' : 'This removes the saved file from this device library.')}</p>
          <strong>{deleting === 'all' ? t.clearAll : deleting.name}</strong>
        </ConfirmDialog>
      )}
    </div>
  );
};
