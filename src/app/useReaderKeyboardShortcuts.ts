import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { ThemeMode, ViewMode } from '../core/types';
import { isEditableTarget, THEME_ORDER } from './readerControllerHelpers';

interface UseReaderKeyboardShortcutsOptions {
  enabled: boolean;
  numPages: number;
  currentPage: number;
  viewMode: ViewMode;
  theme: ThemeMode;
  docIsRtl: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  lastFitScaleRef: React.MutableRefObject<number>;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  getMinZoom: () => number;
  getMaxZoom: () => number;
  getFitScale: () => number;
  scrollToPage: (pageNumber: number) => void;
  goToNextPage: () => void;
  goToPrevPage: () => void;
  changeTheme: (nextTheme: ThemeMode) => void;
  changeViewMode: (mode: ViewMode) => void;
  toggleBookmark: (pageNumber: number) => void;
  handleToggleFullscreen: () => void;
  setIsSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Desktop keyboard navigation, numeric page-jump buffer, zoom bindings, and
 * single-key reader toggles.
 */
export function useReaderKeyboardShortcuts({
  enabled,
  numPages,
  currentPage,
  viewMode,
  theme,
  docIsRtl,
  scrollContainerRef,
  lastFitScaleRef,
  setZoom,
  getMinZoom,
  getMaxZoom,
  getFitScale,
  scrollToPage,
  goToNextPage,
  goToPrevPage,
  changeTheme,
  changeViewMode,
  toggleBookmark,
  handleToggleFullscreen,
  setIsSearchOpen,
  setIsSidebarOpen,
}: UseReaderKeyboardShortcutsOptions): string | null {
  const numberJumpBufferRef = useRef<string>('');
  const numberJumpTimerRef = useRef<number | null>(null);
  const [numberJumpDisplay, setNumberJumpDisplay] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (numberJumpTimerRef.current !== null) {
        window.clearTimeout(numberJumpTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        if (/^[0-9]$/.test(event.key)) {
          if (event.key === '0' && !numberJumpBufferRef.current) {
            event.preventDefault();
            setZoom(1.15);
            return;
          }
          event.preventDefault();
          numberJumpBufferRef.current = `${numberJumpBufferRef.current}${event.key}`;
          setNumberJumpDisplay(numberJumpBufferRef.current);
          if (numberJumpTimerRef.current !== null) {
            window.clearTimeout(numberJumpTimerRef.current);
          }
          numberJumpTimerRef.current = window.setTimeout(() => {
            numberJumpBufferRef.current = '';
            setNumberJumpDisplay(null);
          }, 2400);
          return;
        }

        if ((event.key === 'Enter' || event.key.toLowerCase() === 'g') && numberJumpBufferRef.current) {
          event.preventDefault();
          const target = Number.parseInt(numberJumpBufferRef.current, 10);
          numberJumpBufferRef.current = '';
          setNumberJumpDisplay(null);
          if (numberJumpTimerRef.current !== null) {
            window.clearTimeout(numberJumpTimerRef.current);
            numberJumpTimerRef.current = null;
          }
          if (Number.isFinite(target) && target >= 1 && target <= numPages) {
            scrollToPage(target);
          }
          return;
        }

        if (event.key === 'Escape' && numberJumpBufferRef.current) {
          event.preventDefault();
          numberJumpBufferRef.current = '';
          setNumberJumpDisplay(null);
          if (numberJumpTimerRef.current !== null) {
            window.clearTimeout(numberJumpTimerRef.current);
            numberJumpTimerRef.current = null;
          }
          return;
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setIsSearchOpen((open) => !open);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        const maxZ = getMaxZoom();
        const step = Math.max(0.02, Math.min(0.15, Number(((lastFitScaleRef.current || 1.0) * 0.15).toFixed(2))));
        setZoom((current) => Math.min(maxZ, Number((current + step).toFixed(2))));
        return;
      }

      if ((event.ctrlKey || event.metaKey) && (event.key === '-' || event.key === '_')) {
        event.preventDefault();
        const minZ = getMinZoom();
        const step = Math.max(0.02, Math.min(0.15, Number(((lastFitScaleRef.current || 1.0) * 0.15).toFixed(2))));
        setZoom((current) => Math.max(minZ, Number((current - step).toFixed(2))));
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === '0') {
        event.preventDefault();
        setZoom(getFitScale());
        return;
      }

      switch (event.key.toLowerCase()) {
        case 'j':
        case 'arrowdown':
          event.preventDefault();
          if (viewMode === 'continuous') {
            scrollContainerRef.current?.scrollBy({ top: 220, behavior: 'smooth' });
          } else {
            goToNextPage();
          }
          break;
        case 'pagedown':
          event.preventDefault();
          if (viewMode === 'continuous') {
            const viewportH = scrollContainerRef.current?.clientHeight ?? 600;
            scrollContainerRef.current?.scrollBy({ top: Math.round(viewportH * 0.8), behavior: 'smooth' });
          } else {
            goToNextPage();
          }
          break;
        case ' ':
          event.preventDefault();
          if (event.shiftKey) {
            if (viewMode === 'continuous') {
              const viewportH = scrollContainerRef.current?.clientHeight ?? 600;
              scrollContainerRef.current?.scrollBy({ top: -Math.round(viewportH * 0.8), behavior: 'smooth' });
            } else {
              goToPrevPage();
            }
          } else {
            if (viewMode === 'continuous') {
              const viewportH = scrollContainerRef.current?.clientHeight ?? 600;
              scrollContainerRef.current?.scrollBy({ top: Math.round(viewportH * 0.8), behavior: 'smooth' });
            } else {
              goToNextPage();
            }
          }
          break;
        case 'arrowright':
          event.preventDefault();
          if (viewMode === 'continuous') {
            scrollContainerRef.current?.scrollBy({ top: docIsRtl ? -220 : 220, behavior: 'smooth' });
          } else if (docIsRtl) {
            goToPrevPage();
          } else {
            goToNextPage();
          }
          break;
        case 'arrowleft':
          event.preventDefault();
          if (viewMode === 'continuous') {
            scrollContainerRef.current?.scrollBy({ top: docIsRtl ? 220 : -220, behavior: 'smooth' });
          } else if (docIsRtl) {
            goToNextPage();
          } else {
            goToPrevPage();
          }
          break;
        case 'k':
        case 'arrowup':
          event.preventDefault();
          if (viewMode === 'continuous') {
            scrollContainerRef.current?.scrollBy({ top: -220, behavior: 'smooth' });
          } else {
            goToPrevPage();
          }
          break;
        case 'pageup':
          event.preventDefault();
          if (viewMode === 'continuous') {
            const viewportH = scrollContainerRef.current?.clientHeight ?? 600;
            scrollContainerRef.current?.scrollBy({ top: -Math.round(viewportH * 0.8), behavior: 'smooth' });
          } else {
            goToPrevPage();
          }
          break;
        case '+':
        case '=': {
          event.preventDefault();
          const maxZ = getMaxZoom();
          const step = Math.max(0.02, Math.min(0.15, Number(((lastFitScaleRef.current || 1.0) * 0.15).toFixed(2))));
          setZoom((current) => Math.min(maxZ, Number((current + step).toFixed(2))));
          break;
        }
        case '-':
        case '_': {
          event.preventDefault();
          const minZ = getMinZoom();
          const step = Math.max(0.02, Math.min(0.15, Number(((lastFitScaleRef.current || 1.0) * 0.15).toFixed(2))));
          setZoom((current) => Math.max(minZ, Number((current - step).toFixed(2))));
          break;
        }
        case '0':
          event.preventDefault();
          setZoom(getFitScale());
          break;
        case 't': {
          event.preventDefault();
          const nextIndex = (THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length;
          const nextTheme = THEME_ORDER[nextIndex];
          if (nextTheme) changeTheme(nextTheme);
          break;
        }
        case 'm':
          event.preventDefault();
          changeViewMode(
            viewMode === 'continuous' ? 'dual' : viewMode === 'dual' ? 'single' : 'continuous'
          );
          break;
        case 'b':
          event.preventDefault();
          toggleBookmark(currentPage);
          break;
        case 'f':
          event.preventDefault();
          handleToggleFullscreen();
          break;
        case 's':
          event.preventDefault();
          setIsSidebarOpen((open) => !open);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    enabled,
    changeTheme,
    changeViewMode,
    currentPage,
    docIsRtl,
    getFitScale,
    getMaxZoom,
    getMinZoom,
    goToNextPage,
    goToPrevPage,
    handleToggleFullscreen,
    lastFitScaleRef,
    numPages,
    scrollContainerRef,
    scrollToPage,
    setIsSearchOpen,
    setIsSidebarOpen,
    setZoom,
    theme,
    toggleBookmark,
    viewMode,
  ]);

  return numberJumpDisplay;
}
