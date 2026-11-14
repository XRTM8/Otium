import { useState, useEffect, useCallback, useRef } from 'react';
import type { FilterType, Quad, ScannedPage, ScanStep } from './core/types';
import { applyFilterAsync } from './core/filters';
import { registerBackHandler } from '../core/navigation/backHandler';
import {
  storePageToDisk,
  clearScanSession,
  rotateStoredPage,
  deleteStoredPage,
  duplicateStoredPage,
  loadOriginalBlobFromDisk,
  saveActiveSessionPages,
  getActiveSessionPages,
  clearActiveSessionPages,
} from './core/storage/pageStore';
import { automaticCropConfidence, detectDocumentCornersWithConfidence, getFullFrameQuad } from './core/edgeDetection';
import { createImageFromBlob } from './core/storage/pageImageOps';
import { warpPerspectiveAsync } from './core/geometry';
import { terminateScannerWorker } from './core/wasmEngine';

async function saveScannedPage(
  original: Blob,
  quad: Quad,
  warpedCanvas: HTMLCanvasElement | null,
  preferredFilter: FilterType = 'original',
  needsCropReview = false,
  preview?: HTMLImageElement,
): Promise<ScannedPage> {
  const id = `page_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  let filteredCanvas: HTMLCanvasElement | null = null;
  try {
    filteredCanvas = warpedCanvas && await applyFilterAsync(warpedCanvas, preferredFilter);
    const filter = filteredCanvas && filteredCanvas !== warpedCanvas ? preferredFilter : 'original';
    const thumbnailDataUrl = await storePageToDisk(id, original, warpedCanvas, filteredCanvas, filter, preview);
    return { id, thumbnailDataUrl, quad, filter, needsCropReview, timestamp: Date.now() };
  } finally {
    if (filteredCanvas && filteredCanvas !== warpedCanvas) filteredCanvas.width = filteredCanvas.height = 1;
  }
}

export function useScannerSession(onClose: () => void) {
  const [{ initialStep, initialPages }] = useState(() => {
    const activeDraft = getActiveSessionPages();
    if (activeDraft && activeDraft.length > 0) {
      return { initialStep: 'review' as ScanStep, initialPages: activeDraft };
    }
    return { initialStep: 'camera' as ScanStep, initialPages: [] as ScannedPage[] };
  });

  const [step, setStep] = useState<ScanStep>(initialStep);
  const [currentRawImage, setCurrentRawImage] = useState('');
  const currentOriginal = useRef<Blob | null>(null);
  const [currentInitialQuad, setCurrentInitialQuad] = useState<Quad | null>(null);
  const [pages, setPageState] = useState<ScannedPage[]>(initialPages);
  const pagesRef = useRef(initialPages);
  const setPages = useCallback((update: ScannedPage[] | ((previous: ScannedPage[]) => ScannedPage[])) => {
    const next = typeof update === 'function' ? update(pagesRef.current) : update;
    if (!saveActiveSessionPages(next) && next.length) throw new Error('Could not save the scan draft');
    pagesRef.current = next;
    setPageState(next);
  }, []);
  const [busy, setBusy] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const busyRef = useRef(false);
  const [retakeTargetIndex, setRetakeTargetIndex] = useState<number | null>(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showCloseConfirmModal, setShowCloseConfirmModal] = useState(false);
  const [isOpeningInReader, setIsOpeningInReader] = useState(false);
  const latestCaptureRef = useRef(0);

  const invalidateCapture = useCallback(() => { latestCaptureRef.current++; }, []);
  useEffect(() => () => {
    invalidateCapture();
    terminateScannerWorker();
  }, [invalidateCapture]);

  useEffect(() => () => {
    if (currentRawImage) URL.revokeObjectURL(currentRawImage);
  }, [currentRawImage]);

  const openCrop = (original: Blob, quad: Quad) => {
    currentOriginal.current = original;
    setCurrentRawImage(URL.createObjectURL(original));
    setCurrentInitialQuad(quad);
    setStep('crop');
  };

  const handleCapture = async (images: Blob[], autoCrop: boolean): Promise<number> => {
    if (busyRef.current) return 0;
    busyRef.current = true;
    setBusy(true);
    const capture = ++latestCaptureRef.current;
    let saved = 0;
    try {
      for (const original of images) {
        if (capture !== latestCaptureRef.current) break;
        try {
          const img = await createImageFromBlob(original);
          const fullFrame = getFullFrameQuad(img.naturalWidth, img.naturalHeight, 0);
          const page = await saveScannedPage(original, fullFrame, null, 'original', autoCrop, img);
          try {
            if (capture !== latestCaptureRef.current) break;
            const replaced = retakeTargetIndex !== null ? pagesRef.current[retakeTargetIndex] : undefined;
            setPages((previous) => replaced
              ? previous.map((item) => item.id === replaced.id ? page : item)
              : [...previous, page]);
            if (replaced) void deleteStoredPage(replaced.id).catch(console.warn);
          } finally {
            if (!pagesRef.current.some((item) => item.id === page.id)) {
              void deleteStoredPage(page.id).catch(console.warn);
            }
          }
          saved++;
          if (autoCrop) {
            const detected = detectDocumentCornersWithConfidence(img);
            if (detected.isDocumentPresent && detected.confidence < automaticCropConfidence) {
              setPages((previous) => previous.map((item) => item.id === page.id
                ? { ...item, suggestedQuad: detected.quad }
                : item));
            }
            if (detected.confidence >= automaticCropConfidence) {
              let cropped: ScannedPage | undefined;
              let warped: HTMLCanvasElement | undefined;
              try {
                warped = await warpPerspectiveAsync(img, detected.quad);
                if (capture !== latestCaptureRef.current) break;
                cropped = await saveScannedPage(original, detected.quad, warped, 'magic');
                if (capture !== latestCaptureRef.current) break;
                const replacement = cropped;
                setPages((previous) => previous.map((item) => item.id === page.id ? replacement : item));
                void deleteStoredPage(page.id).catch(console.warn);
              } catch (error) {
                console.warn('Automatic crop failed; original is saved:', error);
              } finally {
                if (warped) warped.width = warped.height = 1;
                if (cropped && !pagesRef.current.some((item) => item.id === cropped?.id)) {
                  void deleteStoredPage(cropped.id).catch(console.warn);
                }
              }
            }
          }
          if (retakeTargetIndex !== null) {
            setRetakeTargetIndex(null);
            setStep('review');
            break;
          }
        } catch (error) {
          console.warn('Scan page could not be saved:', error);
        }
      }
      return saved;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleCropConfirm = async (warpedCanvas: HTMLCanvasElement, quad: Quad, source: string) => {
    if (!currentOriginal.current) return;
    const capture = latestCaptureRef.current;
    const previousPage = retakeTargetIndex === null ? undefined : pagesRef.current[retakeTargetIndex];
    const original = source === currentRawImage ? currentOriginal.current : await (await fetch(source)).blob();
    const newPage = await saveScannedPage(original, quad, warpedCanvas, previousPage?.filter ?? 'original');
    try {
      if (capture !== latestCaptureRef.current) return;
      setPages((previous) => previousPage
        ? previous.map((page) => page.id === previousPage.id ? newPage : page)
        : [...previous, newPage]);
      if (previousPage) void deleteStoredPage(previousPage.id).catch(console.warn);
    } finally {
      if (!pagesRef.current.some((page) => page.id === newPage.id)) {
        void deleteStoredPage(newPage.id).catch(console.warn);
      }
    }
    setCurrentRawImage('');
    currentOriginal.current = null;
    setCurrentInitialQuad(null);
    setRetakeTargetIndex(null);
    setStep('review');
  };

  const handleCropCancel = useCallback(() => {
    latestCaptureRef.current++;
    setCurrentRawImage('');
    currentOriginal.current = null;
    setCurrentInitialQuad(null);
    setRetakeTargetIndex(null);
    setStep(pagesRef.current.length ? 'review' : 'camera');
  }, []);

  const handleEditCrop = async (index: number) => {
    const page = pages[index];
    if (!page || page.redacted) return;
    const capture = ++latestCaptureRef.current;
    try {
      const original = await loadOriginalBlobFromDisk(page.id);
      if (capture !== latestCaptureRef.current) return;
      openCrop(original, page.needsCropReview && page.suggestedQuad ? page.suggestedQuad : page.quad);
      setRetakeTargetIndex(index);
    } catch (error) {
      console.warn('Could not load original image for crop:', error);
    }
  };

  const handleRotatePage = async (index: number) => {
    const page = pages[index];
    if (!page) return;
    try {
      const newThumb = await rotateStoredPage(page.id);
      setPages((prev) => prev.map((item) => item.id === page.id ? { ...item, thumbnailDataUrl: newThumb } : item));
    } catch (err) {
      console.error('Failed to rotate page:', err);
    }
  };

  const handleDeletePage = (index: number) => {
    const page = pagesRef.current[index];
    if (!page) return;
    setPages((prev) => prev.filter((item) => item.id !== page.id));
    void deleteStoredPage(page.id).catch(console.warn);
    if (pagesRef.current.length === 0) setStep('camera');
  };

  const handleDuplicatePage = async (index: number) => {
    const page = pages[index];
    if (!page) return;
    const newId = `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    try {
      await duplicateStoredPage(page.id, newId);
      setPages((prev) => {
        const idx = prev.findIndex((p) => p.id === page.id);
        const sourcePage = idx === -1 ? undefined : prev[idx];
        if (!sourcePage) return prev;
        const copy: ScannedPage = { ...sourcePage, id: newId, timestamp: Date.now() };
        const updated = [...prev];
        updated.splice(idx + 1, 0, copy);
        return updated;
      });
    } catch (err) {
      console.warn('Failed to duplicate page:', err);
    }
  };

  const handleUpdatePageThumbnail = useCallback((pageId: string, thumbnailDataUrl: string, updates?: Partial<Pick<ScannedPage, 'filter' | 'redacted' | 'needsCropReview'>>) => {
    setPages((prev) => prev.map((page) => page.id === pageId ? { ...page, ...updates, thumbnailDataUrl } : page));
  }, [setPages]);

  const handleMovePage = (fromIndex: number, toIndex: number) => {
    setPages((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) return prev;
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      if (!moved) return prev;
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  };

  const handleResetAll = () => {
    if (busyRef.current) return;
    latestCaptureRef.current++;
    void clearScanSession().catch(console.warn);
    clearActiveSessionPages();
    setPages([]);
    setStep('camera');
  };

  const handleRequestClose = useCallback(() => {
    if (busyRef.current) return;
    if (pages.length === 0) {
      void clearScanSession().catch(console.warn);
      clearActiveSessionPages();
      onClose();
    } else {
      setShowCloseConfirmModal(true);
    }
  }, [pages.length, onClose]);

  const handleSaveDraftAndClose = () => {
    if (!saveActiveSessionPages(pages)) { setStorageError(true); return; }
    setShowCloseConfirmModal(false);
    onClose();
  };

  const handleDiscardAndClose = () => {
    void clearScanSession().catch(console.warn);
    clearActiveSessionPages();
    setPages([]);
    setShowCloseConfirmModal(false);
    onClose();
  };

  useEffect(() => {
    const handleBack = (event?: Event) => {
      if (event && event.cancelable) event.preventDefault();
      if (isLibraryOpen) { setIsLibraryOpen(false); return true; }
      if (isSettingsOpen) { setIsSettingsOpen(false); return true; }
      if (showCloseConfirmModal) { setShowCloseConfirmModal(false); return true; }
      if (step === 'crop') { handleCropCancel(); return true; }
      if (step === 'review' && pages.length === 0) { setStep('camera'); return true; }
      handleRequestClose();
      return true;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        handleBack();
      }
    };
    const unregisterBack = registerBackHandler(() => { handleBack(); return true; });
    window.addEventListener('otium:back', handleBack);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      unregisterBack();
      window.removeEventListener('otium:back', handleBack);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLibraryOpen, isSettingsOpen, showCloseConfirmModal, step, pages.length, handleCropCancel, handleRequestClose]);

  return {
    step, setStep, currentRawImage, currentInitialQuad, pages, busy, storageError,
    isLibraryOpen, setIsLibraryOpen, isSettingsOpen, setIsSettingsOpen,
    showCloseConfirmModal, setShowCloseConfirmModal, isOpeningInReader, setIsOpeningInReader,
    handleCapture, handleCropConfirm, handleCropCancel,
    handleAddMorePages: () => { setRetakeTargetIndex(null); setStep('camera'); },
    handleRetakePage: (index: number) => { setRetakeTargetIndex(index); setStep('camera'); },
    handleEditCrop, handleRotatePage, handleDeletePage, handleDuplicatePage,
    handleUpdatePageThumbnail, handleMovePage, handleResetAll,
    handleRequestClose, handleSaveDraftAndClose, handleDiscardAndClose,
  };
}
