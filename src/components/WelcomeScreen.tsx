import React, { useRef, useState, useEffect } from 'react';
import {
  Cast,
  Globe,
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
import { triggerHaptic } from '../core/utils/haptics';
import { BrowserFullscreenButton } from './BrowserFullscreenButton';
import { APP_FILE_ACCEPT, listMedia, removeMedia } from '../media/library';
import { ConfirmDialog } from '../library/ConfirmDialog';
import {
  WelcomeFooterDock,
  WelcomeRecentsShelf,
} from './WelcomeRecentsShelf';
import { type WelcomeLibraryItem } from './welcomeRecentsHelpers';
import { WelcomeThemeMenu } from './WelcomeThemeMenu';
import { WelcomeHeroResumeCard } from './WelcomeHeroResumeCard';

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
  const [isDragging, setIsDragging] = useState(false);
  const [recents, setRecents] = useState<LibraryItem[]>([]);
  const [libraryError, setLibraryError] = useState('');
  const [libraryLoadFailed, setLibraryLoadFailed] = useState(false);
  const [deleting, setDeleting] = useState<LibraryItem | 'all' | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const t = getTranslations(currentLang);

  const [referenceNow] = useState(() => Date.now());

  const loadRecents = async () => {
    const [docs, media] = await Promise.allSettled([getRecentDocumentsList(), listMedia()]);
    setLibraryLoadFailed(docs.status === 'rejected' || media.status === 'rejected');
    setRecents(previous => [
      ...(docs.status === 'fulfilled' ? docs.value : previous.filter(item => !item.mediaKind)),
      ...(media.status === 'fulfilled' ? media.value : previous.filter(item => !!item.mediaKind))
    ].sort((a, b) => b.lastOpened - a.lastOpened));
  };

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([getRecentDocumentsList(), listMedia()]).then(([docs, media]) => {
      if (cancelled) return;
      setLibraryLoadFailed(docs.status === 'rejected' || media.status === 'rejected');
      setRecents(previous => [
        ...(docs.status === 'fulfilled' ? docs.value : previous.filter(item => !item.mediaKind)),
        ...(media.status === 'fulfilled' ? media.value : previous.filter(item => !!item.mediaKind))
      ].sort((a, b) => b.lastOpened - a.lastOpened));
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
      className="relative min-h-screen w-full flex flex-col items-center justify-start p-5 pt-16 sm:pt-16 pb-16 bg-[var(--app-bg)] text-ink select-none overflow-y-auto overflow-x-hidden transition-colors duration-500"
    >
      <div
        dir="ltr"
        style={{
          top: 'max(1rem, calc(env(safe-area-inset-top, 0px) + 0.6rem))'
        }}
        className="absolute inset-x-0 z-30 flex items-center justify-between px-4 sm:px-8 pointer-events-none"
      >
        {/* Left Utilities: Fullscreen, Language, Settings */}
        <div className="pointer-events-auto flex items-center gap-2">
          <BrowserFullscreenButton ar={currentLang === 'ar'} />
          <button
            onClick={onToggleLanguage}
            title={currentLang === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}
            className="fluid-press group flex items-center gap-1.5 px-3 py-1.5 rounded-full chrome-surface text-xs text-ink cursor-pointer hover:border-line-strong hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
          >
            <Globe className="w-3.5 h-3.5 text-ink-muted group-hover:text-ink transition-colors" />
            <span className={`text-[11px] font-semibold ${currentLang === 'ar' ? 'font-mono tracking-wider' : 'font-sans'}`}>
              {currentLang === 'ar' ? 'EN' : 'عربي'}
            </span>
          </button>

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              title={t.settingsTitle}
              className="fluid-press group flex items-center gap-1.5 px-3 py-1.5 rounded-full chrome-surface text-xs text-ink cursor-pointer hover:border-line-strong hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
            >
              <Settings2 className="w-3.5 h-3.5 text-ink-muted group-hover:text-ink transition-colors" />
              <span className="text-[11px] font-medium hidden sm:inline">
                {t.settingsTitle}
              </span>
            </button>
          )}
        </div>

        {/* Right: Theme Picker Capsule Button with Direct Dropdown Beneath It */}
        <WelcomeThemeMenu
          currentTheme={currentTheme}
          currentLang={currentLang}
          t={t}
          onThemeChange={onThemeChange}
        />
      </div>

      {/* Main Content Stage */}
      <div className="relative max-w-xl w-full flex flex-col items-center text-center space-y-5 z-10 pt-2 sm:pt-4">

        <div className="flex flex-col items-center gap-2">
          <OtiumLogo theme={currentTheme} size={46} />
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Otium</h1>
        </div>

        {/* Quick Resume Hero: Frosted Glass Banner with interactive elevation */}
        <WelcomeHeroResumeCard
          heroRecent={recents[0]}
          currentLang={currentLang}
          t={t}
          onOpenRecent={onOpenRecent}
        />

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="w-full"
        >
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              fileInputRef.current?.click();
            }}
            className={`w-full rounded-2xl border px-4 py-7 font-semibold transition-colors cursor-pointer flex flex-col items-center gap-2 focus-visible:outline-2 focus-visible:outline-accent ${
              isDragging ? 'border-accent bg-accent/10' : 'border-line bg-surface hover:border-accent'
            }`}
          >
            <Upload className="w-5 h-5 text-accent" aria-hidden="true" />
            {currentLang === 'ar' ? 'فتح ملف' : 'Open file'}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept={APP_FILE_ACCEPT}
            className="hidden"
            onChange={handleFileInput}
          />
        </div>

        {/* Companion Frosted Glass Actions: Camera Scanner & Smart Beam */}
        {(onOpenScanner || onOpenBeam) && (
          <div className="flex flex-wrap items-center justify-center gap-2.5 w-full">
            {onOpenBeam && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onOpenBeam();
                }}
                title={currentLang === 'ar' ? 'بث إلى السبورة الذكية أو فتح كشاشة استقبال' : 'Smart Beam to Board or Receiver Mode'}
                className="fluid-press group px-4 py-2.5 text-xs sm:text-sm rounded-2xl chrome-surface flex items-center gap-2 hover:border-accent/50 hover:text-accent hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer shadow-sm"
              >
                <Cast className="w-4 h-4 text-accent group-hover:scale-110 transition-transform" />
                <span className="font-semibold">{currentLang === 'ar' ? 'بث واستقبال السبورة' : 'Smart Beam & Board'}</span>
              </button>
            )}

            {onOpenScanner && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onOpenScanner();
                }}
                title={currentLang === 'ar' ? 'مسح كتاب أو مستند ورقي ضوئياً إلى ملف PDF' : 'Scan document with camera to PDF'}
                className="fluid-press group px-4 py-2.5 text-xs sm:text-sm rounded-2xl chrome-surface flex items-center gap-2 hover:border-accent/50 hover:text-accent hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer shadow-sm"
              >
                <ScanLine className="w-4 h-4 text-accent group-hover:scale-110 transition-transform" />
                <span className="font-semibold">{currentLang === 'ar' ? 'الماسح بالكاميرا' : 'Scan with Camera'}</span>
              </button>
            )}
          </div>
        )}

        <WelcomeRecentsShelf
          currentTheme={currentTheme}
          currentLang={currentLang}
          t={t}
          recents={recents}
          libraryError={libraryError}
          libraryLoadFailed={libraryLoadFailed}
          referenceNow={referenceNow}
          fileInputRef={fileInputRef}
          onRetryLoad={() => void loadRecents()}
          onOpenRecent={onOpenRecent}
          onRequestDelete={(target) => setDeleting(target)}
        />

        <WelcomeFooterDock currentLang={currentLang} />

      </div>

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
          <p>{currentLang === 'ar' ? 'سيُحذف الملف المحفوظ وشرحه من مكتبة هذا الجهاز.' : 'This removes the cached file and its saved ink from this device library.'}</p>
          <strong>{deleting === 'all' ? t.clearAll : deleting.name}</strong>
        </ConfirmDialog>
      )}
    </div>
  );
};
