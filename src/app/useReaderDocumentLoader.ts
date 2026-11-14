import { useCallback, useEffect, useRef } from 'react';
import { isPdfBuffer, openPdf, type PdfLoadingTaskHandle } from '../core/pdf/document';
import { mergeTextAnnotations } from '../core/annotations/textSync';
import {
  adoptLegacyDocumentRecord,
  saveDocumentToStorage,
  updateDocumentPage,
} from '../core/storage/documents';
import { fingerprintDocument } from '../core/storage/documentIdentity';
import { loadStoredAnnotations } from '../core/storage/annotations';
import { getStoredBookmarks } from '../core/storage/bookmarks';
import { loadLastPage, loadScrollOffset } from '../core/settings/preferences';
import { computeOptimalPageScale } from '../core/reader/device';
import { clearSearchTextCache } from '../core/search/documentSearch';
import { stopTts } from '../platform/tts';
import {
  describeDocumentError,
  destroyDocumentSoon,
  EMPTY_PASSWORD_MODAL,
} from './readerControllerHelpers';
import {
  applyInitialDocumentTheme,
  destroyPdfTaskQuietly,
  detectDocumentArabicScript,
  resolveInitialPageNumber,
  type UseReaderDocumentLoaderOptions,
} from './readerDocumentLoaderHelpers';
import { useReaderFileOpeners } from './useReaderFileOpeners';

/**
 * Coordinates PDF opening, drag-and-drop file loading, password prompts,
 * sample/recent document loading, and clean document closing.
 */
export function useReaderDocumentLoader(opts: UseReaderDocumentLoaderOptions) {
  const {
    dragDropEnabled,
    lang,
    langRef,
    viewMode,
    chromeInset,
    docRef,
    docIdRef,
    annotationsGenerationRef,
    annotationsHydratedRef,
    bookmarksHydratedRef,
    pendingScrollPageRef,
    pendingScrollOffsetRef,
    pageSaveTimerRef,
    currentPageRef,
    scrollContainerRef,
    lastFitScaleRef,
    rememberDocThemeRef,
    themeScheduleRef,
    dayThemeRef,
    nightThemeRef,
    passwordModal,
    setPasswordModal,
    setDoc,
    setDocTitle,
    setDocId,
    setNumPages,
    setCurrentPage,
    setAnnotations,
    setBookmarks,
    setBasePageSize,
    setBaseAspectRatio,
    setSearchQuery,
    setActiveSearchPage,
    setSearchSeed,
    setIsSearchOpen,
    setIsSidebarOpen,
    setIsSettingsOpen,
    setIsImmersive,
    setDocumentError,
    setIsLoading,
    setLoadProgress,
    setDetectedDocIsRtl,
    setFitScaleState,
    setZoom,
    setFileSizeBytes,
    changeTheme,
  } = opts;

  const loadingTaskRef = useRef<PdfLoadingTaskHandle | null>(null);
  const loadGenerationRef = useRef(0);
  const fileReadGenerationRef = useRef(0);

  useEffect(() => {
    return () => {
      destroyPdfTaskQuietly(loadingTaskRef.current, 'PDF loading task teardown:');
      destroyPdfTaskQuietly(docRef.current?.loadingTask, 'PDF active task teardown:');
    };
  }, [docRef]);

  const closeDocument = useCallback(() => {
    fileReadGenerationRef.current++;
    loadGenerationRef.current++;
    const pendingTask = loadingTaskRef.current;
    loadingTaskRef.current = null;
    destroyPdfTaskQuietly(pendingTask, 'PDF close pending task teardown:');
    stopTts();
    if (pageSaveTimerRef.current !== null && docIdRef.current) {
      window.clearTimeout(pageSaveTimerRef.current);
      pageSaveTimerRef.current = null;
      void updateDocumentPage(docIdRef.current, currentPageRef.current);
    }
    const activeDoc = docRef.current;
    clearSearchTextCache(activeDoc);
    docRef.current = null;
    docIdRef.current = '';
    annotationsGenerationRef.current += 1;
    annotationsHydratedRef.current = false;
    bookmarksHydratedRef.current = false;
    setDoc(null);
    setDocTitle('');
    setDocId('');
    setNumPages(0);
    setCurrentPage(1);
    setAnnotations([]);
    setBookmarks([]);
    setSearchQuery('');
    setActiveSearchPage(null);
    setSearchSeed(null);
    setIsSearchOpen(false);
    setIsSidebarOpen(false);
    setIsSettingsOpen(false);
    setIsImmersive(false);

    setPasswordModal(EMPTY_PASSWORD_MODAL);
    setDocumentError(null);
    setIsLoading(false);
    setLoadProgress(null);
    lastFitScaleRef.current = 0;
    setFitScaleState(0);
    if (activeDoc) destroyDocumentSoon(activeDoc);
  }, [
    annotationsGenerationRef,
    annotationsHydratedRef,
    bookmarksHydratedRef,
    currentPageRef,
    docIdRef,
    docRef,
    lastFitScaleRef,
    pageSaveTimerRef,
    setActiveSearchPage,
    setAnnotations,
    setBookmarks,
    setCurrentPage,
    setDoc,
    setDocId,
    setDocTitle,
    setDocumentError,
    setFitScaleState,
    setIsImmersive,
    setIsLoading,
    setIsSearchOpen,
    setIsSettingsOpen,
    setIsSidebarOpen,
    setLoadProgress,
    setNumPages,
    setPasswordModal,
    setSearchQuery,
    setSearchSeed,
  ]);

  const handlePasswordCancel = useCallback(() => {
    loadGenerationRef.current += 1;
    const task = loadingTaskRef.current;
    loadingTaskRef.current = null;
    destroyPdfTaskQuietly(task, 'PDF password cancel teardown:');
    setPasswordModal(EMPTY_PASSWORD_MODAL);
    setIsLoading(false);
    setLoadProgress(null);
  }, [setIsLoading, setLoadProgress, setPasswordModal]);

  const loadPdfData = async (data: ArrayBuffer, title: string, startPage?: number, reportFailure = false) => {
    fileReadGenerationRef.current++;
    const generation = ++loadGenerationRef.current;
    const previousTask = loadingTaskRef.current;
    loadingTaskRef.current = null;
    destroyPdfTaskQuietly(previousTask, 'PDF previous task teardown:');
    setLoadProgress(null);
    setPasswordModal(EMPTY_PASSWORD_MODAL);

    if (!data || data.byteLength === 0) {
      setIsLoading(false);
      setDocumentError(lang === 'ar' ? 'الملف المحدد فارغ.' : 'The selected file is empty.');
      return false;
    }

    if (!isPdfBuffer(data)) {
      setIsLoading(false);
      setDocumentError(
        lang === 'ar'
          ? 'الملف المحدد تالف أو ليس مستند PDF صالحاً.'
          : 'The selected file is corrupt or not a valid PDF document.'
      );
      return false;
    }

    setDocumentError(null);
    setIsLoading(true);

    const storageBuffer = data.slice(0);
    const identityPromise = fingerprintDocument(storageBuffer).then(undefined, (err: unknown) => {
      console.warn('PDF fingerprint fallback:', err);
      return '';
    });

    try {
      const handle = openPdf(data, {
        onPassword: ({ callback, reason }) => {
          if (generation !== loadGenerationRef.current) return;
          setIsLoading(false);
          setPasswordModal({
            isOpen: true,
            isIncorrect: reason === 2,
            callback,
            title,
          });
        },
        onProgress: (loaded, total) => {
          if (generation !== loadGenerationRef.current || total <= 0) return;
          setLoadProgress(Math.min(100, Math.round((loaded / total) * 100)));
        },
      });
      loadingTaskRef.current = handle.loadingTask;

      const opened = await handle.promise;
      if (generation !== loadGenerationRef.current) {
        destroyDocumentSoon(opened.doc);
        return false;
      }

      const documentId = (await identityPromise) || title;
      if (generation !== loadGenerationRef.current) {
        destroyDocumentSoon(opened.doc);
        return false;
      }

      loadingTaskRef.current = null;
      const previousDoc = docRef.current;
      const annotationGeneration = ++annotationsGenerationRef.current;
      annotationsHydratedRef.current = false;
      bookmarksHydratedRef.current = false;
      docRef.current = opened.doc;
      docIdRef.current = documentId;

      setDoc(opened.doc);
      setDocTitle(title);
      setDocId(documentId);
      setNumPages(opened.numPages);
      setAnnotations([]);
      void loadStoredAnnotations(documentId, title)
        .then((stored) => {
          if (annotationGeneration !== annotationsGenerationRef.current) return;
          annotationsHydratedRef.current = true;
          setAnnotations((current) => mergeTextAnnotations(current, stored));
        })
        .catch(() => {
          if (annotationGeneration !== annotationsGenerationRef.current) return;
          annotationsHydratedRef.current = true;
          setAnnotations([]);
        });
      setBookmarks(getStoredBookmarks(documentId, title));
      bookmarksHydratedRef.current = true;
      setBasePageSize(opened.basePageSize);
      setBaseAspectRatio(opened.baseAspectRatio);
      setPasswordModal(EMPTY_PASSWORD_MODAL);
      setSearchQuery('');
      setActiveSearchPage(null);
      setSearchSeed(null);
      setIsSearchOpen(false);
      setIsSidebarOpen(false);
      setIsImmersive(false);
      setDocumentError(null);

      setDetectedDocIsRtl(false);
      void detectDocumentArabicScript(opened.doc, () => generation === loadGenerationRef.current).then((rtl) => {
        if (rtl !== null) setDetectedDocIsRtl(rtl);
      });

      if (opened.basePageSize.width && opened.basePageSize.height && typeof window !== 'undefined') {
        const fit = computeOptimalPageScale(
          opened.basePageSize.width,
          opened.basePageSize.height,
          scrollContainerRef.current?.clientWidth || window.innerWidth,
          (scrollContainerRef.current?.clientHeight || window.innerHeight) - chromeInset,
          viewMode
        );
        lastFitScaleRef.current = fit;
        setFitScaleState(fit);
        setZoom(fit);
      }

      const savedPage = loadLastPage(documentId, title);
      const savedOffset = loadScrollOffset(documentId);
      const initialPage = resolveInitialPageNumber(startPage, savedPage, opened.numPages);
      pendingScrollPageRef.current = initialPage > 1 || savedOffset > 0 ? initialPage : null;
      pendingScrollOffsetRef.current = savedOffset > 0 ? savedOffset : null;
      setCurrentPage(initialPage);
      setFileSizeBytes(storageBuffer.byteLength);

      applyInitialDocumentTheme({
        rememberDocTheme: rememberDocThemeRef.current,
        documentId,
        title,
        themeSchedule: themeScheduleRef.current,
        dayTheme: dayThemeRef.current,
        nightTheme: nightThemeRef.current,
        changeTheme,
      });

      if (storageBuffer.byteLength > 0) {
        void saveDocumentToStorage(documentId, title, storageBuffer, opened.numPages, initialPage)
          .then(() => adoptLegacyDocumentRecord(title, documentId));
      } else {
        void updateDocumentPage(documentId, initialPage, savedOffset);
      }

      if (previousDoc && previousDoc !== opened.doc) {
        clearSearchTextCache(previousDoc);
        destroyDocumentSoon(previousDoc);
      }
      return true;
    } catch (error) {
      if (generation !== loadGenerationRef.current) return false;
      destroyPdfTaskQuietly(loadingTaskRef.current, 'PDF failed task teardown:');
      loadingTaskRef.current = null;
      setPasswordModal(EMPTY_PASSWORD_MODAL);
      setDocumentError(describeDocumentError(error, lang));
      console.error('Error loading PDF:', error);
      if (reportFailure) throw error;
      return false;
    } finally {
      if (generation === loadGenerationRef.current) {
        setIsLoading(false);
        setLoadProgress(null);
      }
    }
  };

  const loadDocumentRef = useRef(loadPdfData);
  useEffect(() => {
    loadDocumentRef.current = loadPdfData;
  });

  const { openFile, openSample, loadDocumentBytes, openRecent } = useReaderFileOpeners({
    dragDropEnabled,
    lang,
    langRef,
    fileReadGenerationRef,
    loadDocumentRef,
    setIsLoading,
    setDocumentError,
  });

  const handlePasswordSubmit = useCallback(
    (password: string) => {
      if (!passwordModal.callback) return;
      setIsLoading(true);
      passwordModal.callback(password);
    },
    [passwordModal, setIsLoading]
  );

  return {
    loadDocumentRef,
    closeDocument,
    handlePasswordCancel,
    handlePasswordSubmit,
    openFile,
    openSample,
    loadDocumentBytes,
    openRecent,
  };
}
