import React from 'react';
import {
  Cast,
  Check,
  Maximize2,
  Minimize2,
  Palette,
  PenTool,
  ScanLine,
  Settings2,
  X,
} from 'lucide-react';
import type { ThemeMode } from '../core/types';
import type { getTranslations } from '../core/i18n/translations';

interface ToolbarThemeAndActionsProps {
  t: ReturnType<typeof getTranslations>;
  ar: boolean;
  theme: ThemeMode;
  themes: { id: ThemeMode; label: string; dot: string }[];
  showThemeMenu: boolean;
  isFullscreen: boolean;
  isBoardOpen?: boolean;
  isBeaming?: boolean;
  beamRoom?: string | null;
  beamRole?: 'receiver' | 'sender' | null;
  onToggleThemeMenu: () => void;
  onCloseThemeMenu: () => void;
  onThemeChange: (theme: ThemeMode) => void;
  onToggleFullscreen: () => void;
  onToggleBoard?: () => void;
  onOpenBeam?: () => void;
  onDisconnectBeam?: () => void;
  onOpenScanner?: () => void;
  onToggleSettings: () => void;
}

export const ToolbarThemeAndActions: React.FC<ToolbarThemeAndActionsProps> = ({
  t,
  ar,
  theme,
  themes,
  showThemeMenu,
  isFullscreen,
  isBoardOpen,
  isBeaming,
  beamRoom,
  beamRole,
  onToggleThemeMenu,
  onCloseThemeMenu,
  onThemeChange,
  onToggleFullscreen,
  onToggleBoard,
  onOpenBeam,
  onDisconnectBeam,
  onOpenScanner,
  onToggleSettings,
}) => (
  <>
    <div className="relative">
      <button
        type="button"
        onClick={onToggleThemeMenu}
        title={t.themeLabel}
        aria-label={t.themeLabel}
        aria-expanded={showThemeMenu}
        className={`toolbar-icon ${showThemeMenu ? 'bg-hover text-ink' : ''}`}
      >
        <Palette className="w-3.5 h-3.5" />
      </button>

      {showThemeMenu && (
        <>
          <div className="fixed inset-0 z-40 bg-transparent" onClick={onCloseThemeMenu} />
          <div className="chrome-surface absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl p-2.5 text-ink fluid-pop shadow-2xl border border-line">
            <div className="flex items-center justify-between px-1.5 pb-2 text-[10px] font-semibold uppercase text-ink-faint border-b border-line-subtle mb-2">
              <span className={ar ? 'font-sans' : 'font-mono tracking-wider'}>{t.readingThemesTitle}</span>
              <span className="font-mono text-[9px] opacity-70">10</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {themes.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    onThemeChange(entry.id);
                    onCloseThemeMenu();
                  }}
                  className={`group flex items-center justify-between rounded-xl px-2 py-1.5 text-xs transition-all duration-150 cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
                    theme === entry.id
                      ? 'bg-hover text-ink font-medium border border-line shadow-xs'
                      : 'text-ink-muted hover:bg-hover-subtle hover:text-ink border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`h-3 w-3 shrink-0 rounded-full border border-black/20 transition-transform duration-200 group-hover:scale-115 ${
                        theme === entry.id ? 'ring-2 ring-accent ring-offset-1 ring-offset-[var(--surface-1)]' : ''
                      }`}
                      style={{ backgroundColor: entry.dot }}
                    />
                    <span className="truncate text-[11px] group-hover:text-ink">{entry.label}</span>
                  </div>
                  {theme === entry.id && <Check className="w-3.5 h-3.5 text-accent shrink-0 animate-in zoom-in-75 duration-150" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>

    <button
      type="button"
      onClick={onToggleFullscreen}
      title={t.fullscreen}
      aria-label={t.fullscreen}
      className="toolbar-icon"
    >
      {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
    </button>

    {onToggleBoard && (
      <button
        type="button"
        onClick={onToggleBoard}
        title={
          isBoardOpen
            ? ar ? 'إغلاق السبورة الذكية' : 'Close Smartboard'
            : ar ? 'السبورة الذكية وتعدد المهام (Otium Board)' : 'Smartboard & Multitasking'
        }
        aria-label={ar ? 'السبورة الذكية' : 'Smartboard'}
        className={`toolbar-icon transition-all ${
          isBoardOpen
            ? 'bg-accent/20 text-accent font-semibold ring-1 ring-accent/40 shadow-sm'
            : 'text-ink-muted hover:text-ink'
        }`}
      >
        <PenTool className="w-3.5 h-3.5" />
      </button>
    )}

    {onOpenBeam && (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenBeam}
          title={
            isBeaming
              ? ar
                ? `متصل بالقاعة ${beamRoom || ''} (${beamRole === 'receiver' ? 'مستقبِل' : 'متحكّم'})`
                : `Connected to ${beamRoom || ''} (${beamRole === 'receiver' ? 'Receiver' : 'Remote'})`
              : ar ? 'بث إلى السبورة الذكية (Smart Beam)' : 'Beam to Smartboard'
          }
          aria-label={ar ? 'بث إلى السبورة' : 'Smart Beam'}
          className={`toolbar-icon transition-all ${
            isBeaming
              ? 'bg-emerald-500/20 text-emerald-500 font-semibold ring-1 ring-emerald-500/40 shadow-sm'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          <Cast className="w-3.5 h-3.5" />
        </button>
        {isBeaming && beamRoom && (
          <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <button
              type="button"
              onClick={onOpenBeam}
              className="hover:underline cursor-pointer"
              title={ar ? 'إدارة الاتصال' : 'Manage Beam'}
            >
              {beamRoom}
            </button>
            {onDisconnectBeam && (
              <button
                type="button"
                onClick={onDisconnectBeam}
                className="p-0.5 rounded-full hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 ml-0.5 cursor-pointer"
                title={ar ? 'قطع الاتصال' : 'Disconnect'}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        )}
      </div>
    )}

    {onOpenScanner && (
      <button
        type="button"
        onClick={onOpenScanner}
        title={ar ? 'المسح الضوئي بالكاميرا (Ctrl+Shift+S)' : 'Scan Document (Ctrl+Shift+S)'}
        aria-label={ar ? 'المسح الضوئي بالكاميرا' : 'Scan Document'}
        className="toolbar-icon text-accent hover:text-accent"
      >
        <ScanLine className="w-3.5 h-3.5" />
      </button>
    )}

    <button
      type="button"
      onClick={onToggleSettings}
      title={t.settingsTitle}
      aria-label={t.settingsTitle}
      className="toolbar-icon"
    >
      <Settings2 className="w-3.5 h-3.5" />
    </button>
  </>
);
