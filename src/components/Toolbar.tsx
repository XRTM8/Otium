import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Palette,
  Menu,
  X,
  Glasses,
  Columns,
  Scroll,
  HelpCircle,
  Search,
  MoreHorizontal,
  Layers,
  Settings2,
  Bookmark,
  BookOpen,
  Moon
} from 'lucide-react';
import type { ThemeMode, ViewMode, PaperStyle } from '../types';
import type { Language } from '../utils/translations';
import { getTranslations } from '../utils/translations';
import { OtiumLogo } from './OtiumLogo';

interface ToolbarProps {
  title: string;
  currentPage: number;
  totalPages: number;
  zoom: number;
  theme: ThemeMode;
  paperStyle: PaperStyle;
  viewMode: ViewMode;
  currentLang: Language;
  isFocusRulerActive: boolean;
  isFullscreen: boolean;
  isBookmarked?: boolean;
  dimmerOpacity?: number;
  onPageChange: (page: number) => void;
  onZoomChange: (zoom: number) => void;
  onThemeChange: (theme: ThemeMode) => void;
  onPaperStyleChange: (style: PaperStyle) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleBookmark?: () => void;
  onDimmerChange?: (val: number) => void;
  onToggleFocusRuler: () => void;
  onToggleFullscreen: () => void;
  onToggleSidebar: () => void;
  onToggleSearch: () => void;
  onToggleShortcuts: () => void;
  onToggleSettings: () => void;
  onCloseDocument: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  title,
  currentPage,
  totalPages,
  zoom,
  theme,
  paperStyle,
  viewMode,
  currentLang,
  isFocusRulerActive,
  isFullscreen,
  isBookmarked = false,
  dimmerOpacity = 0,
  onPageChange,
  onZoomChange,
  onThemeChange,
  onPaperStyleChange,
  onViewModeChange,
  onToggleBookmark,
  onDimmerChange,
  onToggleFocusRuler,
  onToggleFullscreen,
  onToggleSidebar,
  onToggleSearch,
  onToggleShortcuts,
  onToggleSettings,
  onCloseDocument
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showPaperMenu, setShowPaperMenu] = useState(false);
  const [showDimmerMenu, setShowDimmerMenu] = useState(false);
  const [showMoreMobile, setShowMoreMobile] = useState(false);
  const [inputPage, setInputPage] = useState(currentPage.toString());

  const t = getTranslations(currentLang);

  const cycleViewMode = () => {
    if (viewMode === 'continuous') onViewModeChange('single');
    else if (viewMode === 'single') onViewModeChange('dual');
    else onViewModeChange('continuous');
  };

  const estimatedMinsLeft = Math.max(1, Math.round((totalPages - currentPage) * 1.5));

  useEffect(() => {
    setInputPage(currentPage.toString());
  }, [currentPage]);

  // Auto-hide toolbar after inactivity (supports touch and mouse)
  useEffect(() => {
    let timeout: any;
    const handleActivity = () => {
      setIsVisible(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (!showThemeMenu && !showPaperMenu && !showMoreMobile) {
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
    { id: 'eink', label: t.themes.eink, dot: '#a3a3a3' },
    { id: 'pure', label: t.themes.pure, dot: '#818cf8' }
  ];

  const paperStylesList: { id: PaperStyle; label: string; iconBg: string }[] = [
    { id: 'smooth', label: t.paperStyles.smooth, iconBg: '#ffffff' },
    { id: 'book', label: t.paperStyles.book, iconBg: '#fdfbf7' },
    { id: 'parchment', label: t.paperStyles.parchment, iconBg: '#f7f1e1' },
    { id: 'linen', label: t.paperStyles.linen, iconBg: '#f9f8f5' },
    { id: 'kraft', label: t.paperStyles.kraft, iconBg: '#f4ede1' },
    { id: 'moleskine', label: t.paperStyles.moleskine, iconBg: '#faf6ee' }
  ];

  return (
    <div
      className={`fixed top-3 sm:top-4 inset-x-0 z-30 flex flex-col items-center px-3 sm:px-4 transition-all duration-300 pointer-events-none ${
        isVisible ? 'translate-y-0 opacity-100' : '-translate-y-20 opacity-0'
      }`}
    >
      {/* Primary Floating Capsule */}
      <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full shadow-2xl backdrop-blur-2xl border transition-all duration-300 text-xs sm:text-sm bg-neutral-900/90 text-neutral-100 border-white/10 hover:border-white/20 shadow-black/60 max-w-full">
        
        {/* Brand Monogram with Theme Sync */}
        <div className="flex items-center gap-1.5 pl-1 pr-1.5 shrink-0">
          <OtiumLogo size={18} theme={theme} />
          <span className="font-bold text-xs tracking-wider text-neutral-200 hidden lg:inline">
            OTIUM
          </span>
        </div>

        {/* Divider */}
        <div className="w-[1px] h-4 bg-white/10 mx-0.5 shrink-0" />

        {/* Close & Sidebar */}
        <button
          onClick={onCloseDocument}
          title={t.closeDoc}
          className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>

        <button
          onClick={onToggleSidebar}
          title={t.tableOfContents}
          className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 text-neutral-300 transition-colors shrink-0"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Divider */}
        <div className="w-[1px] h-4 bg-white/10 mx-0.5 shrink-0 hidden sm:block" />

        {/* Document Title (Hidden on tiny screens to preserve space) */}
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
          className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 text-neutral-300 transition-colors shrink-0"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Page Nav */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button
            onClick={() => onPageChange(viewMode === 'dual' ? Math.max(1, currentPage - 2) : Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            title={t.prevPage}
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 disabled:opacity-20 transition-colors"
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
            <span className="hidden xl:inline text-[10px] text-amber-400/80 font-sans pl-1">
              • {t.timeLeftEst(estimatedMinsLeft)}
            </span>
          </form>

          <button
            onClick={() => onPageChange(viewMode === 'dual' ? Math.min(totalPages, currentPage + 2) : Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            title={t.nextPage}
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 disabled:opacity-20 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* DESKTOP ONLY CONTROLS (Hidden on mobile < md) */}
        <div className="hidden md:flex items-center gap-1 sm:gap-1.5 shrink-0">
          <div className="w-[1px] h-4 bg-white/10 mx-0.5" />

          {/* Bookmark Button */}
          <button
            onClick={onToggleBookmark}
            title={isBookmarked ? t.removeBookmark : t.addBookmark}
            className={`p-1.5 rounded-full transition-all flex items-center ${
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
              className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-[11px] w-9 text-center text-neutral-300 select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => onZoomChange(Math.min(2.5, Number((zoom + 0.15).toFixed(2))))}
              title={t.zoomIn}
              className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 transition-colors"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="w-[1px] h-4 bg-white/10 mx-0.5" />

          {/* Focus Mode Ruler */}
          <button
            onClick={onToggleFocusRuler}
            title={isFocusRulerActive ? t.focusRulerOff : t.focusRulerOn}
            className={`p-1.5 rounded-full transition-all ${
              isFocusRulerActive
                ? 'bg-amber-400 text-black shadow-md'
                : 'hover:bg-white/10 text-neutral-300'
            }`}
          >
            <Glasses className="w-3.5 h-3.5" />
          </button>

          {/* View Mode Toggle (Cycles Continuous -> Single -> Dual) */}
          <button
            onClick={cycleViewMode}
            title={
              viewMode === 'continuous'
                ? t.singleMode
                : viewMode === 'single'
                ? t.dualMode
                : t.continuousMode
            }
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 transition-colors"
          >
            {viewMode === 'continuous' ? (
              <Scroll className="w-3.5 h-3.5" />
            ) : viewMode === 'single' ? (
              <Columns className="w-3.5 h-3.5" />
            ) : (
              <BookOpen className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Night Dimmer Slider */}
          <div className="relative">
            <button
              onClick={() => {
                setShowDimmerMenu(!showDimmerMenu);
                setShowThemeMenu(false);
                setShowPaperMenu(false);
              }}
              title={t.dimmerLabel}
              className={`p-1.5 rounded-full transition-colors flex items-center ${
                dimmerOpacity > 0 ? 'bg-amber-400/20 text-amber-300' : 'hover:bg-white/10 text-neutral-300'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
            {showDimmerMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl bg-neutral-900/98 border border-white/10 p-3 shadow-2xl backdrop-blur-xl z-50 text-neutral-200 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between text-[11px] mb-2 font-sans font-medium text-neutral-300">
                  <span>{t.dimmerLabel}</span>
                  <span className="font-mono text-amber-400">{Math.round(dimmerOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.7}
                  step={0.05}
                  value={dimmerOpacity}
                  onChange={(e) => onDimmerChange?.(parseFloat(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Themes Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowThemeMenu(!showThemeMenu);
                setShowPaperMenu(false);
              }}
              title={t.themeLabel}
              className={`p-1.5 rounded-full transition-colors flex items-center ${
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
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs transition-colors ${
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

          {/* Paper Style Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowPaperMenu(!showPaperMenu);
                setShowThemeMenu(false);
              }}
              title={t.paperStyleLabel}
              className={`p-1.5 rounded-full transition-colors flex items-center ${
                showPaperMenu ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-neutral-300'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
            </button>

            {showPaperMenu && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-neutral-900/98 border border-white/10 p-1.5 shadow-2xl backdrop-blur-xl z-50 text-neutral-200 animate-in fade-in zoom-in-95 duration-150">
                <div className="text-[10px] uppercase font-mono px-2.5 py-1 text-neutral-500 font-semibold tracking-wider">
                  {t.paperStylesTitle}
                </div>
                {paperStylesList.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onPaperStyleChange(p.id);
                      setShowPaperMenu(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors ${
                      paperStyle === p.id ? 'bg-white/15 text-white font-medium' : 'hover:bg-white/5 text-neutral-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span
                        className="w-3.5 h-3.5 rounded-xs border border-black/25 shrink-0"
                        style={{ backgroundColor: p.iconBg }}
                      />
                      <span className="truncate">{p.label}</span>
                    </div>
                    {paperStyle === p.id && <span className="text-amber-400 text-xs ml-1 shrink-0">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fullscreen */}
          <button
            onClick={onToggleFullscreen}
            title={t.fullscreen}
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Shortcuts / Help */}
          <button
            onClick={onToggleShortcuts}
            title={t.shortcutsTooltip}
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>

          {/* Settings Trigger */}
          <button
            onClick={onToggleSettings}
            title={t.settingsTitle}
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* MOBILE MORE MENU BUTTON (Shown only on screens < md) */}
        <div className="md:hidden flex items-center gap-0.5 shrink-0">
          <div className="w-[1px] h-4 bg-white/10 mx-0.5" />
          <button
            onClick={() => {
              setShowMoreMobile(!showMoreMobile);
              setShowThemeMenu(false);
            }}
            title={t.moreTools}
            className={`p-1.5 sm:p-2 rounded-full transition-colors ${
              showMoreMobile ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-neutral-300'
            }`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* MOBILE POPUP TOOLBAR DRAWER */}
      {showMoreMobile && (
        <div className="pointer-events-auto md:hidden mt-2 p-3 rounded-2xl bg-neutral-900/98 border border-white/10 shadow-2xl backdrop-blur-2xl z-40 text-neutral-200 flex flex-col gap-3 w-72 max-w-[90vw] animate-in fade-in zoom-in-95 duration-150">
          
          {/* Mobile Zoom Row */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-neutral-400 font-medium">{t.zoomLevel}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onZoomChange(Math.max(0.4, Number((zoom - 0.15).toFixed(2))))}
                className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="font-mono text-xs text-neutral-200 w-10 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => onZoomChange(Math.min(2.5, Number((zoom + 0.15).toFixed(2))))}
                className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Action Toggles */}
          <div className="grid grid-cols-4 gap-1.5">
            <button
              onClick={onToggleBookmark}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-[10px] transition-all ${
                isBookmarked
                  ? 'bg-amber-400/20 text-amber-300 border-amber-400/40'
                  : 'bg-white/5 text-neutral-300 border-white/5 hover:bg-white/10'
              }`}
            >
              <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-amber-400 text-amber-400' : ''}`} />
              <span>إشارة</span>
            </button>

            <button
              onClick={cycleViewMode}
              className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-neutral-300 text-[10px] transition-all"
            >
              {viewMode === 'continuous' ? (
                <Scroll className="w-4 h-4" />
              ) : viewMode === 'single' ? (
                <Columns className="w-4 h-4" />
              ) : (
                <BookOpen className="w-4 h-4" />
              )}
              <span>{viewMode === 'continuous' ? 'مستمر' : viewMode === 'single' ? 'مفردة' : 'مزدوج'}</span>
            </button>

            <button
              onClick={onToggleFullscreen}
              className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-neutral-300 text-[10px] transition-all"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span>{t.fullscreen.split(' ')[0]}</span>
            </button>

            <button
              onClick={() => {
                onToggleSettings();
                setShowMoreMobile(false);
              }}
              className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-amber-300 text-[10px] transition-all"
            >
              <Settings2 className="w-4 h-4" />
              <span>{t.settingsTitle.split(' ')[0]}</span>
            </button>
          </div>

          {/* Mobile Dimmer Slider */}
          <div className="flex items-center justify-between px-1.5 py-1 rounded-xl bg-white/5 border border-white/5">
            <span className="text-[11px] text-neutral-300 font-medium flex items-center gap-1.5">
              <Moon className="w-3.5 h-3.5 text-amber-400" />
              <span>{t.dimmerLabel}</span>
            </span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={0.7}
                step={0.05}
                value={dimmerOpacity}
                onChange={(e) => onDimmerChange?.(parseFloat(e.target.value))}
                className="w-24 accent-amber-400 cursor-pointer"
              />
              <span className="text-[10px] font-mono text-amber-400 w-7 text-left">
                {Math.round(dimmerOpacity * 100)}%
              </span>
            </div>
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
                    className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-white bg-white/20 text-white'
                        : 'border-white/5 bg-white/5 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/30"
                      style={{ backgroundColor: th.dot }}
                    />
                    <span className="text-[9px] truncate max-w-full font-sans">
                      {th.id}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Paper Styles Swatches (Mobile) */}
          <div className="pt-2 border-t border-white/10 space-y-1.5">
            <div className="text-[10px] text-neutral-400 font-mono flex items-center justify-between">
              <span>{t.paperStylesTitle}</span>
              <span className="text-amber-400 font-sans text-[10px]">
                {paperStylesList.find((p) => p.id === paperStyle)?.label.split(' ')[0]}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {paperStylesList.map((p) => {
                const isSelected = paperStyle === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      onPaperStyleChange(p.id);
                      setShowMoreMobile(false);
                    }}
                    className={`flex items-center gap-1.5 p-2 rounded-xl border text-[10px] transition-all truncate ${
                      isSelected
                        ? 'border-amber-400/50 bg-amber-400/20 text-amber-200'
                        : 'border-white/5 bg-white/5 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0 border border-black/20"
                      style={{ backgroundColor: p.iconBg }}
                    />
                    <span className="truncate">{p.label.split(' ')[0]}</span>
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
