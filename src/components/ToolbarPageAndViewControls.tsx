import React from 'react';
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ViewMode } from '../core/types';
import type { getTranslations } from '../core/i18n/translations';

interface ToolbarPageNavigationProps {
  t: ReturnType<typeof getTranslations>;
  isAr: boolean;
  currentPage: number;
  totalPages: number;
  inputPage: string;
  onInputPageChange: (value: string) => void;
  onPageSubmit: (event: React.FormEvent) => void;
  onLeftStep: () => void;
  onRightStep: () => void;
}

export const ToolbarPageNavigation: React.FC<ToolbarPageNavigationProps> = ({
  t,
  isAr,
  currentPage,
  totalPages,
  inputPage,
  onInputPageChange,
  onPageSubmit,
  onLeftStep,
  onRightStep,
}) => (
  <div className="flex shrink-0 items-center gap-0.5">
    <button
      type="button"
      onClick={onLeftStep}
      disabled={isAr ? currentPage >= totalPages : currentPage <= 1}
      title={isAr ? t.nextPage : t.prevPage}
      aria-label={isAr ? t.nextPage : t.prevPage}
      className="toolbar-icon disabled:opacity-20"
    >
      <ChevronLeft className="w-4 h-4" />
    </button>

    <form
      onSubmit={onPageSubmit}
      className="flex items-center gap-1 rounded-lg bg-hover-subtle px-1.5 py-1 font-mono text-[11px]"
    >
      <input
        type="text"
        inputMode="numeric"
        value={inputPage}
        onChange={(event) => onInputPageChange(event.target.value)}
        onBlur={onPageSubmit}
        aria-label={t.pageOf(currentPage, totalPages)}
        className="w-7 bg-transparent text-center text-ink outline-none focus:text-accent"
      />
      <span className="select-none text-ink-faint">/ {totalPages}</span>
    </form>

    <button
      type="button"
      onClick={onRightStep}
      disabled={isAr ? currentPage <= 1 : currentPage >= totalPages}
      title={isAr ? t.prevPage : t.nextPage}
      aria-label={isAr ? t.prevPage : t.nextPage}
      className="toolbar-icon disabled:opacity-20"
    >
      <ChevronRight className="w-4 h-4" />
    </button>
  </div>
);

interface ToolbarZoomAndViewControlsProps {
  t: ReturnType<typeof getTranslations>;
  zoom: number;
  effectiveMinZoom: number;
  effectiveMaxZoom: number;
  zoomStep: number;
  isBookmarked: boolean;
  viewMode: ViewMode;
  viewModes: { id: ViewMode; icon: React.ReactNode; key: keyof ReturnType<typeof getTranslations> }[];
  onToggleBookmark?: () => void;
  onZoomChange: (zoom: number) => void;
  onViewModeChange: (mode: ViewMode) => void;
}

export const ToolbarZoomAndViewControls: React.FC<ToolbarZoomAndViewControlsProps> = ({
  t,
  zoom,
  effectiveMinZoom,
  effectiveMaxZoom,
  zoomStep,
  isBookmarked,
  viewMode,
  viewModes,
  onToggleBookmark,
  onZoomChange,
  onViewModeChange,
}) => (
  <>
    <button
      type="button"
      onClick={onToggleBookmark}
      title={isBookmarked ? t.removeBookmark : t.addBookmark}
      aria-label={isBookmarked ? t.removeBookmark : t.addBookmark}
      className={`toolbar-icon spring-press ${isBookmarked ? 'text-highlight' : ''}`}
    >
      <Bookmark className={`w-3.5 h-3.5 transition-transform ${isBookmarked ? 'fill-current bookmark-pop' : ''}`} />
    </button>

    <div className="flex items-center gap-0.5 rounded-lg bg-hover-subtle px-0.5">
      <button
        type="button"
        onClick={() => onZoomChange(Math.max(effectiveMinZoom, Number((zoom - zoomStep).toFixed(2))))}
        title={t.zoomOut}
        aria-label={t.zoomOut}
        className="toolbar-icon"
      >
        <ZoomOut className="w-3.5 h-3.5" />
      </button>
      <span className="w-8 select-none text-center font-mono text-[10px] text-ink-muted">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        onClick={() => onZoomChange(Math.min(effectiveMaxZoom, Number((zoom + zoomStep).toFixed(2))))}
        title={t.zoomIn}
        aria-label={t.zoomIn}
        className="toolbar-icon"
      >
        <ZoomIn className="w-3.5 h-3.5" />
      </button>
    </div>

    <div className="segmented ms-0.5 hidden lg:inline-flex">
      {viewModes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          data-active={viewMode === mode.id}
          onClick={() => onViewModeChange(mode.id)}
          title={t[mode.key] as string}
          aria-label={t[mode.key] as string}
        >
          {mode.icon}
        </button>
      ))}
    </div>
  </>
);
