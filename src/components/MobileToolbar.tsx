import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Columns,
  Layers,
  MoreHorizontal,
  Palette,
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
  onPageChange: (page: number) => void;
  onThemeChange: (theme: ThemeMode) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleBookmark: () => void;
  onToggleSearch: () => void;
  onOpenSidebar: () => void;
  onOpenSettings: () => void;
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
  onPageChange,
  onThemeChange,
  onViewModeChange,
  onToggleBookmark,
  onToggleSearch,
  onOpenSidebar,
  onOpenSettings,
  onCloseDocument
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const t = getTranslations(currentLang);
  const ar = currentLang === 'ar';
  const viewModeLabel = ar
    ? { continuous: 'مستمر', dual: 'صفحتين', single: 'مفردة' }[viewMode]
    : { continuous: 'Scroll', dual: 'Spread', single: 'Single' }[viewMode];

  useEffect(() => {
    if (!showMenu) return;
    const timer = window.setTimeout(() => setShowMenu(false), 8000);
    return () => window.clearTimeout(timer);
  }, [showMenu]);

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
        dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
        style={{ top: 'max(0.6rem, calc(env(safe-area-inset-top, 0px) + 0.45rem))' }}
        className="fixed inset-x-0 z-40 flex justify-center px-2 pointer-events-none"
      >
        <div className="pointer-events-auto flex items-center gap-1 w-full max-w-lg px-2 py-1.5 rounded-2xl bg-neutral-900/95 text-white border border-white/10 shadow-2xl backdrop-blur-xl">
          <button
            type="button"
            onClick={onCloseDocument}
            title={t.closeDoc}
            aria-label={t.closeDoc}
            className="p-2 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 active:scale-95 transition-transform shrink-0"
          >
            {currentLang === 'ar' ? (
              <ArrowRight className="w-4 h-4" />
            ) : (
              <ArrowLeft className="w-4 h-4" />
            )}
          </button>

          <div className="px-0.5 shrink-0">
            <OtiumLogo theme={theme} size={20} />
          </div>

          <span className="flex-1 min-w-0 truncate text-[11px] font-medium text-neutral-300 select-none">
            {title}
          </span>

          <button
            type="button"
            onClick={onToggleSearch}
            title={t.searchTooltip}
            aria-label={t.searchTooltip}
            className="p-2 rounded-xl text-neutral-300 hover:bg-white/10 active:bg-white/15 transition-colors shrink-0"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setShowMenu((open) => !open)}
            title={t.moreTools}
            aria-label={t.moreTools}
            className={`p-2 rounded-xl transition-colors shrink-0 ${
              showMenu ? 'bg-white/20 text-white' : 'text-neutral-300 hover:bg-white/10'
            }`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showMenu && (
        <div
          dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
          className="fixed inset-x-2 top-16 z-50 mx-auto max-w-lg rounded-2xl bg-neutral-900/98 border border-white/10 p-3 shadow-2xl backdrop-blur-2xl text-neutral-200 space-y-3 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
              {t.moreTools}
            </span>
            <button
              type="button"
              onClick={() => setShowMenu(false)}
              className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-white/10"
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
                  ? 'bg-amber-400/20 text-amber-300 border-amber-400/40'
                  : 'bg-white/5 text-neutral-300 border-white/5'
              }`}
            >
              <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-amber-400' : ''}`} />
              <span>{ar ? 'إشارة' : 'Bookmark'}</span>
            </button>

            <button
              type="button"
              onClick={() => onViewModeChange(VIEW_MODES[(VIEW_MODES.indexOf(viewMode) + 1) % VIEW_MODES.length])}
              className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 border border-white/5 text-neutral-300 text-[10px]"
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
              className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 border border-white/5 text-neutral-300 text-[10px]"
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
              className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 border border-white/5 text-amber-300 text-[10px]"
            >
              <Settings2 className="w-4 h-4" />
              <span>{ar ? 'إعدادات' : 'Settings'}</span>
            </button>
          </div>

          <div className="pt-2 border-t border-white/10">
            <div className="flex items-center gap-1.5 text-[10px] text-neutral-400 font-mono mb-1.5">
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
                        ? 'border-amber-400 bg-amber-400/20 text-white'
                        : 'border-white/5 bg-white/5 text-neutral-300'
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

      <div
        dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
        style={{ bottom: 'max(0.6rem, calc(env(safe-area-inset-bottom, 0px) + 0.45rem))' }}
        className="fixed inset-x-0 z-40 flex justify-center px-2 pointer-events-none"
      >
        <div className="pointer-events-auto flex items-center gap-1 px-2 py-1.5 rounded-2xl bg-neutral-900/95 text-white border border-white/10 shadow-2xl backdrop-blur-xl">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            aria-label={t.prevPage}
            className="p-2 rounded-xl text-neutral-300 disabled:opacity-30 active:bg-white/15"
          >
            {ar ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>

          <button
            type="button"
            onClick={onOpenSidebar}
            className="px-3 py-1.5 rounded-xl bg-white/5 font-mono text-[11px] text-neutral-200"
          >
            {currentPage} / {totalPages}
          </button>

          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            aria-label={t.nextPage}
            className="p-2 rounded-xl text-neutral-300 disabled:opacity-30 active:bg-white/15"
          >
            {ar ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>

          <div className="w-px h-5 bg-white/10 mx-0.5" />

          <button
            type="button"
            onClick={onToggleBookmark}
            aria-label={isBookmarked ? t.removeBookmark : t.addBookmark}
            className={`p-2 rounded-xl active:bg-white/15 ${
              isBookmarked ? 'text-amber-400' : 'text-neutral-300'
            }`}
          >
            <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-amber-400' : ''}`} />
          </button>

          <button
            type="button"
            onClick={onToggleSearch}
            aria-label={t.searchTooltip}
            className="p-2 rounded-xl text-neutral-300 active:bg-white/15"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
};
