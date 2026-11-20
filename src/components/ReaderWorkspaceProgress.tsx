import React from 'react';
import type { Language } from '../core/i18n/translations';
import { AnimatedCounter } from './AnimatedCounter';

interface ReaderWorkspaceProgressProps {
  lang: Language;
  isRtl: boolean;
  compact: boolean;
  isImmersive: boolean;
  currentPage: number;
  numPages: number;
  scrubState: { page: number; x: number } | null;
  showScrubberPill: boolean;
  isPageFlipping?: boolean;
  settledPage: number;
  numberJumpDisplay: string | null;
  arrivalGlowKey: number;
  onScrubberPointerDown: (e: React.PointerEvent) => void;
  onScrubberPointerMove: (e: React.PointerEvent) => void;
  onScrubberPointerUp: () => void;
  onScrubberPointerLeave: () => void;
  onExitImmersive: () => void;
}

export const ReaderWorkspaceProgressBar: React.FC<ReaderWorkspaceProgressProps> = ({
  lang,
  compact,
  isImmersive,
  currentPage,
  numPages,
  scrubState,
  onScrubberPointerDown,
  onScrubberPointerMove,
  onScrubberPointerUp,
  onScrubberPointerLeave,
}) => (
  <>
    <div
      aria-hidden={isImmersive}
      role="progressbar"
      aria-label={lang === 'ar' ? 'تقدّم القراءة' : 'Reading progress'}
      aria-valuemin={1}
      aria-valuemax={Math.max(1, numPages)}
      aria-valuenow={currentPage}
      onPointerDown={compact ? undefined : onScrubberPointerDown}
      onPointerMove={compact ? undefined : onScrubberPointerMove}
      onPointerUp={compact ? undefined : onScrubberPointerUp}
      onPointerLeave={compact ? undefined : onScrubberPointerLeave}
      className={`fixed top-0 inset-x-0 ${compact ? 'h-[2.5px] pointer-events-none' : 'h-3 group cursor-pointer'} z-40 transition-opacity duration-300 flex items-start select-none ${
        isImmersive ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="w-full h-[2.5px] group-hover:h-[4px] bg-line/30 transition-all duration-150 relative">
        <div
          className="h-full bg-accent relative transition-all duration-300 ease-out will-change-[width]"
          style={{
            width: `${(currentPage / Math.max(1, numPages)) * 100}%`,
            transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <div
            aria-hidden="true"
            className="absolute -top-[1px] end-0 w-2.5 h-1 bg-accent rounded-full shadow-[0_0_8px_var(--accent)] opacity-85"
          />
        </div>
      </div>

      {!compact && scrubState && (
        <div
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          style={{
            left: `${scrubState.x}px`,
            transform: 'translateX(-50%)',
            top: '48px',
          }}
          className="fixed pointer-events-none z-50 chrome-surface px-3 py-1 rounded-full shadow-2xl border border-line text-[11px] font-mono text-ink flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-100 backdrop-blur-md"
        >
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="font-semibold text-accent font-sans">
            {lang === 'ar' ? `صفحة ${scrubState.page}` : `Page ${scrubState.page}`}
          </span>
          <span className="text-ink-muted">/</span>
          <span className="text-ink-muted">{numPages}</span>
          <span className="text-[10px] text-accent font-mono font-semibold">
            ({Math.round((scrubState.page / Math.max(1, numPages)) * 100)}%)
          </span>
        </div>
      )}
    </div>
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {lang === 'ar' ? `الصفحة ${currentPage} من ${numPages}` : `Page ${currentPage} of ${numPages}`}
    </div>
  </>
);

export const ReaderWorkspaceReadingPill: React.FC<
  Pick<
    ReaderWorkspaceProgressProps,
    | 'lang'
    | 'isRtl'
    | 'compact'
    | 'isImmersive'
    | 'currentPage'
    | 'numPages'
    | 'showScrubberPill'
    | 'isPageFlipping'
    | 'settledPage'
    | 'numberJumpDisplay'
    | 'arrivalGlowKey'
    | 'onExitImmersive'
  >
> = ({
  lang,
  isRtl,
  compact,
  isImmersive,
  currentPage,
  numPages,
  showScrubberPill,
  isPageFlipping = false,
  settledPage,
  numberJumpDisplay,
  arrivalGlowKey,
  onExitImmersive,
}) => {
  // Page number appears ONLY while flipping pages, scrubbing/scrolling, or jumping
  const isPagingActive = Boolean(numberJumpDisplay) || showScrubberPill || isPageFlipping || (!isImmersive && settledPage !== currentPage);

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      style={
        compact
          ? {
              bottom: isImmersive
                ? 'max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))'
                : 'max(5.5rem, calc(env(safe-area-inset-bottom, 0px) + 5rem))',
              left: '50%',
              transform: 'translateX(-50%)',
            }
          : undefined
      }
      className={`fixed z-40 transition-all duration-300 ease-out select-none ${
        compact
          ? ''
          : isImmersive
            ? 'bottom-8 end-8'
            : 'bottom-6 start-6'
      } ${
        isPagingActive
          ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
          : 'opacity-0 translate-y-3 scale-95 pointer-events-none'
      }`}
    >
      <button
        type="button"
        onClick={() => {
          if (isImmersive) onExitImmersive();
        }}
        disabled={!isImmersive && !numberJumpDisplay}
        title={
          isImmersive
            ? lang === 'ar'
              ? 'انقر لإظهار القوائم وأدوات المستند'
              : 'Click to show menus and document tools'
            : lang === 'ar'
              ? `صفحة ${currentPage} من ${numPages}`
              : `Page ${currentPage} of ${numPages}`
        }
        aria-label={
          isImmersive
            ? lang === 'ar'
              ? `صفحة ${currentPage} من ${numPages} - انقر لإظهار القوائم`
              : `Page ${currentPage} of ${numPages} - Click to show menus`
            : lang === 'ar'
              ? `صفحة ${currentPage} من ${numPages}`
              : `Page ${currentPage} of ${numPages}`
        }
        key={`page-pill-${arrivalGlowKey || 0}`}
        className={`chrome-surface spring-press flex items-center gap-2 rounded-full px-4 py-1.5 font-mono text-[12px] text-ink shadow-2xl backdrop-blur-2xl border border-line-subtle select-none ${
          isImmersive ? 'cursor-pointer hover:bg-hover active:scale-95' : ''
        } ${arrivalGlowKey ? 'soft-arrival-glow' : ''}`}
      >
        {numberJumpDisplay ? (
          <span className="flex items-center gap-1.5 text-accent font-semibold font-mono">
            <span>{lang === 'ar' ? 'انتقال إلى صفحة' : 'Jump to:'}</span>
            <span className="text-ink text-xs underline decoration-accent font-bold">{numberJumpDisplay}</span>
            <span className="text-[10px] text-ink-muted">(Enter ↵)</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 font-sans font-medium text-ink text-xs">
            <span>{lang === 'ar' ? 'صفحة' : 'Page'}</span>
            <span className="font-mono font-semibold text-accent"><AnimatedCounter value={currentPage} /></span>
            <span className="text-ink-muted">/ {numPages}</span>
            <span className="text-ink-faint text-[9px] mx-0.5">•</span>
            <span className="text-ink-muted font-mono text-[11px]">
              <AnimatedCounter value={Math.min(100, Math.round((currentPage / Math.max(1, numPages)) * 100))} />%
            </span>
          </span>
        )}
      </button>
    </div>
  );
};
