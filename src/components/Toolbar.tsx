import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns,
  Edit2,
  Layers,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Palette,
  ScanLine,
  Scroll,
  Search,
  Settings2,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import type { ThemeMode, ViewMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { getTranslations } from '../core/i18n/translations';
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
  onPageChange: (page: number) => void;
  onPrevPage?: () => void;
  onNextPage?: () => void;
  onZoomChange: (zoom: number) => void;
  onThemeChange: (theme: ThemeMode) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleBookmark?: () => void;
  onToggleFullscreen: () => void;
  onToggleSidebar: () => void;
  onToggleSearch: () => void;
  onToggleSettings: () => void;
  onOpenScanner?: () => void;
  onCloseDocument: () => void;
  onRenameTitle?: (newTitle: string) => void;
  annotationsCount?: number;
  bookmarksCount?: number;
  fileSizeBytes?: number;
  pageDimensions?: { width: number; height: number };
}

const THEME_DOTS: Record<ThemeMode, string> = {
  paper: '#d4c5a9',
  amoled: '#10b981',
  eink: '#9ca3af',
  midnight: '#38bdf8',
  amber: '#f59e0b',
  sakura: '#f472b6',
  forest: '#34d399',
  nordic: '#60a5fa',
  parchment: '#d97706',
  pure: '#f8fafc'
};

const VIEW_MODES: { id: ViewMode; icon: React.ReactNode; key: keyof ReturnType<typeof getTranslations> }[] = [
  { id: 'continuous', icon: <Scroll className="w-3.5 h-3.5" />, key: 'continuousMode' },
  { id: 'dual', icon: <BookOpen className="w-3.5 h-3.5" />, key: 'dualMode' },
  { id: 'single', icon: <Columns className="w-3.5 h-3.5" />, key: 'singleMode' }
];

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
  onPageChange,
  onPrevPage,
  onNextPage,
  onZoomChange,
  onThemeChange,
  onViewModeChange,
  onToggleBookmark,
  onToggleFullscreen,
  onToggleSidebar,
  onToggleSearch,
  onToggleSettings,
  onOpenScanner,
  onCloseDocument,
  onRenameTitle,
  annotationsCount,
  bookmarksCount,
  fileSizeBytes,
  pageDimensions
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameText, setRenameText] = useState(title);
  const [showMoreMobile, setShowMoreMobile] = useState(false);
  const [inputPage, setInputPage] = useState(currentPage.toString());

  const t = getTranslations(currentLang);
  const ar = currentLang === 'ar';

  useEffect(() => {
    setRenameText(title);
  }, [title]);

  useEffect(() => {
    setInputPage(currentPage.toString());
  }, [currentPage]);

  // Auto-hide the chrome after inactivity so the page owns the screen.
  useEffect(() => {
    let timeout: number | undefined;
    const handleActivity = () => {
      setIsVisible(true);
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        if (!showThemeMenu && !showMoreMobile && !showInspector) setIsVisible(false);
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
      window.clearTimeout(timeout);
    };
  }, [showThemeMenu, showMoreMobile]);

  const handlePageSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const pageNum = Number.parseInt(inputPage.replace(/[^\d]/g, ''), 10);
    if (!Number.isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      onPageChange(pageNum);
      (document.activeElement as HTMLElement)?.blur();
    } else {
      setInputPage(currentPage.toString());
      (document.activeElement as HTMLElement)?.blur();
    }
  };

  const themes = (Object.keys(THEME_DOTS) as ThemeMode[]).map((id) => ({
    id,
    label: t.themes[id],
    dot: THEME_DOTS[id]
  }));

  const isAr = currentLang === 'ar';
  const handleLeftStep = () => {
    if (isAr) {
      if (onNextPage) onNextPage();
      else onPageChange(Math.min(totalPages, currentPage + 1));
    } else {
      if (onPrevPage) onPrevPage();
      else onPageChange(Math.max(1, currentPage - 1));
    }
  };
  const handleRightStep = () => {
    if (isAr) {
      if (onPrevPage) onPrevPage();
      else onPageChange(Math.max(1, currentPage - 1));
    } else {
      if (onNextPage) onNextPage();
      else onPageChange(Math.min(totalPages, currentPage + 1));
    }
  };

  const pageControls = (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={handleLeftStep}
        disabled={isAr ? currentPage >= totalPages : currentPage <= 1}
        title={isAr ? t.nextPage : t.prevPage}
        aria-label={isAr ? t.nextPage : t.prevPage}
        className="toolbar-icon disabled:opacity-20"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <form
        onSubmit={handlePageSubmit}
        className="flex items-center gap-1 rounded-lg bg-hover-subtle px-1.5 py-1 font-mono text-[11px]"
      >
        <input
          type="text"
          inputMode="numeric"
          value={inputPage}
          onChange={(event) => setInputPage(event.target.value)}
          onBlur={handlePageSubmit}
          aria-label={t.pageOf(currentPage, totalPages)}
          className="w-7 bg-transparent text-center text-ink outline-none focus:text-accent"
        />
        <span className="select-none text-ink-faint">/ {totalPages}</span>
      </form>

      <button
        type="button"
        onClick={handleRightStep}
        disabled={isAr ? currentPage <= 1 : currentPage >= totalPages}
        title={isAr ? t.prevPage : t.nextPage}
        aria-label={isAr ? t.prevPage : t.nextPage}
        className="toolbar-icon disabled:opacity-20"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div
      dir="ltr"
      style={{ top: 'max(0.75rem, calc(env(safe-area-inset-top, 0px) + 0.6rem))' }}
      className={`fixed inset-x-0 z-40 flex flex-col items-center px-2 pointer-events-none transition-all duration-200 ease-out ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'
      }`}
    >
      <div className={`chrome-surface ${isVisible ? 'pointer-events-auto' : 'pointer-events-none'} flex max-w-[calc(100vw-1rem)] items-center gap-1 rounded-2xl px-1.5 py-1.5 sm:gap-1.5 sm:px-2 shadow-2xl`}>
        <button
          type="button"
          onClick={onCloseDocument}
          title={t.closeDoc}
          className="fluid-press flex shrink-0 items-center gap-1.5 rounded-xl border border-line-subtle bg-hover-subtle px-2 py-1.5 text-ink-muted hover:bg-hover hover:text-ink"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="text-[11px] font-semibold hidden lg:inline">
            {ar ? 'المكتبة' : 'Library'}
          </span>
        </button>

        <span className="flex shrink-0 items-center px-0.5 text-accent" title="Otium">
          <OtiumLogo size={22} />
        </span>

        <button
          type="button"
          onClick={onToggleSidebar}
          title={t.pagesTab}
          aria-label={t.pagesTab}
          className="toolbar-icon"
        >
          <Layers className="w-4 h-4" />
        </button>

        <div className="relative hidden sm:block">
          <button
            type="button"
            onClick={() => setShowInspector((prev) => !prev)}
            title={ar ? 'معلومات المستند والتقدم' : 'Document Info & Progress'}
            dir="auto"
            className={`max-w-[100px] md:max-w-[160px] xl:max-w-[220px] shrink-0 truncate rounded-lg px-2 py-1 text-xs font-medium transition-all cursor-pointer ${
              showInspector
                ? 'bg-hover text-ink font-semibold'
                : 'text-ink-muted hover:bg-hover-subtle hover:text-ink'
            }`}
          >
            <bdi>{title}</bdi>
          </button>

          {showInspector && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowInspector(false)}
              />
              <div
                dir={ar ? 'rtl' : 'ltr'}
                className="chrome-surface absolute start-0 top-full z-50 mt-2 w-64 rounded-2xl p-3.5 text-ink shadow-2xl fluid-pop select-none text-start"
              >
                <div className="flex items-start justify-between gap-2 border-b border-line pb-2.5">
                  <div className="min-w-0 flex-1">
                    <div className={`text-[10px] uppercase text-ink-faint ${ar ? 'font-sans' : 'font-mono tracking-wider'}`}>
                      {ar ? 'المستند الحالي' : 'Current Document'}
                    </div>
                    {isRenaming ? (
                      <div className="flex items-center gap-1 mt-1">
                        <input
                          type="text"
                          value={renameText}
                          onChange={(e) => setRenameText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (renameText.trim() && onRenameTitle) {
                                onRenameTitle(renameText.trim());
                              }
                              setIsRenaming(false);
                            } else if (e.key === 'Escape') {
                              setRenameText(title);
                              setIsRenaming(false);
                            }
                          }}
                          autoFocus
                          className="w-full text-xs font-medium text-ink bg-hover px-1.5 py-0.5 rounded outline-none border border-line-strong"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (renameText.trim() && onRenameTitle) {
                              onRenameTitle(renameText.trim());
                            }
                            setIsRenaming(false);
                          }}
                          className="toolbar-icon h-5 w-5 text-accent shrink-0"
                          title={ar ? 'حفظ الاسم' : 'Save name'}
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 mt-0.5 group">
                        <span className="truncate font-semibold text-xs text-ink" title={title}>
                          <bdi>{title}</bdi>
                        </span>
                        {onRenameTitle && (
                          <button
                            type="button"
                            onClick={() => setIsRenaming(true)}
                            className="opacity-50 hover:opacity-100 p-0.5 text-ink-muted hover:text-ink shrink-0"
                            title={ar ? 'إعادة تسمية العرض' : 'Rename title'}
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowInspector(false);
                      setIsRenaming(false);
                    }}
                    className="toolbar-icon h-6 w-6 shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="mt-2.5 space-y-2 text-[11px] font-mono">
                  <div className="flex items-center justify-between text-ink-muted">
                    <span className="font-sans font-medium">{ar ? 'تقدّم القراءة:' : 'Progress:'}</span>
                    <span className="text-accent font-semibold">
                      {Math.min(100, Math.round((currentPage / Math.max(1, totalPages)) * 100))}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-hover">
                    <div
                      className="h-full bg-accent transition-all duration-300 rounded-full"
                      style={{ width: `${Math.min(100, Math.round((currentPage / Math.max(1, totalPages)) * 100))}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-ink-muted pt-1">
                    <span className="font-sans">{ar ? 'الصفحات:' : 'Pages:'}</span>
                    <span>{currentPage} / {totalPages}</span>
                  </div>

                  {fileSizeBytes ? (
                    <div className="flex items-center justify-between text-ink-muted">
                      <span className="font-sans">{ar ? 'حجم الملف:' : 'File size:'}</span>
                      <span dir="ltr">
                        {fileSizeBytes < 1024 * 1024
                          ? `${Math.round(fileSizeBytes / 1024)} KB`
                          : `${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`}
                      </span>
                    </div>
                  ) : null}

                  {pageDimensions ? (
                    <div className="flex items-center justify-between text-ink-muted">
                      <span className="font-sans">{ar ? 'أبعاد الصفحة:' : 'Dimensions:'}</span>
                      <span dir="ltr">{Math.round(pageDimensions.width)} × {Math.round(pageDimensions.height)} pt</span>
                    </div>
                  ) : null}

                  {typeof annotationsCount === 'number' ? (
                    <div className="flex items-center justify-between text-ink-muted">
                      <span className="font-sans">{ar ? 'الملاحظات والتظليلات:' : 'Notes & Highlights:'}</span>
                      <span>{annotationsCount}</span>
                    </div>
                  ) : null}

                  {typeof bookmarksCount === 'number' ? (
                    <div className="flex items-center justify-between text-ink-muted">
                      <span className="font-sans">{ar ? 'الإشارات المرجعية:' : 'Bookmarks:'}</span>
                      <span>{bookmarksCount}</span>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between text-ink-muted">
                    <span className="font-sans">{ar ? 'نسبة العرض:' : 'Zoom:'}</span>
                    <span>{Math.round(zoom * 100)}%</span>
                  </div>

                  <div className="flex items-center justify-between text-ink-muted">
                    <span className="font-sans">{ar ? 'الثيم النشط:' : 'Theme:'}</span>
                    <span className="font-sans">{t.themes[theme]}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <span className="mx-0.5 h-4 w-px shrink-0 bg-line-subtle" />

        <button
          type="button"
          onClick={onToggleSearch}
          title={t.searchTooltip}
          aria-label={t.searchTooltip}
          className="toolbar-icon"
        >
          <Search className="w-4 h-4" />
        </button>

        {pageControls}

        <div className="hidden shrink-0 items-center gap-0.5 lg:flex">
          <span className="mx-0.5 h-4 w-px bg-line-subtle" />

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
              onClick={() => onZoomChange(Math.max(0.5, Number((zoom - 0.15).toFixed(2))))}
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
              onClick={() => onZoomChange(Math.min(3.5, Number((zoom + 0.15).toFixed(2))))}
              title={t.zoomIn}
              aria-label={t.zoomIn}
              className="toolbar-icon"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="segmented ms-0.5 hidden lg:inline-flex">
            {VIEW_MODES.map((mode) => (
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

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowThemeMenu((open) => !open)}
              title={t.themeLabel}
              aria-label={t.themeLabel}
              aria-expanded={showThemeMenu}
              className={`toolbar-icon ${showThemeMenu ? 'bg-hover text-ink' : ''}`}
            >
              <Palette className="w-3.5 h-3.5" />
            </button>

            {showThemeMenu && (
              <div className="chrome-surface absolute right-0 top-full z-50 mt-2 w-52 rounded-2xl p-1.5 text-ink fluid-pop shadow-2xl">
                <div className={`px-2.5 py-1 text-[10px] font-semibold uppercase text-ink-faint ${ar ? 'font-sans' : 'font-mono tracking-wider'}`}>
                  {t.readingThemesTitle}
                </div>
                {themes.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      onThemeChange(entry.id);
                      setShowThemeMenu(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs transition-colors ${
                      theme === entry.id
                        ? 'bg-hover text-ink font-medium'
                        : 'text-ink-muted hover:bg-hover-subtle'
                    }`}
                  >
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-black/20"
                      style={{ backgroundColor: entry.dot }}
                    />
                    <span className="truncate">{entry.label}</span>
                  </button>
                ))}
              </div>
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

          <button
            type="button"
            onClick={onOpenScanner}
            title={ar ? 'المسح الضوئي بالكاميرا (Ctrl+Shift+S)' : 'Scan Document (Ctrl+Shift+S)'}
            aria-label={ar ? 'المسح الضوئي بالكاميرا' : 'Scan Document'}
            className="toolbar-icon text-accent hover:text-accent"
          >
            <ScanLine className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onToggleSettings}
            title={t.settingsTitle}
            aria-label={t.settingsTitle}
            className="toolbar-icon"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowMoreMobile((open) => !open);
            setShowThemeMenu(false);
          }}
          title={t.moreTools}
          aria-label={t.moreTools}
          aria-expanded={showMoreMobile}
          className={`toolbar-icon ${showMoreMobile ? 'bg-hover text-ink' : ''}`}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {showMoreMobile && (
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setShowMoreMobile(false)}
          />
          <div className="chrome-surface pointer-events-auto absolute end-3 top-full mt-2 flex w-[min(23rem,calc(100vw-1rem))] flex-col gap-3 rounded-2xl p-3.5 text-ink z-50 shadow-2xl fluid-pop">
            <div className="flex items-center justify-between gap-2 rounded-xl bg-hover-subtle px-2.5 py-2">
              <span className="text-[11px] font-medium text-ink-muted">{t.zoomLevel}</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onZoomChange(Math.max(0.5, Number((zoom - 0.15).toFixed(2))))}
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
                  onClick={() => onZoomChange(Math.min(3.5, Number((zoom + 0.15).toFixed(2))))}
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
                {VIEW_MODES.find((mode) => mode.id === viewMode)?.icon}
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
                  setShowMoreMobile(false);
                }}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-line-subtle bg-hover-subtle px-1 py-2 text-[10px] text-accent transition-colors"
              >
                <Settings2 className="w-4 h-4" />
                <span>{t.settingsTitle.split(' ')[0]}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onOpenScanner?.();
                  setShowMoreMobile(false);
                }}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-line-subtle bg-hover-subtle px-1 py-2 text-[10px] text-accent transition-colors"
              >
                <ScanLine className="w-4 h-4" />
                <span>{ar ? 'سكانر' : 'Scan'}</span>
              </button>
            </div>

            <div className="space-y-1.5 border-t border-line-subtle pt-2">
              <div className="font-mono text-[10px] text-ink-muted">{t.readingThemesTitle}</div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {themes.slice(0, 6).map((entry) => {
                  const selected = theme === entry.id;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => {
                        onThemeChange(entry.id);
                        setShowMoreMobile(false);
                      }}
                      className={`flex items-center gap-1.5 rounded-xl border px-1.5 py-1.5 text-[10px] transition-colors ${
                        selected
                          ? 'border-accent bg-accent/10 text-ink font-medium'
                          : 'border-line-subtle bg-hover-subtle text-ink-muted'
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
      )}
    </div>
  );
};
