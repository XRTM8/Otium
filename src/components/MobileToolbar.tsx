import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Columns,
  Layers,
  MoreHorizontal,
  Palette,
  ScanLine,
  Scroll,
  Search,
  Settings2,
  X
} from 'lucide-react';
import type { ThemeMode, ViewMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { getTranslations } from '../core/i18n/translations';
import { OtiumLogo } from './OtiumLogo';

interface MobileToolbarProps {
  title: string;
  currentPage: number;
  totalPages: number;
  theme: ThemeMode;
  viewMode: ViewMode;
  currentLang: Language;
  isBookmarked: boolean;
  /** Settings → Reading can hide the bottom bar for a bare page. */
  showBottomBar?: boolean;
  /** A single tap on the page hides every chrome surface for immersive reading. */
  immersive?: boolean;
  onPageChange: (page: number) => void;
  onThemeChange: (theme: ThemeMode) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleBookmark: () => void;
  onToggleSearch: () => void;
  onOpenSidebar: () => void;
  onOpenSettings: () => void;
  onOpenScanner?: () => void;
  onCloseDocument: () => void;
}

const THEMES: { id: ThemeMode; dot: string }[] = [
  { id: 'paper', dot: '#d4c5a9' },
  { id: 'midnight', dot: '#38bdf8' },
  { id: 'amoled', dot: '#10b981' },
  { id: 'parchment', dot: '#d97706' },
  { id: 'amber', dot: '#f59e0b' },
  { id: 'eink', dot: '#9ca3af' },
  { id: 'pure', dot: '#f8fafc' }
];

const VIEW_MODES: ViewMode[] = ['continuous', 'dual', 'single'];

/** Touch-first chrome. The shared reader supplies all reading behaviour. */
export const MobileToolbar: React.FC<MobileToolbarProps> = ({
  title,
  currentPage,
  totalPages,
  theme,
  viewMode,
  currentLang,
  isBookmarked,
  showBottomBar = true,
  immersive = false,
  onPageChange,
  onThemeChange,
  onViewModeChange,
  onToggleBookmark,
  onToggleSearch,
  onOpenSidebar,
  onOpenSettings,
  onOpenScanner,
  onCloseDocument
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [jumpValue, setJumpValue] = useState('');
  const [compactLandscape, setCompactLandscape] = useState(false);
  const t = getTranslations(currentLang);
  const ar = currentLang === 'ar';
  const viewModeLabel = ar
    ? { continuous: 'مستمر', dual: 'صفحتين', single: 'مفردة' }[viewMode]
    : { continuous: 'Scroll', dual: 'Spread', single: 'Single' }[viewMode];

  useEffect(() => {
    if (!showMenu) return;
    const timer = window.setTimeout(() => setShowMenu(false), 8000);
    const handleBack = (e: Event) => {
      e.preventDefault();
      setShowMenu(false);
    };
    window.addEventListener('otium:back', handleBack);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('otium:back', handleBack);
    };
  }, [showMenu]);

  useEffect(() => {
    if (immersive) setShowMenu(false);
  }, [immersive]);

  useEffect(() => {
    if (!showJump) return;
    setJumpValue(String(currentPage));
  }, [currentPage, showJump]);

  useEffect(() => {
    if (!showJump) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowJump(false);
    };
    const handleBack = (e: Event) => {
      e.preventDefault();
      setShowJump(false);
    };
    window.addEventListener('keydown', close);
    window.addEventListener('otium:back', handleBack);
    return () => {
      window.removeEventListener('keydown', close);
      window.removeEventListener('otium:back', handleBack);
    };
  }, [showJump]);

  const submitPageJump = () => {
    const parsed = Number.parseInt(jumpValue.replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(parsed)) return;
    onPageChange(Math.min(totalPages, Math.max(1, parsed)));
    setShowJump(false);
  };

  // Landscape phones have very little height: shrink the chrome and drop the
  // duplicate actions that also live in the overflow menu.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia('(orientation: landscape) and (max-height: 540px)');
    const update = () => setCompactLandscape(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const topOffset = compactLandscape
    ? 'max(0.35rem, calc(env(safe-area-inset-top, 0px) + 0.25rem))'
    : 'max(0.6rem, calc(env(safe-area-inset-top, 0px) + 0.45rem))';
  const bottomOffset = compactLandscape
    ? 'max(0.35rem, calc(env(safe-area-inset-bottom, 0px) + 0.25rem))'
    : 'max(0.6rem, calc(env(safe-area-inset-bottom, 0px) + 0.45rem))';

  const viewModeIcon =
    viewMode === 'continuous' ? (
      <Scroll className="w-4 h-4" />
    ) : viewMode === 'dual' ? (
      <BookOpen className="w-4 h-4" />
    ) : (
      <Columns className="w-4 h-4" />
    );

  return (
    <>
      <div
        dir="ltr"
        data-position="top"
        data-immersive={immersive ? 'true' : 'false'}
        aria-hidden={immersive}
        inert={immersive || undefined}
        style={{
          top: topOffset,
          paddingLeft: 'max(0.5rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(0.5rem, env(safe-area-inset-right, 0px))'
        }}
        className="mobile-chrome-shell fixed inset-x-0 z-40 flex justify-center px-2 pointer-events-none"
      >
        <div
          className={`chrome-surface mobile-chrome-bar flex w-full max-w-lg items-center gap-1 rounded-2xl px-1.5 py-1.5 text-ink ${
            immersive ? 'pointer-events-none' : 'pointer-events-auto'
          }`}
        >
          <button
            type="button"
            onClick={onCloseDocument}
            title={t.closeDoc}
            aria-label={t.closeDoc}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line-subtle bg-hover-subtle text-ink-muted transition-colors active:scale-95 active:bg-hover"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="shrink-0 px-0.5 text-accent">
            <OtiumLogo size={20} />
          </div>

          <span
            dir="auto"
            className="flex-1 min-w-0 truncate text-[11px] font-medium text-ink-muted select-none"
          >
            {title}
          </span>

          <button
            type="button"
            onClick={onToggleSearch}
            title={t.searchTooltip}
            aria-label={t.searchTooltip}
            className="p-2 rounded-xl text-ink-muted hover:bg-hover active:bg-hover-strong transition-colors shrink-0"
          >
            <Search className="w-4 h-4" />
          </button>

          {onOpenScanner && (
            <button
              type="button"
              onClick={onOpenScanner}
              title={ar ? 'مسح مستند بالكاميرا' : 'Scan document'}
              aria-label={ar ? 'مسح مستند بالكاميرا' : 'Scan document'}
              className="p-2 rounded-xl text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 active:bg-hover-strong transition-colors shrink-0"
            >
              <ScanLine className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowMenu((open) => !open)}
            title={t.moreTools}
            aria-label={t.moreTools}
            className={`p-2 rounded-xl transition-colors shrink-0 ${
              showMenu ? 'bg-hover-strong text-ink' : 'text-ink-muted hover:bg-hover'
            }`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showMenu && !immersive && (
        <div
          dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
          style={{ top: compactLandscape ? 'max(2.9rem, calc(env(safe-area-inset-top, 0px) + 2.5rem))' : undefined }}
          className="fixed inset-x-2 top-16 z-50 mx-auto max-w-lg rounded-2xl chrome-surface p-3 text-ink space-y-3 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-ink-faint">
              {t.moreTools}
            </span>
            <button
              type="button"
              onClick={() => setShowMenu(false)}
              className="p-1 rounded-full text-ink-muted hover:text-ink hover:bg-hover"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            <button
              type="button"
              onClick={() => {
                onToggleBookmark();
                setShowMenu(false);
              }}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-[10px] transition-colors ${
                isBookmarked
                  ? 'bg-accent/20 text-accent border-accent/40'
                  : 'bg-hover-subtle text-ink-muted border-line-subtle'
              }`}
            >
              <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-highlight' : ''}`} />
              <span>{ar ? 'إشارة' : 'Bookmark'}</span>
            </button>

            <button
              type="button"
              onClick={() => onViewModeChange(VIEW_MODES[(VIEW_MODES.indexOf(viewMode) + 1) % VIEW_MODES.length])}
              className="flex flex-col items-center gap-1 p-2 rounded-xl bg-hover-subtle border border-line-subtle text-ink-muted text-[10px]"
            >
              {viewModeIcon}
              <span>{viewModeLabel}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenSidebar();
                setShowMenu(false);
              }}
              className="flex flex-col items-center gap-1 p-2 rounded-xl bg-hover-subtle border border-line-subtle text-ink-muted text-[10px]"
            >
              <Layers className="w-4 h-4" />
              <span>{t.pagesTab}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenSettings();
                setShowMenu(false);
              }}
              className="flex flex-col items-center gap-1 p-2 rounded-xl bg-hover-subtle border border-line-subtle text-accent text-[10px]"
            >
              <Settings2 className="w-4 h-4" />
              <span>{ar ? 'إعدادات' : 'Settings'}</span>
            </button>
          </div>

          <div className="pt-2 border-t border-line">
            <div className="flex items-center gap-1.5 text-[10px] text-ink-muted font-mono mb-1.5">
              <Palette className="w-3 h-3" />
              <span>{t.readingThemesTitle}</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {THEMES.map((item) => {
                const selected = item.id === theme;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onThemeChange(item.id)}
                    className={`flex items-center gap-1.5 p-1.5 rounded-xl border text-[10px] transition-colors ${
                      selected
                        ? 'border-accent bg-accent/20 text-ink'
                        : 'border-line-subtle bg-hover-subtle text-ink-muted'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20"
                      style={{ backgroundColor: item.dot }}
                    />
                    <span className="truncate">{t.themes[item.id]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showJump && !immersive && (
        <div
          dir={ar ? 'rtl' : 'ltr'}
          role="dialog"
          aria-modal="true"
          aria-label={ar ? 'الانتقال إلى صفحة' : 'Go to page'}
          className="fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center"
        >
          <div
            className="absolute inset-0 bg-scrim backdrop-blur-sm"
            onClick={() => setShowJump(false)}
          />
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitPageJump();
            }}
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            className="chrome-surface relative z-10 w-full max-w-sm rounded-2xl p-4 text-ink"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">
                  {ar ? 'الانتقال إلى صفحة' : 'Go to page'}
                </div>
                <p className="mt-0.5 text-[10px] text-ink-muted font-mono">
                  1 – {totalPages}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowJump(false)}
                aria-label={ar ? 'إغلاق' : 'Close'}
                className="rounded-full p-1.5 text-ink-muted hover:bg-hover hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <input
              autoFocus
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="go"
              value={jumpValue}
              onChange={(event) => setJumpValue(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              aria-label={ar ? 'رقم الصفحة' : 'Page number'}
              className="mt-3 w-full rounded-xl border border-line bg-hover-subtle px-3 py-2.5 text-center font-mono text-2xl text-ink outline-none focus:border-accent/60"
            />

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowJump(false)}
                className="flex-1 rounded-xl border border-line bg-hover-subtle py-2 text-xs font-medium text-ink"
              >
                {ar ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-accent py-2 text-xs font-semibold text-on-accent"
              >
                {ar ? 'انتقال' : 'Go'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showBottomBar && (
      <div
        dir="ltr"
        data-position="bottom"
        data-immersive={immersive ? 'true' : 'false'}
        aria-hidden={immersive}
        inert={immersive || undefined}
        style={{
          bottom: bottomOffset,
          paddingLeft: 'max(0.5rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(0.5rem, env(safe-area-inset-right, 0px))'
        }}
        className="mobile-chrome-shell fixed inset-x-0 z-40 flex justify-center px-2 pointer-events-none"
      >
        <div
          className={`chrome-surface mobile-chrome-bar flex items-center gap-1 rounded-2xl px-1.5 py-1.5 text-ink ${
            immersive ? 'pointer-events-none' : 'pointer-events-auto'
          }`}
        >
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            aria-label={t.prevPage}
            className="p-2 rounded-xl text-ink-muted disabled:opacity-30 active:bg-hover-strong"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => setShowJump(true)}
            aria-label={ar ? `الانتقال إلى صفحة، الحالية ${currentPage} من ${totalPages}` : `Go to page, currently ${currentPage} of ${totalPages}`}
            title={ar ? 'الانتقال إلى صفحة' : 'Go to page'}
            className="px-3 py-1.5 rounded-xl bg-hover-subtle font-mono text-[11px] text-ink active:bg-hover-strong"
          >
            {currentPage} / {totalPages}
          </button>

          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            aria-label={t.nextPage}
            className="p-2 rounded-xl text-ink-muted disabled:opacity-30 active:bg-hover-strong"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <div className="mobile-chrome-extra w-px h-5 bg-hover mx-0.5" />

          <button
            type="button"
            onClick={onToggleBookmark}
            aria-label={isBookmarked ? t.removeBookmark : t.addBookmark}
            className={`mobile-chrome-extra p-2 rounded-xl active:bg-hover-strong ${
              isBookmarked ? 'text-highlight' : 'text-ink-muted'
            }`}
          >
            <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-highlight' : ''}`} />
          </button>

          <button
            type="button"
            onClick={onToggleSearch}
            aria-label={t.searchTooltip}
            className="mobile-chrome-extra p-2 rounded-xl text-ink-muted active:bg-hover-strong"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      </div>
      )}
    </>
  );
};
