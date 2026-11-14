import { useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { dewarpBookCurvatureAsync } from '../core/geometry';
import { extractPageTextAndMetadata } from '../core/ocr/ocrEngine';
import { nativeOpenInOtium, nativePrintPdf, nativeSaveImage, nativeSavePdf, nativeSharePdf } from '../core/nativeBridge';
import type { PdfCompressionPreset, PdfPageFormat, PdfWatermarkStyle } from '../core/pdf';
import {
  burnRedactionOnPageCanvas,
  cacheCompiledPdfInLibrary,
  compileScannedPdfDocument,
  type SignaturePlacement,
} from '../core/enhancePdfCompile';
import { loadPageCanvasFromDisk, updateStoredPageFilter } from '../core/storage/pageStore';
import type { Language } from '../../core/i18n/translations';
import type { FilterType, ScannedPage } from '../core/types';

export interface UseEnhanceExportActionsOptions {
  lang: Language;
  pages: ScannedPage[];
  currentPage: ScannedPage | undefined;
  safeIndex: number;
  activeFilter: FilterType;
  curvature: number;
  spinePos: number;
  signatures: Record<string, SignaturePlacement>;
  enableOcr: boolean;
  compressionPreset: PdfCompressionPreset;
  pageFormat: PdfPageFormat;
  watermarkText: string;
  watermarkStyle: PdfWatermarkStyle;
  docTitle: string;
  selectedPages: Set<string>;
  setSelectedPages: Dispatch<SetStateAction<Set<string>>>;
  redactionStrokes: { x: number; y: number }[][];
  setRedactionStrokes: (
    next: { x: number; y: number }[][] | ((prev: { x: number; y: number }[][]) => { x: number; y: number }[][])
  ) => void;
  setIsRedacting: (next: boolean | ((prev: boolean) => boolean)) => void;
  setRedactionDraftInit: (draftInit: string | null) => void;
  redactionPointsRef: RefObject<{ x: number; y: number }[]>;
  redactionLiveStrRef: RefObject<string>;
  redactionSvgRectRef: RefObject<DOMRect | null>;
  previewImageRef: RefObject<HTMLImageElement | null>;
  isExtractingText: boolean;
  setIsExtractingText: (v: boolean) => void;
  setExtractedText: (t: string) => void;
  setSuggestedDocTitle: (t: string) => void;
  setIsOcrModalOpen: (v: boolean) => void;
  setFullResPreviewUrl: (url: string) => void;
  setToastMsg: (msg: string) => void;
  setPdfGenerating: (v: boolean) => void;
  setOcrStatus: (s: string) => void;
  onRotatePage: (index: number) => Promise<void>;
  onDeletePage: (index: number) => void;
  onUpdatePageThumbnail?: (pageId: string, thumbnailDataUrl: string, updates?: Partial<ScannedPage>) => void;
  onOpenPdfInReader?: (file: File) => void | Promise<void>;
  triggerHaptic: (duration?: number) => void;
}

export function useEnhanceExportAndActions(options: UseEnhanceExportActionsOptions) {
  const {
    lang,
    pages,
    currentPage,
    safeIndex,
    activeFilter,
    curvature,
    spinePos,
    signatures,
    enableOcr,
    compressionPreset,
    pageFormat,
    watermarkText,
    watermarkStyle,
    docTitle,
    selectedPages,
    setSelectedPages,
    redactionStrokes,
    setRedactionStrokes,
    setIsRedacting,
    setRedactionDraftInit,
    redactionPointsRef,
    redactionLiveStrRef,
    redactionSvgRectRef,
    previewImageRef,
    isExtractingText,
    setIsExtractingText,
    setExtractedText,
    setSuggestedDocTitle,
    setIsOcrModalOpen,
    setFullResPreviewUrl,
    setToastMsg,
    setPdfGenerating,
    setOcrStatus,
    onRotatePage,
    onDeletePage,
    onUpdatePageThumbnail,
    onOpenPdfInReader,
    triggerHaptic,
  } = options;

  const generateCompiledPdf = async (onOcrPageFailed: () => void, presetOverride?: PdfCompressionPreset): Promise<Blob> =>
    compileScannedPdfDocument({
      pages,
      curvature,
      spinePos,
      signatures,
      enableOcr,
      compressionPreset: presetOverride || compressionPreset,
      pageFormat,
      watermarkText,
      watermarkStyle,
      onOcrProgress: (page, count) => setOcrStatus(page === null ? '' : lang === 'ar'
        ? `استخراج النص من الصفحة ${page} من ${count}…`
        : `Recognizing page ${page} of ${count}…`),
      onOcrPageFailed,
    });

  const handleFilterSelect = async (newFilter: FilterType) => {
    if (!currentPage) return;
    triggerHaptic(10);
    setToastMsg('');
    try {
      const thumbnail = await updateStoredPageFilter(currentPage.id, newFilter);
      onUpdatePageThumbnail?.(currentPage.id, thumbnail, { filter: newFilter });
      const canvas = await loadPageCanvasFromDisk(currentPage.id);
      const finalCanvas = curvature > 0 ? await dewarpBookCurvatureAsync(canvas, curvature, spinePos) : canvas;
      setFullResPreviewUrl(finalCanvas.toDataURL('image/jpeg', 0.9));
    } catch (e) {
      console.warn('Filter update failed:', e);
      setToastMsg(lang === 'ar' ? 'تعذّر تطبيق الفلتر. أعد المحاولة.' : 'Could not apply the filter. Try again.');
    }
  };

  const handleApplyFilterToAll = async () => {
    if (!currentPage) return;
    triggerHaptic(15);
    setToastMsg(lang === 'ar' ? 'جارٍ تطبيق الفلتر…' : 'Applying filter…');
    try {
      for (const p of pages) {
        const thumbnail = await updateStoredPageFilter(p.id, activeFilter);
        onUpdatePageThumbnail?.(p.id, thumbnail, { filter: activeFilter });
      }
      const canvas = await loadPageCanvasFromDisk(currentPage.id);
      const finalCanvas = curvature > 0 ? await dewarpBookCurvatureAsync(canvas, curvature, spinePos) : canvas;
      setFullResPreviewUrl(finalCanvas.toDataURL('image/jpeg', 0.9));
      setToastMsg(lang === 'ar' ? 'طُبّق الفلتر على كل الصفحات' : 'Filter applied to all pages');
    } catch (error) {
      console.warn('Could not apply the filter to all pages:', error);
      setToastMsg(lang === 'ar' ? 'تعذّر تطبيق الفلتر على كل الصفحات' : 'Could not apply the filter to all pages');
    }
    setTimeout(() => setToastMsg(''), 2200);
  };

  const handleTogglePageSelect = (pageId: string) => {
    triggerHaptic(10);
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };

  const handleBulkDelete = () => {
    if (selectedPages.size === 0) return;
    triggerHaptic(20);
    const indices = pages.flatMap((page, index) => selectedPages.has(page.id) ? [index] : []).reverse();
    indices.forEach((idx) => onDeletePage(idx));
    setSelectedPages(new Set());
    setToastMsg(lang === 'ar' ? `حُذفت ${indices.length} صفحة` : `Deleted ${indices.length} pages`);
    setTimeout(() => setToastMsg(''), 2200);
  };

  const handleDownloadJpg = async () => {
    if (!currentPage) return;
    triggerHaptic(20);
    try {
      const rawCanvas = await loadPageCanvasFromDisk(currentPage.id);
      const processed = curvature > 0 ? await dewarpBookCurvatureAsync(rawCanvas, curvature, spinePos) : rawCanvas;
      const filename = `${docTitle.trim() || 'Otium_Scan'}_Page_${safeIndex + 1}.jpg`;
      const blob = await new Promise<Blob | null>((res) => processed.toBlob(res, 'image/jpeg', 0.92));
      if (!blob) return;
      if (!await nativeSaveImage(blob, filename)) throw new Error('Image save failed');
      setToastMsg(`✓ تم حفظ صفحة ${safeIndex + 1} في الصور`);
      setTimeout(() => setToastMsg(''), 2200);
    } catch (e) {
      console.warn('JPG export failed:', e);
      setToastMsg(lang === 'ar' ? 'تعذّر حفظ الصورة' : 'Could not save the image');
    }
  };

  const handleBurnRedaction = async () => {
    if (!currentPage) return;
    if (redactionStrokes.length === 0) {
      setIsRedacting(false);
      return;
    }
    triggerHaptic(20);
    try {
      if (previewImageRef.current) {
        const previewUrl = await burnRedactionOnPageCanvas({
          page: currentPage,
          strokes: redactionStrokes,
          previewRect: previewImageRef.current.getBoundingClientRect(),
          onThumbnailUpdated: onUpdatePageThumbnail,
        });
        setFullResPreviewUrl(previewUrl);
        redactionPointsRef.current = [];
        redactionLiveStrRef.current = '';
        redactionSvgRectRef.current = null;
        setRedactionStrokes([]);
        setRedactionDraftInit(null);
        setIsRedacting(false);
        setToastMsg(lang === 'ar' ? 'حُجب النص في هذه الصفحة وحُذفت صورتها الأصلية من المسودة.' : 'Redacted this page and removed its original from the draft.');
        setTimeout(() => setToastMsg(''), 2200);
      }
    } catch (e) {
      console.warn('Redaction burn failed:', e);
      setToastMsg(lang === 'ar' ? 'تعذّر حفظ الحجب. أعد المحاولة.' : 'Could not save the redaction. Try again.');
    }
  };

  const handleRotateCurrentPage = async () => {
    if (!currentPage) return;
    triggerHaptic(20);
    try {
      await onRotatePage(safeIndex);
      const canvas = await loadPageCanvasFromDisk(currentPage.id);
      const finalCanvas = curvature > 0 ? await dewarpBookCurvatureAsync(canvas, curvature, spinePos) : canvas;
      setFullResPreviewUrl(finalCanvas.toDataURL('image/jpeg', 0.9));
    } catch (e) {
      console.warn('Rotation failed:', e);
    }
  };

  const handleExtractTextFromPage = async () => {
    if (isExtractingText || !currentPage) return;
    triggerHaptic(15);
    setIsExtractingText(true);
    setToastMsg('جاري استخراج النص والتعرف الضوئي...');
    try {
      const rawCanvas = await loadPageCanvasFromDisk(currentPage.id);
      const finalCanvas = curvature > 0 ? await dewarpBookCurvatureAsync(rawCanvas, curvature, spinePos) : rawCanvas;
      const result = await extractPageTextAndMetadata(finalCanvas);
      setExtractedText(result.text || 'لم يتم العثور على نص واضح في هذه الصفحة.');
      if (result.suggestedTitle) setSuggestedDocTitle(result.suggestedTitle);
      setIsOcrModalOpen(true);
      setToastMsg('');
    } catch (err) {
      console.warn('OCR error:', err);
      setToastMsg(lang === 'ar' ? 'تعذّر استخراج النص. الصورة ما زالت متاحة، أعد المحاولة.' : 'Could not extract text. You can try again.');
      setTimeout(() => setToastMsg(''), 2000);
    } finally {
      setIsExtractingText(false);
    }
  };

  const exportLock = useRef(false);
  const persistToLibrary = (pdfBlob: Blob) => cacheCompiledPdfInLibrary(docTitle, pages, pdfBlob);

  const runPdfTask = async (
    task: (pdfBlob: Blob, filename: string) => Promise<void>,
    optionsTask?: { preset?: PdfCompressionPreset; suffix?: string; pendingToast?: string; doneToast?: string; errToast?: string }
  ) => {
    if (exportLock.current) return;
    exportLock.current = true;
    triggerHaptic(optionsTask?.suffix === '' ? 25 : 20);
    setPdfGenerating(true);
    if (optionsTask?.pendingToast) setToastMsg(optionsTask.pendingToast);
    try {
      let skippedOcr = 0;
      const pdfBlob = await generateCompiledPdf(() => { skippedOcr++; }, optionsTask?.preset);
      const filename = `${docTitle.trim() || 'Otium_Scan'}${optionsTask?.suffix || ''}.pdf`;
      await task(pdfBlob, filename);
      await persistToLibrary(pdfBlob);
      if (skippedOcr) {
        setToastMsg(lang === 'ar'
          ? `حُفظت صور الصفحات. تعذّر إضافة النص القابل للبحث إلى ${skippedOcr} صفحة.`
          : `Page images exported. Searchable text failed on ${skippedOcr} page(s).`);
      } else if (optionsTask?.doneToast) {
        setToastMsg(optionsTask.doneToast);
        setTimeout(() => setToastMsg(''), 2400);
      }
    } catch (e) {
      console.warn('PDF export action failed:', e);
      if (optionsTask?.errToast) {
        setToastMsg(optionsTask.errToast);
        setTimeout(() => setToastMsg(''), 2200);
      }
    } finally {
      exportLock.current = false;
      setPdfGenerating(false);
      setOcrStatus('');
    }
  };

  return {
    handleFilterSelect,
    handleApplyFilterToAll,
    handleTogglePageSelect,
    handleBulkDelete,
    handleDownloadJpg,
    handleBurnRedaction,
    handleRotateCurrentPage,
    handleExtractTextFromPage,
    handleSharePdf: () =>
      runPdfTask((blob, name) => nativeSharePdf(blob, name, docTitle.trim() || 'Otium Document')),
    handleDownloadPdf: () =>
      runPdfTask(async (blob, name) => {
        if (!await nativeSavePdf(blob, name)) throw new Error('PDF save failed');
      }, {
        doneToast: lang === 'ar' ? 'حُفظ ملف PDF' : 'PDF saved',
      }),
    handleOpenInOtium: () =>
      runPdfTask(async (blob, name) => {
        if (onOpenPdfInReader) {
          await onOpenPdfInReader(new File([blob], name, { type: 'application/pdf' }));
          return;
        }
        await nativeOpenInOtium(blob, name);
      }),
    handlePrintPdf: () => runPdfTask((blob, name) => nativePrintPdf(blob, name)),
  };
}
