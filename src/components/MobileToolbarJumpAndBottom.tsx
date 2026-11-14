import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from 'lucide-react';
import { normalizeDigits } from '../core/search/arabic';
import { triggerHaptic } from '../core/utils/haptics';

interface MobileToolbarJumpModalProps {
  ar: boolean;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onClose: () => void;
}

/** Mobile page-jump modal with numeric input, scrubber slider, and quick offset controls. */
export const MobileToolbarJumpModal: React.FC<MobileToolbarJumpModalProps> = ({
  ar,
  currentPage,
  totalPages,
  onPageChange,
  onClose,
}) => {
  const [jumpValue, setJumpValue] = useState(() => String(currentPage));

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    const handleBack = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', close);
    window.addEventListener('otium:back', handleBack);
    return () => {
      window.removeEventListener('keydown', close);
      window.removeEventListener('otium:back', handleBack);
    };
  }, [onClose]);

  const submitPageJump = () => {
    const parsed = Number.parseInt(normalizeDigits(jumpValue).replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(parsed)) return;
    onPageChange(Math.min(totalPages, Math.max(1, parsed)));
    onClose();
  };

  return (
    <div
      dir={ar ? 'rtl' : 'ltr'}
      role="dialog"
      aria-modal="true"
      aria-label={ar ? 'الانتقال إلى صفحة' : 'Go to page'}
      className="fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center"
    >
      <div
        className="absolute inset-0 bg-scrim fluid-fade"
        onClick={onClose}
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitPageJump();
        }}
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
        className="chrome-surface relative z-10 w-full max-w-sm rounded-2xl p-4 text-ink fluid-sheet sm:fluid-pop shadow-2xl"
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
            onClick={onClose}
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
          className="mt-3 w-full rounded-xl border border-line bg-hover-subtle px-3 py-2 text-center font-mono text-2xl text-ink outline-none focus:border-accent/60"
        />

        {/* Quick interactive page scrubber */}
        <div className="mt-3 px-1">
          <input
            type="range"
            min={1}
            max={totalPages}
            value={Number(jumpValue) || currentPage}
            onChange={(event) => {
              const val = Number(event.target.value);
              setJumpValue(String(val));
              if (val === 1 || val === totalPages) {
                triggerHaptic('boundary');
              } else {
                triggerHaptic('selection');
              }
            }}
            className="w-full accent-accent cursor-pointer h-2 bg-line rounded-lg"
          />
          <div className="flex justify-between text-[10px] text-ink-muted font-mono mt-1">
            <span>1</span>
            <span className="text-accent font-semibold">
              {Math.round(((Number(jumpValue) || currentPage) / totalPages) * 100)}%
            </span>
            <span>{totalPages}</span>
          </div>
        </div>

        {/* Quick offset buttons */}
        <div className="mt-2.5 flex items-center justify-between gap-1.5 text-[11px] font-mono">
          <button
            type="button"
            onClick={() => { setJumpValue('1'); triggerHaptic('selection'); }}
            className="flex-1 py-1 rounded-lg bg-hover border border-line text-ink-muted hover:text-ink text-center"
          >
            {ar ? 'البداية' : '1'}
          </button>
          <button
            type="button"
            onClick={() => {
              const page = Math.max(1, (Number(jumpValue) || currentPage) - 10);
              setJumpValue(String(page));
              triggerHaptic('selection');
            }}
            className="flex-1 py-1 rounded-lg bg-hover border border-line text-ink-muted hover:text-ink text-center"
          >
            -10
          </button>
          <button
            type="button"
            onClick={() => {
              const page = Math.min(totalPages, (Number(jumpValue) || currentPage) + 10);
              setJumpValue(String(page));
              triggerHaptic('selection');
            }}
            className="flex-1 py-1 rounded-lg bg-hover border border-line text-ink-muted hover:text-ink text-center"
          >
            +10
          </button>
          <button
            type="button"
            onClick={() => { setJumpValue(String(totalPages)); triggerHaptic('selection'); }}
            className="flex-1 py-1 rounded-lg bg-hover border border-line text-ink-muted hover:text-ink text-center"
          >
            {ar ? 'النهاية' : totalPages}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
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
  );
};

interface MobileToolbarBottomBarProps {
  ar: boolean;
  contentIsRtl: boolean;
  immersive: boolean;
  bottomOffset: string;
  currentPage: number;
  totalPages: number;
  isBookmarked: boolean;
  prevPageLabel: string;
  nextPageLabel: string;
  addBookmarkLabel: string;
  removeBookmarkLabel: string;
  searchTooltipLabel: string;
  onPageChange: (page: number) => void;
  onPrevPage?: () => void;
  onNextPage?: () => void;
  onOpenJump: () => void;
  onToggleBookmark: () => void;
  onToggleSearch: () => void;
}

/** Floating mobile bottom navigation bar with RTL-aware arrows, page pill, bookmark, and search. */
export const MobileToolbarBottomBar: React.FC<MobileToolbarBottomBarProps> = ({
  ar,
  contentIsRtl,
  immersive,
  bottomOffset,
  currentPage,
  totalPages,
  isBookmarked,
  prevPageLabel,
  nextPageLabel,
  addBookmarkLabel,
  removeBookmarkLabel,
  searchTooltipLabel,
  onPageChange,
  onPrevPage,
  onNextPage,
  onOpenJump,
  onToggleBookmark,
  onToggleSearch,
}) => (
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
      {/* Left Arrow: In RTL (Arabic) flipping left advances to Next Page; in LTR it goes to Prev Page */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          if (contentIsRtl) {
            if (onNextPage) onNextPage();
            else onPageChange(Math.min(totalPages, currentPage + 1));
          } else {
            if (onPrevPage) onPrevPage();
            else onPageChange(Math.max(1, currentPage - 1));
          }
        }}
        disabled={contentIsRtl ? currentPage >= totalPages : currentPage <= 1}
        aria-label={contentIsRtl ? nextPageLabel : prevPageLabel}
        title={contentIsRtl ? nextPageLabel : prevPageLabel}
        className="fluid-press p-2 rounded-xl text-ink-muted disabled:opacity-30 active:bg-hover-strong cursor-pointer"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <button
        type="button"
        onClick={onOpenJump}
        aria-label={ar ? `الانتقال إلى صفحة، الحالية ${currentPage} من ${totalPages}` : `Go to page, currently ${currentPage} of ${totalPages}`}
        title={ar ? 'الانتقال إلى صفحة' : 'Go to page'}
        className="fluid-press px-3 py-1.5 rounded-xl bg-hover-subtle font-mono text-[11px] text-ink active:bg-hover-strong cursor-pointer"
      >
        {currentPage} / {totalPages}
      </button>

      {/* Right Arrow: In RTL (Arabic) flipping right goes back to Prev Page; in LTR it goes to Next Page */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          if (contentIsRtl) {
            if (onPrevPage) onPrevPage();
            else onPageChange(Math.max(1, currentPage - 1));
          } else {
            if (onNextPage) onNextPage();
            else onPageChange(Math.min(totalPages, currentPage + 1));
          }
        }}
        disabled={contentIsRtl ? currentPage <= 1 : currentPage >= totalPages}
        aria-label={contentIsRtl ? prevPageLabel : nextPageLabel}
        title={contentIsRtl ? prevPageLabel : nextPageLabel}
        className="fluid-press p-2 rounded-xl text-ink-muted disabled:opacity-30 active:bg-hover-strong cursor-pointer"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      <div className="mobile-chrome-extra w-px h-5 bg-hover mx-0.5" />

      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          onToggleBookmark();
        }}
        aria-label={isBookmarked ? removeBookmarkLabel : addBookmarkLabel}
        className={`fluid-press spring-press mobile-chrome-extra p-2 rounded-xl active:bg-hover-strong cursor-pointer ${
          isBookmarked ? 'text-highlight' : 'text-ink-muted'
        }`}
      >
        <Bookmark className={`w-4 h-4 transition-transform ${isBookmarked ? 'fill-highlight bookmark-pop' : ''}`} />
      </button>

      <button
        type="button"
        onClick={onToggleSearch}
        aria-label={searchTooltipLabel}
        className="fluid-press mobile-chrome-extra p-2 rounded-xl text-ink-muted active:bg-hover-strong cursor-pointer"
      >
        <Search className="w-4 h-4" />
      </button>
    </div>
  </div>
);
