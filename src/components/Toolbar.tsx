import { normalizeDigits } from '../core/search/arabic';
import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Columns,
  Layers,
  MoreHorizontal,
  Scroll,
  Search,
} from 'lucide-react';
import type { ThemeMode, ViewMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { getTranslations } from '../core/i18n/translations';
import { OtiumLogo } from './OtiumLogo';
import { ToolbarMobileMoreSheet } from './ToolbarMobileMoreSheet';
import { ToolbarDocumentInspector, ToolbarThemeAndActions } from './ToolbarInspectorAndActions';
import { ToolbarPageNavigation, ToolbarZoomAndViewControls } from './ToolbarPageAndViewControls';
import { getThemeOptions } from './themeCatalog';

interface ToolbarProps {
  title: string;
  currentPage: number;
  totalPages: number;
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  theme: ThemeMode;
  viewMode: ViewMode;
  currentLang: Language;
  readingDirection?: 'rtl' | 'ltr';
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
  onToggleBoard?: () => void;
  isBoardOpen?: boolean;
  onOpenBeam?: () => void;
  isBeaming?: boolean;
  beamRoom?: string | null;
  beamRole?: 'receiver' | 'sender' | null;
  onDisconnectBeam?: () => void;
  onCloseDocument: () => void;
  onRenameTitle?: (newTitle: string) => void;
  annotationsCount?: number;
  bookmarksCount?: number;
  fileSizeBytes?: number;
  pageDimensions?: { width: number; height: number };
}

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
  minZoom,
  maxZoom,
  theme,
  viewMode,
  currentLang,
  readingDirection = 'ltr',
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
  onToggleBoard,
  isBoardOpen = false,
  onOpenBeam,
  isBeaming = false,
  beamRoom,
  beamRole,
  onDisconnectBeam,
  onCloseDocument,
  onRenameTitle,
  annotationsCount,
  bookmarksCount,
  fileSizeBytes,
  pageDimensions
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const isVisibleRef = useRef(true);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState<{ base: string; value: string } | null>(null);
  const [showMoreMobile, setShowMoreMobile] = useState(false);
  const [pageDraft, setPageDraft] = useState<{ page: number; value: string } | null>(null);

  const renameText = renameDraft?.base === title ? renameDraft.value : title;
  const setRenameText = (value: string) => setRenameDraft({ base: title, value });
  const inputPage = pageDraft?.page === currentPage ? pageDraft.value : currentPage.toString();
  const setInputPage = (value: string) => setPageDraft({ page: currentPage, value });

  const t = getTranslations(currentLang);
  const ar = currentLang === 'ar';

  const effectiveMinZoom = minZoom ?? 0.04;
  const effectiveMaxZoom = maxZoom ?? 3.5;
  const zoomStep = zoom < 0.4 ? Math.max(0.02, Number((zoom * 0.25).toFixed(2))) : 0.15;

  // Auto-hide the chrome after inactivity so the page owns the screen.
  // Close floating popups on Escape key
  useEffect(() => {
    if (!showThemeMenu && !showMoreMobile && !showInspector) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        setShowThemeMenu(false);
        setShowMoreMobile(false);
        setShowInspector(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showThemeMenu, showMoreMobile, showInspector]);

  useEffect(() => {
    let timeout: number | undefined;
    let lastSchedule = 0;
    const hideMenuFree = !showThemeMenu && !showMoreMobile && !showInspector;
    const scheduleHide = () => {
      window.clearTimeout(timeout);
      if (!hideMenuFree) return;
      timeout = window.setTimeout(() => {
        isVisibleRef.current = false;
        setIsVisible(false);
      }, 5000);
    };
    const handleActivity = () => {
      if (!isVisibleRef.current) {
        isVisibleRef.current = true;
        setIsVisible(true);
      }
      const now = Date.now();
      if (now - lastSchedule >= 200) {
        lastSchedule = now;
        scheduleHide();
      }
    };

    window.addEventListener('mousemove', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity, { passive: true });
    window.addEventListener('scroll', handleActivity, { passive: true });
    scheduleHide();

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      window.clearTimeout(timeout);
    };
  }, [showThemeMenu, showMoreMobile, showInspector]);

  const handlePageSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const pageNum = Number.parseInt(normalizeDigits(inputPage).replace(/[^\d]/g, ''), 10);
    if (!Number.isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      onPageChange(pageNum);
      (document.activeElement as HTMLElement)?.blur();
    } else {
      setInputPage(currentPage.toString());
      (document.activeElement as HTMLElement)?.blur();
    }
  };

  const themes = getThemeOptions(t);

  const isAr = readingDirection === 'rtl';
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

        <ToolbarDocumentInspector
          title={title}
          currentPage={currentPage}
          totalPages={totalPages}
          zoom={zoom}
          theme={theme}
          ar={ar}
          t={t}
          showInspector={showInspector}
          isRenaming={isRenaming}
          renameText={renameText}
          fileSizeBytes={fileSizeBytes}
          pageDimensions={pageDimensions}
          annotationsCount={annotationsCount}
          bookmarksCount={bookmarksCount}
          onToggleInspector={() => setShowInspector((prev) => !prev)}
          onCloseInspector={() => {
            setShowInspector(false);
            setIsRenaming(false);
          }}
          onStartRenaming={() => setIsRenaming(true)}
          onStopRenaming={() => setIsRenaming(false)}
          onRenameTextChange={setRenameText}
          onRenameTitle={onRenameTitle}
        />

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

        <ToolbarPageNavigation
          t={t}
          isAr={isAr}
          currentPage={currentPage}
          totalPages={totalPages}
          inputPage={inputPage}
          onInputPageChange={setInputPage}
          onPageSubmit={handlePageSubmit}
          onLeftStep={handleLeftStep}
          onRightStep={handleRightStep}
        />

        <div className="hidden shrink-0 items-center gap-0.5 lg:flex">
          <span className="mx-0.5 h-4 w-px bg-line-subtle" />

          <ToolbarZoomAndViewControls
            t={t}
            zoom={zoom}
            effectiveMinZoom={effectiveMinZoom}
            effectiveMaxZoom={effectiveMaxZoom}
            zoomStep={zoomStep}
            isBookmarked={isBookmarked}
            viewMode={viewMode}
            viewModes={VIEW_MODES}
            onToggleBookmark={onToggleBookmark}
            onZoomChange={onZoomChange}
            onViewModeChange={onViewModeChange}
          />

          <ToolbarThemeAndActions
            t={t}
            ar={ar}
            theme={theme}
            themes={themes}
            showThemeMenu={showThemeMenu}
            isFullscreen={isFullscreen}
            isBoardOpen={isBoardOpen}
            isBeaming={isBeaming}
            beamRoom={beamRoom}
            beamRole={beamRole}
            onToggleThemeMenu={() => {
              setShowThemeMenu((open) => !open);
              setShowMoreMobile(false);
            }}
            onCloseThemeMenu={() => setShowThemeMenu(false)}
            onThemeChange={onThemeChange}
            onToggleFullscreen={onToggleFullscreen}
            onToggleBoard={onToggleBoard}
            onOpenBeam={onOpenBeam}
            onDisconnectBeam={onDisconnectBeam}
            onOpenScanner={onOpenScanner}
            onToggleSettings={onToggleSettings}
          />
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
        <ToolbarMobileMoreSheet
          t={t}
          ar={ar}
          zoom={zoom}
          effectiveMinZoom={effectiveMinZoom}
          effectiveMaxZoom={effectiveMaxZoom}
          zoomStep={zoomStep}
          isBookmarked={isBookmarked}
          viewMode={viewMode}
          viewModeIcon={VIEW_MODES.find((mode) => mode.id === viewMode)?.icon}
          isFullscreen={isFullscreen}
          isBoardOpen={isBoardOpen}
          isBeaming={isBeaming}
          themes={themes}
          theme={theme}
          onZoomChange={onZoomChange}
          onToggleBookmark={onToggleBookmark}
          onViewModeChange={onViewModeChange}
          onToggleFullscreen={onToggleFullscreen}
          onToggleSettings={onToggleSettings}
          onToggleBoard={onToggleBoard}
          onOpenBeam={onOpenBeam}
          onOpenScanner={onOpenScanner}
          onThemeChange={onThemeChange}
          onClose={() => setShowMoreMobile(false)}
        />
      )}
    </div>
  );
};
