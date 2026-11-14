import React from 'react';
import {
  Bookmark,
  Cast,
  Maximize2,
  Minimize2,
  PenTool,
  ScanLine,
  Settings2,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import type { ThemeMode, ViewMode } from '../core/types';
import type { getTranslations } from '../core/i18n/translations';

interface ToolbarThemeItem {
  id: ThemeMode;
  label: string;
  dot: string;
}

interface ToolbarMobileMoreSheetProps {
  t: ReturnType<typeof getTranslations>;
  ar: boolean;
  zoom: number;
  effectiveMinZoom: number;
  effectiveMaxZoom: number;
  zoomStep: number;
  isBookmarked?: boolean;
  viewMode: ViewMode;
  viewModeIcon?: React.ReactNode;
  isFullscreen: boolean;
  isBoardOpen?: boolean;
  isBeaming?: boolean;
  themes: ToolbarThemeItem[];
  theme: ThemeMode;
  onZoomChange: (zoom: number) => void;
  onToggleBookmark?: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleFullscreen: () => void;
  onToggleSettings: () => void;
  onToggleBoard?: () => void;
  onOpenBeam?: () => void;
  onOpenScanner?: () => void;
  onThemeChange: (theme: ThemeMode) => void;
  onClose: () => void;
}

export const ToolbarMobileMoreSheet: React.FC<ToolbarMobileMoreSheetProps> = ({
  t,
  ar,
  zoom,
  effectiveMinZoom,
  effectiveMaxZoom,
  zoomStep,
  isBookmarked,
  viewMode,
  viewModeIcon,
  isFullscreen,
  isBoardOpen,
  isBeaming,
  themes,
  theme,
  onZoomChange,
  onToggleBookmark,
  onViewModeChange,
  onToggleFullscreen,
  onToggleSettings,
  onToggleBoard,
  onOpenBeam,
  onOpenScanner,
  onThemeChange,
  onClose
}) => (
  <>
    <div
      className="fixed inset-0 z-40 bg-transparent"
      onClick={onClose}
    />
    <div className="chrome-surface pointer-events-auto absolute end-3 top-full mt-2 flex w-[min(23rem,calc(100vw-1rem))] flex-col gap-3 rounded-2xl p-3.5 text-ink z-50 shadow-2xl fluid-pop">
      <div className="flex items-center justify-between gap-2 rounded-xl bg-hover-subtle px-2.5 py-2">
        <span className="text-[11px] font-medium text-ink-muted">{t.zoomLevel}</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onZoomChange(Math.max(effectiveMinZoom, Number((zoom - zoomStep).toFixed(2))))}
            className="toolbar-icon bg-surface-2"
            aria-label={t.zoomOut}
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="w-9 text-center font-mono text-xs text-ink">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => onZoomChange(Math.min(effectiveMaxZoom, Number((zoom + zoomStep).toFixed(2))))}
            className="toolbar-icon bg-surface-2"
            aria-label={t.zoomIn}
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        <button
          type="button"
          onClick={onToggleBookmark}
          className={`flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2 text-[10px] transition-colors ${
            isBookmarked
              ? 'border-accent/40 bg-accent/10 text-accent'
              : 'border-line-subtle bg-hover-subtle text-ink-muted'
          }`}
        >
          <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
          <span>{ar ? 'إشارة' : 'Bookmark'}</span>
        </button>

        <button
          type="button"
          onClick={() =>
            onViewModeChange(
              viewMode === 'continuous' ? 'dual' : viewMode === 'dual' ? 'single' : 'continuous'
            )
          }
          className="flex flex-col items-center gap-1.5 rounded-xl border border-line-subtle bg-hover-subtle px-1 py-2 text-[10px] text-ink-muted transition-colors"
        >
          {viewModeIcon}
          <span>
            {viewMode === 'continuous'
              ? ar ? 'مستمر' : 'Scroll'
              : viewMode === 'dual'
                ? ar ? 'صفحتين' : 'Spread'
                : ar ? 'مفردة' : 'Single'}
          </span>
        </button>

        <button
          type="button"
          onClick={onToggleFullscreen}
          className="flex flex-col items-center gap-1.5 rounded-xl border border-line-subtle bg-hover-subtle px-1 py-2 text-[10px] text-ink-muted transition-colors"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          <span>{t.fullscreen.split(' ')[0]}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onToggleSettings();
            onClose();
          }}
          className="flex flex-col items-center gap-1.5 rounded-xl border border-line-subtle bg-hover-subtle px-1 py-2 text-[10px] text-accent transition-colors"
        >
          <Settings2 className="w-4 h-4" />
          <span>{t.settingsTitle.split(' ')[0]}</span>
        </button>

        {onToggleBoard && (
          <button
            type="button"
            onClick={() => {
              onToggleBoard();
              onClose();
            }}
            className={`flex flex-col items-center gap-1.5 rounded-xl border border-line-subtle px-1 py-2 text-[10px] transition-colors ${
              isBoardOpen ? 'bg-accent/20 text-accent font-semibold border-accent/40' : 'bg-hover-subtle text-ink'
            }`}
          >
            <PenTool className="w-4 h-4" />
            <span>{ar ? 'السبورة' : 'Board'}</span>
          </button>
        )}

        {onOpenBeam && (
          <button
            type="button"
            onClick={() => {
              onOpenBeam();
              onClose();
            }}
            className={`flex flex-col items-center gap-1.5 rounded-xl border border-line-subtle px-1 py-2 text-[10px] transition-colors ${
              isBeaming ? 'bg-emerald-500/20 text-emerald-500 font-semibold border-emerald-500/40' : 'bg-hover-subtle text-accent'
            }`}
          >
            <Cast className="w-4 h-4" />
            <span>{ar ? 'بث للسبورة' : 'Beam'}</span>
          </button>
        )}

        {onOpenScanner && (
          <button
            type="button"
            onClick={() => {
              onOpenScanner();
              onClose();
            }}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-line-subtle bg-hover-subtle px-1 py-2 text-[10px] text-accent transition-colors"
          >
            <ScanLine className="w-4 h-4" />
            <span>{ar ? 'سكانر' : 'Scan'}</span>
          </button>
        )}
      </div>

      <div className="space-y-1.5 border-t border-line-subtle pt-2">
        <div className="flex items-center justify-between font-mono text-[10px] text-ink-muted">
          <span>{t.readingThemesTitle}</span>
          <span className="text-[9px] opacity-70">10</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
          {themes.map((entry) => {
            const selected = theme === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                title={entry.label}
                onClick={() => {
                  onThemeChange(entry.id);
                  onClose();
                }}
                className={`flex items-center justify-center gap-1.5 rounded-xl border px-1.5 py-1.5 text-[10px] transition-colors ${
                  selected
                    ? 'border-accent bg-accent/15 text-ink font-semibold'
                    : 'border-line-subtle bg-hover-subtle text-ink-muted hover:bg-hover'
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/20"
                  style={{ backgroundColor: entry.dot }}
                />
                <span className="truncate">{entry.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  </>
);
