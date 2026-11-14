import React from 'react';
import {
  Bookmark,
  Cast,
  Layers,
  Palette,
  ScanLine,
  Settings2,
  X,
} from 'lucide-react';
import type { ThemeMode, ViewMode } from '../core/types';
import type { getTranslations, Language } from '../core/i18n/translations';

interface MobileToolbarMenuProps {
  t: ReturnType<typeof getTranslations>;
  currentLang: Language;
  ar: boolean;
  compactLandscape: boolean;
  theme: ThemeMode;
  themes: { id: ThemeMode; dot: string }[];
  viewMode: ViewMode;
  viewModes: ViewMode[];
  viewModeIcon: React.ReactNode;
  viewModeLabel: string;
  isBookmarked: boolean;
  isBeaming: boolean;
  beamRoom?: string | null;
  onClose: () => void;
  onToggleBookmark: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onOpenSidebar: () => void;
  onOpenScanner?: () => void;
  onOpenBeam?: () => void;
  onOpenSettings: () => void;
  onThemeChange: (theme: ThemeMode) => void;
}

export const MobileToolbarMenu: React.FC<MobileToolbarMenuProps> = ({
  t,
  currentLang,
  ar,
  compactLandscape,
  theme,
  themes,
  viewMode,
  viewModes,
  viewModeIcon,
  viewModeLabel,
  isBookmarked,
  isBeaming,
  beamRoom,
  onClose,
  onToggleBookmark,
  onViewModeChange,
  onOpenSidebar,
  onOpenScanner,
  onOpenBeam,
  onOpenSettings,
  onThemeChange,
}) => (
  <div
    dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
    style={{ top: compactLandscape ? 'max(2.9rem, calc(env(safe-area-inset-top, 0px) + 2.5rem))' : undefined }}
    className="fixed inset-x-2 top-16 z-50 mx-auto max-w-lg rounded-2xl chrome-surface p-3 text-ink space-y-3 fluid-pop shadow-2xl"
  >
    <div className="flex items-center justify-between">
      <span className={`text-[10px] uppercase text-ink-faint ${currentLang === 'ar' ? 'font-sans' : 'font-mono tracking-wider'}`}>
        {t.moreTools}
      </span>
      <button
        type="button"
        onClick={onClose}
        className="p-1 rounded-full text-ink-muted hover:text-ink hover:bg-hover"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>

    <div className="grid grid-cols-3 gap-1.5">
      <button
        type="button"
        onClick={() => {
          onToggleBookmark();
          onClose();
        }}
        className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border text-[10px] transition-colors ${
          isBookmarked
            ? 'bg-accent/20 text-accent border-accent/40'
            : 'bg-hover-subtle text-ink-muted border-line-subtle'
        }`}
      >
        <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-highlight' : ''}`} />
        <span className="truncate">{ar ? 'إشارة' : 'Mark'}</span>
      </button>

      <button
        type="button"
        onClick={() => {
          const nextMode = viewModes[(viewModes.indexOf(viewMode) + 1) % viewModes.length];
          if (nextMode) onViewModeChange(nextMode);
        }}
        className="flex flex-col items-center gap-1 p-1.5 rounded-xl bg-hover-subtle border border-line-subtle text-ink-muted text-[10px]"
      >
        {viewModeIcon}
        <span className="truncate">{viewModeLabel}</span>
      </button>

      <button
        type="button"
        onClick={() => {
          onOpenSidebar();
          onClose();
        }}
        className="flex flex-col items-center gap-1 p-1.5 rounded-xl bg-hover-subtle border border-line-subtle text-ink-muted text-[10px]"
      >
        <Layers className="w-4 h-4" />
        <span className="truncate">{t.pagesTab}</span>
      </button>

      {onOpenScanner && (
        <button
          type="button"
          onClick={() => {
            onOpenScanner();
            onClose();
          }}
          className="flex flex-col items-center gap-1 p-1.5 rounded-xl bg-accent/15 border border-accent/30 text-accent text-[10px] active:scale-95 transition-all cursor-pointer"
        >
          <ScanLine className="w-4 h-4 text-accent" />
          <span className="truncate font-semibold">{ar ? 'الماسح' : 'Scanner'}</span>
        </button>
      )}

      {onOpenBeam && (
        <button
          type="button"
          onClick={() => {
            onOpenBeam();
            onClose();
          }}
          className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border text-[10px] active:scale-95 transition-all cursor-pointer ${
            isBeaming
              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 ring-1 ring-emerald-500/30'
              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
          }`}
        >
          <Cast className="w-4 h-4" />
          <span className="truncate font-semibold">
            {isBeaming ? (beamRoom || (ar ? 'متصل' : 'Connected')) : (ar ? 'بث للسبورة' : 'Beam')}
          </span>
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          onOpenSettings();
          onClose();
        }}
        className="flex flex-col items-center gap-1 p-1.5 rounded-xl bg-hover-subtle border border-line-subtle text-ink-muted hover:text-ink text-[10px]"
      >
        <Settings2 className="w-4 h-4" />
        <span className="truncate">{ar ? 'إعدادات' : 'Settings'}</span>
      </button>
    </div>

    <div className="pt-2 border-t border-line">
      <div className="flex items-center justify-between text-[10px] text-ink-muted font-mono mb-1.5">
        <div className="flex items-center gap-1.5">
          <Palette className="w-3 h-3" />
          <span>{t.readingThemesTitle}</span>
        </div>
        <span className="text-[9px] opacity-70">10</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
        {themes.map((item) => {
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
);
