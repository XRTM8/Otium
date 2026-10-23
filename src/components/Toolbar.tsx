import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Palette,
  Volume2,
  VolumeX,
  Menu,
  X,
  Glasses,
  Columns,
  Scroll,
  HelpCircle,
  Search,
  MoreHorizontal
} from 'lucide-react';
import type { ThemeMode, ViewMode } from '../types';
import { OtiumLogo } from './OtiumLogo';

interface ToolbarProps {
  title: string;
  currentPage: number;
  totalPages: number;
  zoom: number;
  theme: ThemeMode;
  viewMode: ViewMode;
  isFocusRulerActive: boolean;
  isAmbientActive: boolean;
  isFullscreen: boolean;
  onPageChange: (page: number) => void;
  onZoomChange: (zoom: number) => void;
  onThemeChange: (theme: ThemeMode) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleFocusRuler: () => void;
  onToggleAmbient: () => void;
  onToggleFullscreen: () => void;
  onToggleSidebar: () => void;
  onToggleSearch: () => void;
  onToggleShortcuts: () => void;
  onCloseDocument: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  title,
  currentPage,
  totalPages,
  zoom,
  theme,
  viewMode,
  isFocusRulerActive,
  isAmbientActive,
  isFullscreen,
  onPageChange,
  onZoomChange,
  onThemeChange,
  onViewModeChange,
  onToggleFocusRuler,
  onToggleAmbient,
  onToggleFullscreen,
  onToggleSidebar,
  onToggleSearch,
  onToggleShortcuts,
  onCloseDocument
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showMoreMobile, setShowMoreMobile] = useState(false);
  const [inputPage, setInputPage] = useState(currentPage.toString());

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

  const themes: { id: ThemeMode; label: string; bg: string; dot: string }[] = [
    { id: 'paper', label: 'Paper (ورقي دافئ)', bg: '#f7f3e8', dot: '#d4c5a9' },
    { id: 'midnight', label: 'Midnight (ليلي عميق)', bg: '#0b0f17', dot: '#38bdf8' },
    { id: 'eink', label: 'E-Ink (حبر إلكتروني)', bg: '#e5e5e5', dot: '#525252' },
    { id: 'amber', label: 'Amber (كهرماني هادئ)', bg: '#1a1612', dot: '#f59e0b' },
    { id: 'pure', label: 'Pure (أبيض استوديو)', bg: '#ffffff', dot: '#94a3b8' }
  ];

  return (
    <div
      className={`fixed top-3 sm:top-4 inset-x-0 z-30 flex flex-col items-center px-3 sm:px-4 transition-all duration-300 pointer-events-none ${
        isVisible ? 'translate-y-0 opacity-100' : '-translate-y-20 opacity-0'
      }`}
    >
      {/* Primary Floating Capsule */}
      <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full shadow-2xl backdrop-blur-2xl border transition-all duration-300 text-xs sm:text-sm bg-neutral-900/90 text-neutral-100 border-white/10 hover:border-amber-400/25 shadow-black/60 max-w-full">
        
        {/* Brand Monogram */}
        <div className="flex items-center gap-1.5 pl-1 pr-1.5 shrink-0">
          <OtiumLogo size={18} />
          <span className="font-bold text-xs tracking-wider text-amber-200/90 hidden lg:inline">
            OTIUM
          </span>
        </div>

        {/* Divider */}
        <div className="w-[1px] h-4 bg-white/10 mx-0.5 shrink-0" />

        {/* Close & Sidebar */}
        <button
          onClick={onCloseDocument}
          title="إغلاق الوثيقة (Esc)"
          className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>

        <button
          onClick={onToggleSidebar}
          title="الفهرس ومصغرات الصفحات (S)"
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
          title="بحث في الوثيقة (Ctrl + F)"
          className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 text-neutral-300 transition-colors shrink-0"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Page Nav */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            title="الصفحة السابقة (K / ↑)"
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
          </form>

          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            title="الصفحة التالية (J / ↓)"
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 disabled:opacity-20 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* DESKTOP ONLY CONTROLS (Hidden on mobile < md) */}
        <div className="hidden md:flex items-center gap-1 sm:gap-1.5 shrink-0">
          <div className="w-[1px] h-4 bg-white/10 mx-0.5" />

          {/* Zoom */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => onZoomChange(Math.max(0.4, Number((zoom - 0.15).toFixed(2))))}
              title="تصغير (-)"
              className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-[11px] w-9 text-center text-neutral-300 select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => onZoomChange(Math.min(2.5, Number((zoom + 0.15).toFixed(2))))}
              title="تكبير (+)"
              className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 transition-colors"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="w-[1px] h-4 bg-white/10 mx-0.5" />

          {/* Focus Mode Ruler */}
          <button
            onClick={onToggleFocusRuler}
            title={isFocusRulerActive ? 'إلغاء مسطرة التركيز (R)' : 'تفعيل مسطرة التركيز (R)'}
            className={`p-1.5 rounded-full transition-all ${
              isFocusRulerActive
                ? 'bg-amber-400 text-black shadow-md'
                : 'hover:bg-white/10 text-neutral-300'
            }`}
          >
            <Glasses className="w-3.5 h-3.5" />
          </button>

          {/* Ambient Sound */}
          <button
            onClick={onToggleAmbient}
            title={isAmbientActive ? 'إيقاف صوت المطر الهادئ' : 'تشغيل صوت مطر خافت'}
            className={`p-1.5 rounded-full transition-all ${
              isAmbientActive
                ? 'bg-neutral-100 text-neutral-900 shadow-md'
                : 'hover:bg-white/10 text-neutral-300'
            }`}
          >
            {isAmbientActive ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>

          {/* View Mode Toggle */}
          <button
            onClick={() => onViewModeChange(viewMode === 'continuous' ? 'single' : 'continuous')}
            title={viewMode === 'continuous' ? 'التبديل لنمط الصفحة الواحدة' : 'التبديل للتمرير المستمر'}
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 transition-colors"
          >
            {viewMode === 'continuous' ? <Scroll className="w-3.5 h-3.5" /> : <Columns className="w-3.5 h-3.5" />}
          </button>

          {/* Themes Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              title="بيئات القراءة (T)"
              className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 transition-colors flex items-center"
            >
              <Palette className="w-3.5 h-3.5" />
            </button>

            {showThemeMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl bg-neutral-900/98 border border-white/10 p-1.5 shadow-2xl backdrop-blur-xl z-50 text-neutral-200 animate-in fade-in zoom-in-95 duration-150">
                <div className="text-[10px] uppercase font-mono px-2.5 py-1 text-neutral-500 font-semibold tracking-wider">
                  بيئات القراءة
                </div>
                {themes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      onThemeChange(t.id);
                      setShowThemeMenu(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs transition-colors ${
                      theme === t.id ? 'bg-white/15 text-white font-medium' : 'hover:bg-white/5 text-neutral-300'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/20"
                      style={{ backgroundColor: t.dot }}
                    />
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fullscreen */}
          <button
            onClick={onToggleFullscreen}
            title="ملء الشاشة (F)"
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Shortcuts / Help */}
          <button
            onClick={onToggleShortcuts}
            title="اختصارات لوحة المفاتيح (?)"
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
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
            title="المزيد من الأدوات"
            className={`p-1.5 sm:p-2 rounded-full transition-colors ${
              showMoreMobile ? 'bg-amber-400 text-black' : 'hover:bg-white/10 text-neutral-300'
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
            <span className="text-xs text-neutral-400 font-medium">نسبة التكبير</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onZoomChange(Math.max(0.4, Number((zoom - 0.15).toFixed(2))))}
                className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="font-mono text-xs text-amber-300 w-10 text-center">
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
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={onToggleAmbient}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-[11px] transition-all ${
                isAmbientActive
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-white/5 text-neutral-300 border-white/5 hover:bg-white/10'
              }`}
            >
              <Volume2 className="w-4 h-4" />
              <span>صوت مطر</span>
            </button>

            <button
              onClick={() => onViewModeChange(viewMode === 'continuous' ? 'single' : 'continuous')}
              className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-neutral-300 text-[11px] transition-all"
            >
              {viewMode === 'continuous' ? <Scroll className="w-4 h-4" /> : <Columns className="w-4 h-4" />}
              <span>{viewMode === 'continuous' ? 'تمرير مستمر' : 'صفحة مفردة'}</span>
            </button>

            <button
              onClick={onToggleFullscreen}
              className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-neutral-300 text-[11px] transition-all"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span>ملء الشاشة</span>
            </button>
          </div>

          {/* Themes Swatches */}
          <div className="pt-2 border-t border-white/10 space-y-1.5">
            <div className="text-[10px] text-neutral-400 font-mono">بيئة القراءة (Themes)</div>
            <div className="grid grid-cols-5 gap-1.5">
              {themes.map((t) => {
                const isSelected = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      onThemeChange(t.id);
                      setShowMoreMobile(false);
                    }}
                    className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/20 text-white'
                        : 'border-white/5 bg-white/5 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/30"
                      style={{ backgroundColor: t.dot }}
                    />
                    <span className="text-[9px] truncate max-w-full font-sans">
                      {t.id}
                    </span>
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
