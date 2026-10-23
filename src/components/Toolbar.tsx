import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Palette,
  Columns,
  Scroll,
  Search,
  MoreHorizontal,
  Settings2,
  Bookmark,
  Layers,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  PenTool
} from 'lucide-react';
import type { ThemeMode, ViewMode } from '../types';
import type { Language } from '../utils/translations';
import { getTranslations } from '../utils/translations';
import { OtiumLogo } from './OtiumLogo';

interface ToolbarProps {
  title: string;
  currentPage: number;
  totalPages: number;
  zoom: number;
  theme: ThemeMode;
  viewMode: ViewMode;
  currentLang: Language;
  isFullscreen: boolean;
  isBookmarked?: boolean;
  isBoardMode?: boolean;
  onToggleBoardMode?: () => void;
  onPageChange: (page: number) => void;
  onZoomChange: (zoom: number) => void;
  onThemeChange: (theme: ThemeMode) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleBookmark?: () => void;
  onToggleFullscreen: () => void;
  onToggleSidebar: () => void;
  onToggleSearch: () => void;
  onToggleSettings: () => void;
  onCloseDocument: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  title,
  currentPage,
  totalPages,
  zoom,
  theme,
  viewMode,
  currentLang,
  isFullscreen,
  isBookmarked = false,
  isBoardMode = false,
  onToggleBoardMode,
  onPageChange,
  onZoomChange,
  onThemeChange,
  onViewModeChange,
  onToggleBookmark,
  onToggleFullscreen,
  onToggleSidebar,
  onToggleSearch,
  onToggleSettings,
  onCloseDocument
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showMoreMobile, setShowMoreMobile] = useState(false);
  const [inputPage, setInputPage] = useState(currentPage.toString());

  const t = getTranslations(currentLang);

  const toggleViewMode = () => {
    if (viewMode === 'continuous') {
      onViewModeChange('dual');
    } else if (viewMode === 'dual') {
      onViewModeChange('single');
    } else {
      onViewModeChange('continuous');
    }
  };

  useEffect(() => {
    setInputPage(currentPage.toString());
  }, [currentPage]);

  // Auto-hide toolbar after inactivity
  useEffect(() => {
    let timeout: any;
    const handleActivity = () => {
      setIsVisible(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (!showThemeMenu && !showMoreMobile) {
          setIsVisible(false);
        }
      }, 5000);
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity, { passive: true });
    window.addEventListener('scroll', handleActivity, { passive: true });
    handleActivity();

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      clearTimeout(timeout);
    };
  }, [showThemeMenu, showMoreMobile]);

  const handlePageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(inputPage, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      onPageChange(pageNum);
    } else {
      setInputPage(currentPage.toString());
    }
  };

  const themes: { id: ThemeMode; label: string; dot: string }[] = [
    { id: 'paper', label: t.themes.paper, dot: '#d4c5a9' },
    { id: 'midnight', label: t.themes.midnight, dot: '#38bdf8' },
    { id: 'amoled', label: t.themes.amoled, dot: '#10b981' },
    { id: 'parchment', label: t.themes.parchment, dot: '#d97706' },
    { id: 'amber', label: t.themes.amber, dot: '#f59e0b' },
    { id: 'eink', label: t.themes.eink, dot: '#9ca3af' },
    { id: 'pure', label: t.themes.pure, dot: '#f8fafc' },
  ];

  return (
    <div
      dir="rtl"
      style={{
        top: 'max(0.75rem, calc(env(safe-area-inset-top, 0px) + 0.6rem))'
      }}
      className={`fixed inset-x-0 z-40 flex flex-col items-center pointer-events-none transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
      }`}
    >
      <div className="pointer-events-auto flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 rounded-full bg-neutral-900/95 text-white border border-white/10 shadow-2xl backdrop-blur-xl transition-all">
        {/* Prominent Back Button (العودة للمكتبة) */}
        <button
          type="button"
          onClick={onCloseDocument}
          title={currentLang === 'ar' ? 'العودة للمكتبة' : 'Back to Library'}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 active:scale-95 text-emerald-300 hover:text-emerald-200 transition-all cursor-pointer shrink-0 border border-emerald-500/30"
        >
          {currentLang === 'ar' ? (
            <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <ArrowLeft className="w-3.5 h-3.5 text-emerald-400" />
          )}
          <span className="text-[11px] font-medium hidden sm:inline">
            {currentLang === 'ar' ? 'المكتبة' : 'Library'}
          </span>
        </button>

        {/* Emerald Otium Logo */}
        <div className="p-0.5 flex items-center justify-center shrink-0">
          <OtiumLogo theme="amoled" size={20} />
        </div>

        {/* Sidebar Trigger */}
        <button
          onClick={onToggleSidebar}
          title={t.pagesTab}
          className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 text-neutral-300 transition-colors shrink-0 cursor-pointer"
        >
          <Layers className="w-4 h-4" />
        </button>

        {/* Document Title */}
        <div
          title={title}
          className="max-w-[75px] sm:max-w-[140px] md:max-w-[200px] truncate font-medium text-neutral-300 select-none text-xs px-1 hidden sm:block shrink-0"
        >
          {title}
        </div>

        {/* Divider */}
        <div className="w-[1px] h-4 bg-white/10 mx-0.5 shrink-0" />

        {/* Search */}
        <button
          onClick={onToggleSearch}
          title={t.searchTooltip}
          className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 text-neutral-300 transition-colors shrink-0 cursor-pointer"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Smart Board Button (السبورة الذكية) */}
        {onToggleBoardMode && (
          <button
            onClick={onToggleBoardMode}
            title={t.smartboardTooltip}
            className={`p-1.5 sm:p-2 rounded-full transition-all shrink-0 cursor-pointer ${
              isBoardMode
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/35 ring-1 ring-emerald-300'
                : 'hover:bg-white/10 text-neutral-300'
            }`}
          >
            <PenTool className="w-4 h-4" />
          </button>
        )}

        {/* Page Nav */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            title={t.prevPage}
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 disabled:opacity-20 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <form onSubmit={handlePageSubmit} className="flex items-center gap-1 font-mono text-xs">
            <input
              type="text"
              value={inputPage}
              onChange={(e) => setInputPage(e.target.value)}
              onBlur={handlePageSubmit}
              className="w-8 sm:w-9 text-center bg-white/10 rounded py-0.5 px-0.5 text-white focus:outline-none focus:ring-1 focus:ring-amber-400 text-xs"
            />
            <span className="opacity-40 select-none text-[11px]">/ {totalPages}</span>
          </form>

          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            title={t.nextPage}
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 disabled:opacity-20 transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* DESKTOP ONLY CONTROLS */}
        <div className="hidden md:flex items-center gap-1 sm:gap-1.5 shrink-0">
          <div className="w-[1px] h-4 bg-white/10 mx-0.5" />

          {/* Bookmark Button */}
          <button
            onClick={onToggleBookmark}
            title={isBookmarked ? t.removeBookmark : t.addBookmark}
            className={`p-1.5 rounded-full transition-all flex items-center cursor-pointer ${
              isBookmarked
                ? 'bg-amber-400/20 text-amber-400 shadow-xs'
                : 'hover:bg-white/10 text-neutral-300'
            }`}
          >
            <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-amber-400' : ''}`} />
          </button>

          {/* Zoom */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => onZoomChange(Math.max(0.4, Number((zoom - 0.15).toFixed(2))))}
              title={t.zoomOut}
              className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 transition-colors cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-[11px] w-9 text-center text-neutral-300 select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => onZoomChange(Math.min(2.5, Number((zoom + 0.15).toFixed(2))))}
              title={t.zoomIn}
              className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 transition-colors cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="w-[1px] h-4 bg-white/10 mx-0.5" />

          {/* View Mode Toggle (Continuous -> Dual -> Single) */}
          <button
            onClick={toggleViewMode}
            title={
              viewMode === 'continuous'
                ? t.dualMode
                : viewMode === 'dual'
                ? t.singleMode
                : t.continuousMode
            }
            className={`p-1.5 rounded-full transition-colors cursor-pointer ${
              viewMode === 'dual' ? 'bg-amber-400/20 text-amber-300' : 'hover:bg-white/10 text-neutral-300'
            }`}
          >
            {viewMode === 'continuous' ? (
              <Scroll className="w-3.5 h-3.5" />
            ) : viewMode === 'dual' ? (
              <BookOpen className="w-3.5 h-3.5" />
            ) : (
              <Columns className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Themes Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              title={t.themeLabel}
              className={`p-1.5 rounded-full transition-colors flex items-center cursor-pointer ${
                showThemeMenu ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-neutral-300'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
            </button>

            {showThemeMenu && (
              <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl bg-neutral-900/98 border border-white/10 p-1.5 shadow-2xl backdrop-blur-xl z-50 text-neutral-200 animate-in fade-in zoom-in-95 duration-150">
                <div className="text-[10px] uppercase font-mono px-2.5 py-1 text-neutral-500 font-semibold tracking-wider">
                  {t.readingThemesTitle}
                </div>
                {themes.map((th) => (
                  <button
                    key={th.id}
                    onClick={() => {
                      onThemeChange(th.id);
                      setShowThemeMenu(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                      theme === th.id ? 'bg-white/15 text-white font-medium' : 'hover:bg-white/5 text-neutral-300'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/20"
                      style={{ backgroundColor: th.dot }}
                    />
                    <span>{th.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fullscreen */}
          <button
            onClick={onToggleFullscreen}
            title={t.fullscreen}
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 transition-colors cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Settings Trigger */}
          <button
            onClick={onToggleSettings}
            title={t.settingsTitle}
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* MOBILE MORE MENU BUTTON (< md) */}
        <div className="md:hidden flex items-center gap-0.5 shrink-0">
          <div className="w-[1px] h-4 bg-white/10 mx-0.5" />
          <button
            onClick={() => {
              setShowMoreMobile(!showMoreMobile);
              setShowThemeMenu(false);
            }}
            title={t.moreTools}
            className={`p-1.5 sm:p-2 rounded-full transition-colors cursor-pointer ${
              showMoreMobile ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-neutral-300'
            }`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* MOBILE POPUP TOOLBAR DRAWER */}
      {showMoreMobile && (
        <div className="pointer-events-auto md:hidden mt-2 p-3 rounded-2xl bg-neutral-900/98 border border-white/10 shadow-2xl backdrop-blur-2xl z-50 text-neutral-200 flex flex-col gap-3 w-72 max-w-[90vw] animate-in fade-in zoom-in-95 duration-150">
          
          {/* Mobile Zoom Row */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-neutral-400 font-medium">{t.zoomLevel}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onZoomChange(Math.max(0.4, Number((zoom - 0.15).toFixed(2))))}
                className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 cursor-pointer"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="font-mono text-xs w-9 text-center text-neutral-200">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => onZoomChange(Math.min(2.5, Number((zoom + 0.15).toFixed(2))))}
                className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 cursor-pointer"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Action Toggles */}
          <div className="grid grid-cols-5 gap-1">
            <button
              onClick={onToggleBookmark}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-[10px] transition-all cursor-pointer ${
                isBookmarked
                  ? 'bg-amber-400/20 text-amber-300 border-amber-400/40'
                  : 'bg-white/5 text-neutral-300 border-white/5 hover:bg-white/10'
              }`}
            >
              <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-amber-400 text-amber-400' : ''}`} />
              <span>إشارة</span>
            </button>

            {/* Smartboard Toggle for Mobile/Tablet */}
            <button
              onClick={() => {
                onToggleBoardMode?.();
                setShowMoreMobile(false);
              }}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-[10px] transition-all cursor-pointer ${
                isBoardMode
                  ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400/40'
                  : 'bg-white/5 text-neutral-300 border-white/5 hover:bg-white/10'
              }`}
            >
              <PenTool className="w-4 h-4" />
              <span>سبورة</span>
            </button>

            <button
              onClick={toggleViewMode}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-[10px] transition-all cursor-pointer ${
                viewMode === 'dual'
                  ? 'bg-amber-400/20 text-amber-300 border-amber-400/40'
                  : 'bg-white/5 text-neutral-300 border-white/5 hover:bg-white/10'
              }`}
            >
              {viewMode === 'continuous' ? (
                <Scroll className="w-4 h-4" />
              ) : viewMode === 'dual' ? (
                <BookOpen className="w-4 h-4" />
              ) : (
                <Columns className="w-4 h-4" />
              )}
              <span>
                {viewMode === 'continuous' ? 'مستمر' : viewMode === 'dual' ? 'صفحتين' : 'مفردة'}
              </span>
            </button>

            <button
              onClick={onToggleFullscreen}
              className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-neutral-300 text-[10px] transition-all cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span>{t.fullscreen.split(' ')[0]}</span>
            </button>

            <button
              onClick={() => {
                onToggleSettings();
                setShowMoreMobile(false);
              }}
              className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-amber-300 text-[10px] transition-all cursor-pointer"
            >
              <Settings2 className="w-4 h-4" />
              <span>{t.settingsTitle.split(' ')[0]}</span>
            </button>
          </div>

          {/* Themes Swatches */}
          <div className="pt-2 border-t border-white/10 space-y-1.5">
            <div className="text-[10px] text-neutral-400 font-mono">{t.readingThemesTitle}</div>
            <div className="grid grid-cols-4 gap-1.5">
              {themes.map((th) => {
                const isSelected = theme === th.id;
                return (
                  <button
                    key={th.id}
                    onClick={() => {
                      onThemeChange(th.id);
                      setShowMoreMobile(false);
                    }}
                    className={`flex items-center gap-1.5 p-1.5 rounded-xl border text-[10px] transition-all cursor-pointer ${
                      isSelected
                        ? 'border-amber-400 bg-amber-400/20 text-white font-medium'
                        : 'border-white/5 bg-white/5 hover:bg-white/10 text-neutral-300'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20"
                      style={{ backgroundColor: th.dot }}
                    />
                    <span className="truncate">{th.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
