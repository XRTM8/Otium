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
  HelpCircle
} from 'lucide-react';
import type { ThemeMode, ViewMode } from '../types';

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
  onToggleShortcuts,
  onCloseDocument
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [inputPage, setInputPage] = useState(currentPage.toString());

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
        // Only hide if menus are not open
        if (!showThemeMenu) {
          setIsVisible(false);
        }
      }, 4000);
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    handleActivity();

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      clearTimeout(timeout);
    };
  }, [showThemeMenu]);

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
    { id: 'pure', label: 'Pure (أبيض ناصع)', bg: '#ffffff', dot: '#94a3b8' }
  ];

  return (
    <div
      className={`fixed top-4 inset-x-0 z-30 flex justify-center px-4 transition-all duration-500 pointer-events-none ${
        isVisible ? 'translate-y-0 opacity-100' : '-translate-y-16 opacity-0'
      }`}
    >
      <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 rounded-full shadow-2xl backdrop-blur-2xl border transition-colors duration-300 text-xs sm:text-sm bg-neutral-900/80 text-neutral-100 border-white/10 dark:bg-black/80">
        {/* Left: Close & Sidebar */}
        <button
          onClick={onCloseDocument}
          title="إغلاق الملف"
          className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <button
          onClick={onToggleSidebar}
          title="الفهرس والصفحات"
          className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 transition-colors"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Divider */}
        <div className="w-[1px] h-4 bg-white/15 mx-0.5" />

        {/* Document Title */}
        <div
          title={title}
          className="max-w-[120px] sm:max-w-[180px] md:max-w-[240px] truncate font-medium text-neutral-200 select-none text-[13px] px-1"
        >
          {title}
        </div>

        {/* Divider */}
        <div className="w-[1px] h-4 bg-white/15 mx-0.5" />

        {/* Page Nav */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            title="الصفحة السابقة"
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <form onSubmit={handlePageSubmit} className="flex items-center gap-1 font-mono text-xs">
            <input
              type="text"
              value={inputPage}
              onChange={(e) => setInputPage(e.target.value)}
              onBlur={handlePageSubmit}
              className="w-10 text-center bg-white/10 rounded py-0.5 px-1 text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <span className="opacity-50">/ {totalPages}</span>
          </form>

          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            title="الصفحة التالية"
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Divider */}
        <div className="w-[1px] h-4 bg-white/15 mx-0.5" />

        {/* Zoom */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onZoomChange(Math.max(0.5, zoom - 0.15))}
            title="تصغير"
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="font-mono text-[11px] w-9 text-center text-neutral-300 select-none">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => onZoomChange(Math.min(2.5, zoom + 0.15))}
            title="تكبير"
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        {/* Divider */}
        <div className="w-[1px] h-4 bg-white/15 mx-0.5" />

        {/* Focus Mode Ruler */}
        <button
          onClick={onToggleFocusRuler}
          title={isFocusRulerActive ? 'إلغاء مسطرة التركيز (R)' : 'تفعيل مسطرة التركيز (R)'}
          className={`p-1.5 rounded-full transition-all ${
            isFocusRulerActive
              ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30'
              : 'hover:bg-white/10 text-neutral-300'
          }`}
        >
          <Glasses className="w-4 h-4" />
        </button>

        {/* Ambient Sound */}
        <button
          onClick={onToggleAmbient}
          title={isAmbientActive ? 'إيقاف صوت المطر الهادئ' : 'تشغيل صوت مطر خافت للقراءة'}
          className={`p-1.5 rounded-full transition-all ${
            isAmbientActive
              ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30'
              : 'hover:bg-white/10 text-neutral-300'
          }`}
        >
          {isAmbientActive ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>

        {/* View Mode Toggle */}
        <button
          onClick={() => onViewModeChange(viewMode === 'continuous' ? 'single' : 'continuous')}
          title={viewMode === 'continuous' ? 'التبديل إلى نمط الصفحة المنفردة' : 'التبديل إلى التمرير المستمر'}
          className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 transition-colors"
        >
          {viewMode === 'continuous' ? <Scroll className="w-4 h-4" /> : <Columns className="w-4 h-4" />}
        </button>

        {/* Themes Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowThemeMenu(!showThemeMenu)}
            title="تغيير الثيم والنمط اللوني (T)"
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 transition-colors flex items-center gap-1"
          >
            <Palette className="w-4 h-4" />
          </button>

          {showThemeMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl bg-neutral-900/95 border border-white/10 p-1.5 shadow-2xl backdrop-blur-xl z-50 text-neutral-200">
              <div className="text-[10px] uppercase font-mono px-2 py-1 text-neutral-400 font-semibold tracking-wider">
                أنماط القراءة
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
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        {/* Shortcuts / Help */}
        <button
          onClick={onToggleShortcuts}
          title="اختصارات لوحة المفاتيح"
          className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
