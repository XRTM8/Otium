import { useCallback, useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { executeBackStep } from '../core/navigation/backHandler';
import { observeDocumentFullscreen, toggleDocumentFullscreen } from './readerControllerHelpers';

interface UseReaderBackNavigationParams {
  doc: PDFDocumentProxy | null;
  passwordModalOpen: boolean;
  isImmersive: boolean;
  isSettingsOpen: boolean;
  isSearchOpen: boolean;
  isSidebarOpen: boolean;
  handlePasswordCancel: () => void;
  setIsImmersive: (value: boolean) => void;
  setIsSettingsOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  setIsSearchOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  setIsSidebarOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  setSearchQuery: (query: string) => void;
  setActiveSearchPage: (page: number | null) => void;
  closeDocument: () => void;
}

/** Coordinates hardware back, Escape key, popstate history trapping, and layered UI dismissal. */
export function useReaderBackNavigation({
  doc,
  passwordModalOpen,
  isImmersive,
  isSettingsOpen,
  isSearchOpen,
  isSidebarOpen,
  handlePasswordCancel,
  setIsImmersive,
  setIsSettingsOpen,
  setIsSearchOpen,
  setIsSidebarOpen,
  setSearchQuery,
  setActiveSearchPage,
  closeDocument,
}: UseReaderBackNavigationParams) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => observeDocumentFullscreen(setIsFullscreen), []);

  const handleToggleFullscreen = useCallback(() => {
    toggleDocumentFullscreen();
  }, []);

  const handleBackStep = useCallback((): boolean => {
    if (executeBackStep()) return true;

    if (typeof window !== 'undefined') {
      const backEvent = new CustomEvent('otium:back', { cancelable: true });
      window.dispatchEvent(backEvent);
      if (backEvent.defaultPrevented) return true;
    }

    const selection = typeof window !== 'undefined' ? window.getSelection() : null;
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
      selection.removeAllRanges();
      return true;
    }
    if (passwordModalOpen) {
      handlePasswordCancel();
      return true;
    }
    if (isImmersive) {
      setIsImmersive(false);
      return true;
    }
    if (isSettingsOpen) {
      setIsSettingsOpen(false);
      return true;
    }
    if (isSearchOpen) {
      setIsSearchOpen(false);
      setSearchQuery('');
      setActiveSearchPage(null);
      return true;
    }
    if (isSidebarOpen) {
      setIsSidebarOpen(false);
      return true;
    }
    if (doc) {
      closeDocument();
      return true;
    }
    return false;
  }, [
    closeDocument,
    doc,
    handlePasswordCancel,
    isImmersive,
    isSearchOpen,
    isSettingsOpen,
    isSidebarOpen,
    passwordModalOpen,
    setActiveSearchPage,
    setIsImmersive,
    setIsSearchOpen,
    setIsSettingsOpen,
    setIsSidebarOpen,
    setSearchQuery,
  ]);

  useEffect(() => {
    window.__OTIUM_HANDLE_BACK__ = handleBackStep;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (handleBackStep()) event.preventDefault();
    };
    window.addEventListener('keydown', handleEscape);

    let isPopping = false;
    const handlePopState = () => {
      if (isPopping) return;
      isPopping = true;
      const stepped = handleBackStep();
      if (stepped) {
        window.history.pushState(null, '', window.location.href);
      }
      setTimeout(() => {
        isPopping = false;
      }, 50);
    };

    window.addEventListener('popstate', handlePopState);
    window.history.pushState(null, '', window.location.href);

    return () => {
      delete window.__OTIUM_HANDLE_BACK__;
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [handleBackStep]);

  return {
    isFullscreen,
    handleToggleFullscreen,
  };
}
