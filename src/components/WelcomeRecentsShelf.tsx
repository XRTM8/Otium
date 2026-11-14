import React from 'react';
import {
  Calendar,
  Clock,
  Download,
  ExternalLink,
  HardDrive,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { ThemeMode } from '../core/types';
import type { Language, getTranslations } from '../core/i18n/translations';
import { OtiumLogo } from './OtiumLogo';
import { isTauriRuntime, openExternalLink } from '../platform/runtime';
import { getCurrentVersion } from '../core/updates/currentVersion';
import {
  formatLibraryDate,
  formatLibraryProgressLabel,
  formatLibrarySize,
  isPagedLibraryItem,
  type WelcomeLibraryItem,
} from './welcomeRecentsHelpers';

interface WelcomeRecentsShelfProps {
  currentTheme: ThemeMode;
  currentLang: Language;
  t: ReturnType<typeof getTranslations>;
  recents: WelcomeLibraryItem[];
  libraryError: string;
  libraryLoadFailed: boolean;
  referenceNow: number;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onRetryLoad: () => void;
  onOpenRecent: (item: WelcomeLibraryItem) => void;
  onRequestDelete: (target: WelcomeLibraryItem | 'all') => void;
}

export const WelcomeRecentsShelf: React.FC<WelcomeRecentsShelfProps> = ({
  currentTheme,
  currentLang,
  t,
  recents,
  libraryError,
  libraryLoadFailed,
  referenceNow,
  fileInputRef,
  onRetryLoad,
  onOpenRecent,
  onRequestDelete,
}) => (
  <>
    {(libraryError || libraryLoadFailed) && (
      <div role="alert" className="w-full text-xs text-danger-ink space-y-2">
        <p>{libraryError || (currentLang === 'ar' ? 'تعذر تحميل جزء من المكتبة. ملفاتك لم تُحذف؛ حاول مجدداً.' : 'Part of your library could not be loaded. Your files have not been deleted; try again.')}</p>
        <button type="button" className="btn-secondary min-h-11 px-4 rounded-xl cursor-pointer" onClick={onRetryLoad}>
          {currentLang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
        </button>
      </div>
    )}

    {recents.length > 0 && (
      <div className="w-full text-start pt-4 border-t border-line/40 space-y-2.5">
        <div className="flex items-center justify-between text-xs text-ink-muted px-1">
          <span className="flex items-center gap-1.5 font-medium">
            <Clock className="w-3.5 h-3.5 opacity-80" />
            <span>{t.savedDocs}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface/50 border border-line text-ink-muted font-mono">
              {recents.length}
            </span>
          </span>
          <button
            onClick={() => onRequestDelete('all')}
            className="hover:text-danger-ink transition-colors flex items-center gap-1 text-[11px] text-ink-faint hover:text-ink-muted cursor-pointer"
            title={t.clearAll}
          >
            <Trash2 className="w-3 h-3" />
            <span>{t.clearAll}</span>
          </button>
        </div>

        <div className="space-y-2 max-h-[240px] sm:max-h-[280px] overflow-y-auto overflow-x-hidden p-1 scrollbar-thin scrollbar-thumb-line-strong scrollbar-track-transparent overscroll-contain transition-all">
          {recents.map((r) => (
            <div
              key={r.id}
              role="button"
              aria-label={`${currentLang === 'ar' ? 'فتح' : 'Open'} ${r.name}`}
              tabIndex={0}
              onClick={() => {
                if (!r.available) {
                  fileInputRef.current?.click();
                  return;
                }
                onOpenRecent(r);
              }}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                if (!r.available) {
                  fileInputRef.current?.click();
                  return;
                }
                onOpenRecent(r);
              }}
              className={`fluid-press relative overflow-hidden flex items-center justify-between p-3.5 ps-4 rounded-2xl bg-surface/75 hover:bg-surface/95 backdrop-blur-xs cursor-pointer border border-line/45 hover:border-line-strong hover:-translate-y-1 shadow-xs hover:shadow-xl group transition-all duration-200 ${
                r.available ? '' : 'border-dashed'
              }`}
            >
              <div className="absolute inset-y-0 start-0 w-[3px] group-hover:w-[5px] bg-accent/40 group-hover:bg-accent transition-all duration-200" />
              <div className="flex items-center gap-3 min-w-0 pr-1">
                <div className="w-9 h-9 rounded-xl border border-line bg-surface/50 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <OtiumLogo theme={currentTheme} size={22} />
                </div>
                <div className="flex flex-col min-w-0 gap-1 text-start">
                  <span className="truncate font-semibold text-xs sm:text-sm text-ink group-hover:text-accent transition-colors">
                    <bdi>{r.name}</bdi>
                  </span>
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-ink-muted font-mono">
                    <span className="font-sans font-medium text-ink-muted">
                      {formatLibraryProgressLabel(r, currentLang, t)}
                      {isPagedLibraryItem(r) && r.totalPages > 0 && (
                        <span className="text-[10px] text-accent font-mono ml-1 mr-1">
                          ({Math.min(100, Math.round((r.lastPage / r.totalPages) * 100))}%)
                        </span>
                      )}
                    </span>
                    <span className="text-ink-faint hidden sm:inline">•</span>
                    <span className="flex items-center gap-1 font-sans text-ink-muted">
                      <Calendar className="w-3 h-3 text-ink-faint shrink-0" />
                      <span>{formatLibraryDate(r.lastOpened, referenceNow, currentLang, t)}</span>
                    </span>
                    {r.available ? (
                      <>
                        <span className="text-ink-faint hidden sm:inline">•</span>
                        <span dir="ltr" className="inline-flex items-center gap-1 font-mono text-ink-muted">
                          <HardDrive className="w-3 h-3 text-ink-faint shrink-0" />
                          <span>{formatLibrarySize(r.sizeBytes)}</span>
                        </span>
                      </>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full border border-accent/25 bg-accent/10 px-1.5 py-0.5 font-sans text-[10px] text-accent">
                        <Upload className="h-3 w-3 shrink-0" />
                        <span>{currentLang === 'ar' ? 'أعد استيراد الملف' : 'Re-import file'}</span>
                      </span>
                    )}
                  </div>

                  {isPagedLibraryItem(r) && r.totalPages > 0 && (
                    <div className="w-full h-0.5 bg-line/40 rounded-full overflow-hidden mt-1.5">
                      <div
                        className="h-full bg-accent transition-all duration-300 rounded-full"
                        style={{
                          width: `${Math.min(100, Math.round((r.lastPage / r.totalPages) * 100))}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0 px-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestDelete(r);
                  }}
                  title={t.deleteTooltip}
                  aria-label={`${currentLang === 'ar' ? 'حذف من المكتبة:' : 'Delete from library:'} ${r.name}`}
                  className="fluid-press p-2 rounded-xl opacity-100 text-ink-faint hover:text-rose-400 hover:bg-rose-500/10 active:bg-rose-500/20 cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </>
);

export const WelcomeFooterDock: React.FC<{ currentLang: Language; buildLabel?: string }> = ({
  currentLang,
  buildLabel = 'Otium',
}) => {
  if (isTauriRuntime()) return null;
  return (
    <div className="w-full pt-6 pb-2 border-t border-line/40 flex flex-col items-center gap-2 text-ink select-none animate-in fade-in duration-300">
      <a
        href="https://github.com/XRTM8/Otium"
        onClick={(e) => {
          e.preventDefault();
          void openExternalLink('https://github.com/XRTM8/Otium');
        }}
        target="_blank"
        rel="noopener noreferrer"
        className="group fluid-press px-4 py-2 rounded-full chrome-surface hover:border-accent/50 hover:-translate-y-0.5 shadow-sm hover:shadow-md flex items-center gap-2 text-xs font-semibold text-ink hover:text-accent transition-all duration-200"
        title={currentLang === 'ar' ? 'تنزيل Otium' : 'Download Otium'}
      >
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <Download className="w-3.5 h-3.5 text-accent" />
        <span>
          {buildLabel}
        </span>
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-md bg-accent/10 text-accent font-semibold">
          v{getCurrentVersion()}
        </span>
        <ExternalLink className="w-3 h-3 text-ink-muted group-hover:text-accent opacity-70 group-hover:opacity-100 transition-opacity" />
      </a>

      <a
        href="https://instagram.com/ma.xrt"
        onClick={(e) => {
          e.preventDefault();
          void openExternalLink('https://instagram.com/ma.xrt');
        }}
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full hover:bg-hover text-ink-muted hover:text-ink transition-colors cursor-pointer"
        title="Instagram: @ma.xrt"
      >
        <svg
          className="w-3 h-3 text-pink-500/80 group-hover:text-pink-500 transition-colors"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
        <span className="font-medium text-[11px] text-ink-muted group-hover:text-ink transition-colors">MA.XRT</span>
        <span className="text-[10px] text-ink-faint">• Instagram</span>
      </a>
    </div>
  );
};
