import { useCallback, useLayoutEffect, useRef } from 'react';
import type { ViewMode } from '../core/types';
import { computeNextViewModeFitScale, type ReaderCapabilities } from './readerControllerHelpers';
import { useReaderUiState } from './useReaderUiState';
import { useReaderEffects } from './useReaderEffects';
import { useReaderThemeAndWake } from './useReaderThemeAndWake';
import { useReaderViewportAndZoom } from './useReaderViewportAndZoom';
import { useReaderNavigation } from './useReaderNavigation';
import { useReaderBookmarksAndAnnotations } from './useReaderBookmarksAndAnnotations';
import { useReaderDocumentLoader } from './useReaderDocumentLoader';
import { useReaderBeamCoordinator } from './useReaderBeamCoordinator';
import { useReaderKeyboardShortcuts } from './useReaderKeyboardShortcuts';
import { useReaderBackNavigation } from './useReaderBackNavigation';
import { useReaderDocumentActions } from './useReaderDocumentActions';

export type { ReaderCapabilities } from './readerControllerHelpers';

export function useReaderController(capabilities: ReaderCapabilities) {
  const ui = useReaderUiState();
  const {
    doc,
    docTitle,
    setDocTitle,
    docId,
    docIdRef,
    numPages,
    currentPage,
    setCurrentPage,
    currentPageRef,
    pendingScrollPageRef,
    pendingScrollOffsetRef,
    pageSaveTimerRef,
    lastSavedPageRef,
    setDualFlipKey,
    setDualFlipDir,
    setArrivalGlowKey,
    basePageSize,
    viewMode,
    setViewMode,
    lang,
    setLang,
    fontFamily,
    setFontFamily,
    setShowMobileNavBar,
    isImmersive,
    setIsImmersive,
    isSidebarOpen,
    setIsSidebarOpen,
    isSearchOpen,
    setIsSearchOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    isLoading,
    setIsLoading,
    setDocumentError,
    setSearchQuery,
    setActiveSearchPage,
    setSearchSeed,
    passwordModal,
  } = ui;

  // Android chrome floats above the reader: reserve for top bar + bottom nav.
  const chromeInset = capabilities.keyboard ? 0 : 96;

  const {
    theme,
    themeSchedule,
    dayTheme,
    nightTheme,
    rememberDocTheme,
    keepScreenAwake,
    rememberDocThemeRef,
    themeScheduleRef,
    dayThemeRef,
    nightThemeRef,
    changeTheme,
    changeThemeSchedule,
    changeDayTheme,
    changeNightTheme,
    changeRememberDocTheme,
    changeKeepScreenAwake,
  } = useReaderThemeAndWake({ doc, docIdRef });

  const viewportActionsRef = useRef({
    goToNextPage: () => {},
    goToPrevPage: () => {},
  });

  const {
    zoom,
    setZoom,
    setFitScaleState,
    lastFitScaleRef,
    scrollContainerRef,
    getFitScale,
    refitViewport,
    getMinZoom,
    getMaxZoom,
    minZoom,
    maxZoom,
    captureZoomAnchor,
    clearZoomAnchor,
    touchZoomActiveRef,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    resetWheelTurnAccum,
  } = useReaderViewportAndZoom({
    doc,
    viewMode,
    basePageSize,
    chromeInset,
    keyboardCapable: capabilities.keyboard,
    currentPageRef,
    docIdRef,
    pageSaveTimerRef,
    actionsRef: viewportActionsRef,
  });

  const {
    scrollToPage,
    handlePageVisible,
    goToNextPage,
    goToPrevPage,
    cancelPendingPageSave,
  } = useReaderNavigation({
    doc,
    docId,
    numPages,
    currentPage,
    viewMode,
    scrollContainerRef,
    pendingScrollPageRef,
    pendingScrollOffsetRef,
    pageSaveTimerRef,
    lastSavedPageRef,
    setCurrentPage,
    setDualFlipDir,
    setDualFlipKey,
    setArrivalGlowKey,
    resetWheelTurnAccum,
  });

  useLayoutEffect(() => {
    viewportActionsRef.current = { goToNextPage, goToPrevPage };
  }, [goToNextPage, goToPrevPage]);

  useReaderEffects({
    keyboardCapable: capabilities.keyboard,
    isImmersive,
    fontFamily,
    lang,
    cancelPendingPageSave,
  });

  const changeViewMode = useCallback(
    (nextMode: ViewMode) => {
      if (!['single', 'dual', 'continuous'].includes(nextMode)) return;
      if (nextMode === 'continuous' && currentPage > 1) {
        pendingScrollPageRef.current = currentPage;
      }
      setViewMode(nextMode);
      const fit = computeNextViewModeFitScale(nextMode, basePageSize, scrollContainerRef.current, chromeInset);
      if (fit !== null) {
        lastFitScaleRef.current = fit;
        setFitScaleState(fit);
        setZoom(fit);
      }
    },
    [basePageSize, chromeInset, currentPage, lastFitScaleRef, pendingScrollPageRef, scrollContainerRef, setFitScaleState, setViewMode, setZoom]
  );

  const {
    changeLanguage,
    changeFont,
    handleSearchQueryChange,
    openSearchWithText,
    closeSearch,
    changeMobileNavVisibility,
    resetDefaults,
    renameCurrentDocument,
  } = useReaderDocumentActions({
    docId,
    setLang,
    setFontFamily,
    setDocTitle,
    setSearchQuery,
    setActiveSearchPage,
    setSearchSeed,
    setIsSearchOpen,
    setShowMobileNavBar,
    changeTheme,
    changeThemeSchedule,
    changeDayTheme,
    changeNightTheme,
    changeRememberDocTheme,
    changeViewMode,
  });

  const {
    annotations,
    setAnnotations,
    annotationSaveStatus,
    bookmarks,
    setBookmarks,
    annotationsGenerationRef,
    annotationsHydratedRef,
    bookmarksHydratedRef,
    mergeRemoteAnnotations,
    toggleBookmark,
    addAnnotation,
    deleteAnnotation,
    updateAnnotationNote,
    exportBackup,
    importBackup,
  } = useReaderBookmarksAndAnnotations({
    docId,
    currentPage,
    changeTheme,
    changeViewMode,
    changeFont,
    setLang,
  });

  const {
    loadDocumentRef,
    closeDocument,
    handlePasswordCancel,
    handlePasswordSubmit,
    openFile,
    openSample,
    loadDocumentBytes,
    openRecent,
  } = useReaderDocumentLoader({
    ...ui,
    dragDropEnabled: capabilities.dragDrop,
    chromeInset,
    annotationsGenerationRef,
    annotationsHydratedRef,
    bookmarksHydratedRef,
    scrollContainerRef,
    lastFitScaleRef,
    rememberDocThemeRef,
    themeScheduleRef,
    dayThemeRef,
    nightThemeRef,
    setAnnotations,
    setBookmarks,
    setFitScaleState,
    setZoom,
    changeTheme,
  });

  const { isFullscreen, handleToggleFullscreen } = useReaderBackNavigation({
    doc,
    passwordModalOpen: passwordModal.isOpen,
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
  });

  const {
    beamRoom,
    beamPeerConnected,
    autoBeam,
    beamRole,
    beamSelection,
    receiveBeamSelection,
    disconnectBeam,
  } = useReaderBeamCoordinator({
    doc,
    docTitle,
    docId,
    numPages,
    currentPage,
    viewMode,
    theme,
    lang,
    isLoading,
    scrollContainerRef,
    scrollToPage,
    goToNextPage,
    goToPrevPage,
    changeTheme,
    changeViewMode,
    loadDocumentRef,
    setIsLoading,
    setDocumentError,
  });

  const numberJumpDisplay = useReaderKeyboardShortcuts({
    enabled: capabilities.keyboard,
    numPages,
    currentPage,
    viewMode,
    theme,
    docIsRtl: ui.docIsRtl,
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
  });

  return {
    ...ui,
    zoom,
    minZoom,
    maxZoom,
    getFitScale,
    setZoom,
    refitViewport,
    captureZoomAnchor,
    clearZoomAnchor,
    theme,
    themeSchedule,
    dayTheme,
    nightTheme,
    rememberDocTheme,
    keepScreenAwake,
    isFullscreen,
    annotations,
    annotationSaveStatus,
    beamSelection,
    receiveBeamSelection,
    mergeRemoteAnnotations,
    bookmarks,
    numberJumpDisplay,
    renameDocument: renameCurrentDocument,
    scrollContainerRef,
    openFile,
    openSample,
    openRecent,
    closeDocument,
    clearDocumentError: () => setDocumentError(null),
    handlePageVisible,
    scrollToPage,
    goToNextPage,
    goToPrevPage,
    changeTheme,
    changeThemeSchedule,
    changeDayTheme,
    changeNightTheme,
    changeRememberDocTheme,
    changeKeepScreenAwake,
    changeLanguage,
    changeFont,
    changeViewMode,
    changeMobileNavVisibility,
    toggleBookmark,
    addAnnotation,
    deleteAnnotation,
    updateAnnotationNote,
    exportBackup,
    importBackup,
    handlePasswordSubmit,
    handlePasswordCancel,
    touchZoomActiveRef,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    handleToggleFullscreen,
    handleSearchQueryChange,
    openSearchWithText,
    closeSearch,
    resetDefaults,
    loadDocumentBytes,
    beamRoom,
    beamPeerConnected,
    autoBeam,
    beamRole,
    disconnectBeam,
  };
}

export type ReaderController = ReturnType<typeof useReaderController>;
