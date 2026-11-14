import React, { useEffect, useState, useRef } from 'react';
import type { ScannedPage } from '../core/types';
import type { PdfCompressionPreset, PdfPageFormat, PdfWatermarkStyle } from '../core/pdf';
import { loadPageCanvasFromDisk } from '../core/storage/pageStore';
import { dewarpBookCurvatureAsync } from '../core/geometry';
import { terminateOcrWorker } from '../core/ocr/ocrEngine';
import type { Language } from '../../core/i18n/translations';
import type { SignaturePlacement } from '../core/enhancePdfCompile';
import { EnhanceStageAndGrid } from './EnhanceStageAndGrid';
import { EnhanceBottomDock } from './EnhanceBottomDock';
import { EnhanceModals } from './EnhanceModals';
import { EnhanceHeaderBar } from './EnhanceHeaderBar';
import { useEnhanceGestures } from './useEnhanceGestures';
import { useEnhanceExportAndActions } from './useEnhanceExportAndActions';

interface EnhanceViewProps {
  lang?: Language;
  pages: ScannedPage[];
  onBackToCamera: () => void;
  onAddMorePages: () => void;
  onDeletePage: (index: number) => void;
  onMovePage: (fromIndex: number, toIndex: number) => void;
  onRetakePage: (index: number) => void;
  onRotatePage: (index: number) => Promise<void>;
  onEditCrop?: (index: number) => void;
  onDuplicatePage?: (index: number) => void;
  onUpdatePageThumbnail?: (pageId: string, thumbnailDataUrl: string, updates?: Partial<ScannedPage>) => void;
  onResetAll: () => void;
  onOpenPdfInReader?: (file: File) => void | Promise<void>;
}

export const EnhanceView: React.FC<EnhanceViewProps> = ({
  lang = 'ar',
  pages,
  onBackToCamera,
  onAddMorePages,
  onDeletePage,
  onMovePage,
  onRetakePage,
  onRotatePage,
  onEditCrop,
  onDuplicatePage,
  onUpdatePageThumbnail,
  onResetAll,
  onOpenPdfInReader,
}) => {
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [showDeletePageModal, setShowDeletePageModal] = useState<boolean>(false);
  const [showMoreActions, setShowMoreActions] = useState<boolean>(false);
  const [curvature, setCurvature] = useState<number>(0);
  const [spinePos, setSpinePos] = useState<number>(0.5);
  const [enableOcr, setEnableOcr] = useState<boolean>(false);
  const [compressionPreset, setCompressionPreset] = useState<PdfCompressionPreset>('balanced');
  const [pageFormat, setPageFormat] = useState<PdfPageFormat>('a4');
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const [signatures, setSignatures] = useState<Record<string, SignaturePlacement>>({});
  const [isGridView, setIsGridView] = useState(false);
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [watermarkText, setWatermarkText] = useState<string>('');
  const [watermarkStyle, setWatermarkStyle] = useState<PdfWatermarkStyle>('diagonal');
  const [isWatermarkOpen, setIsWatermarkOpen] = useState(false);
  const [isAdvancedOptionsOpen, setIsAdvancedOptionsOpen] = useState(false);
  const pageScopeKey =
    pages[Math.min(currentPageIndex, Math.max(0, pages.length - 1))]?.id ??
    String(Math.min(currentPageIndex, Math.max(0, pages.length - 1)));
  const [redactionState, setRedactionState] = useState<{
    key: string;
    active: boolean;
    strokes: { x: number; y: number }[][];
    draftInit: string | null;
  }>({ key: pageScopeKey, active: false, strokes: [], draftInit: null });
  const isRedacting = redactionState.key === pageScopeKey ? redactionState.active : false;
  const redactionStrokes = redactionState.key === pageScopeKey ? redactionState.strokes : [];
  const redactionDraftInit = redactionState.key === pageScopeKey ? redactionState.draftInit : null;

  const updateRedaction = (updater: (base: { key: string; active: boolean; strokes: { x: number; y: number }[][]; draftInit: string | null }) => { key: string; active: boolean; strokes: { x: number; y: number }[][]; draftInit: string | null }) =>
    setRedactionState((prev) => updater(prev.key === pageScopeKey ? prev : { key: pageScopeKey, active: false, strokes: [], draftInit: null }));
  const setIsRedacting = (next: boolean | ((prev: boolean) => boolean)) =>
    updateRedaction((base) => ({ ...base, active: typeof next === 'function' ? next(base.active) : next }));
  const setRedactionStrokes = (next: { x: number; y: number }[][] | ((prev: { x: number; y: number }[][]) => { x: number; y: number }[][])) =>
    updateRedaction((base) => ({ ...base, strokes: typeof next === 'function' ? next(base.strokes) : next }));
  const setRedactionDraftInit = (draftInit: string | null) =>
    updateRedaction((base) => ({ ...base, draftInit }));

  const redactionPointsRef = useRef<{ x: number; y: number }[]>([]);
  const redactionLiveStrRef = useRef<string>('');
  const redactionSvgRectRef = useRef<DOMRect | null>(null);
  const redactionPolylineRef = useRef<SVGPolylineElement | null>(null);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const [toastMsg, setToastMsg] = useState<string>('');
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string>('');
  const [previewState, setPreviewState] = useState<{ key: string; url: string }>({ key: pageScopeKey, url: '' });
  const fullResPreviewUrl = previewState.key === pageScopeKey ? previewState.url : '';
  const setFullResPreviewUrl = (url: string) => setPreviewState({ key: pageScopeKey, url });
  const [docTitle, setDocTitle] = useState<string>(() => {
    const d = new Date();
    return `Otium_Doc_${d.toISOString().slice(0, 10)}_${d.toTimeString().slice(0, 5).replace(':', '-')}`;
  });
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);
  const [extractedText, setExtractedText] = useState<string>('');
  const [isExtractingText, setIsExtractingText] = useState(false);
  const [suggestedDocTitle, setSuggestedDocTitle] = useState<string>('');

  const safeIndex = Math.min(currentPageIndex, Math.max(0, pages.length - 1));
  const currentPage = pages[safeIndex];
  const activeFilter = currentPage?.filter ?? 'original';

  const triggerHaptic = (duration = 15) => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(duration);
      } catch (err) {
        console.debug('[EnhanceView] Haptic vibrate skipped:', err);
      }
    }
  };

  const {
    stageContainerRef,
    zoomScale,
    panOffset,
    resetZoomAndPan,
    handleStageTouchStart,
    handleStageTouchMove,
    handleStageTouchEnd,
    handleStageTouchCancel,
  } = useEnhanceGestures({
    pageScopeKey,
    pageCount: pages.length,
    safeIndex,
    isRedacting,
    onChangePage: setCurrentPageIndex,
    onHaptic: triggerHaptic,
  });

  const prevScopeRef = useRef(pageScopeKey);
  useEffect(() => {
    if (prevScopeRef.current === pageScopeKey) return;
    prevScopeRef.current = pageScopeKey;
    redactionPointsRef.current = [];
    redactionLiveStrRef.current = '';
    redactionSvgRectRef.current = null;
  }, [pageScopeKey]);

  useEffect(() => {
    return () => {
      if (fullResPreviewUrl && fullResPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(fullResPreviewUrl);
    };
  }, [fullResPreviewUrl]);

  useEffect(() => () => {
    terminateOcrWorker().then(undefined, (err: unknown) => {
      console.debug('[EnhanceView] OCR worker terminate skipped:', err);
    });
  }, []);

  useEffect(() => {
    let active = true;
    if (!currentPage) return;
    loadPageCanvasFromDisk(currentPage.id)
      .then(async (canvas) => {
        if (!active) return;
        const finalCanvas = curvature > 0 ? await dewarpBookCurvatureAsync(canvas, curvature, spinePos) : canvas;
        if (!active) return;
        setPreviewState({ key: pageScopeKey, url: finalCanvas.toDataURL('image/jpeg', 0.9) });
      })
      .catch(() => {
        if (active) {
          setPreviewState({ key: pageScopeKey, url: currentPage.thumbnailDataUrl });
        }
      });
    return () => { active = false; };
  }, [currentPage, curvature, spinePos, pageScopeKey]);

  const actions = useEnhanceExportAndActions({
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
    lang,
    triggerHaptic,
  });

  if (!currentPage) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center p-6 text-center">
        <p className="text-gray-400 text-sm">No scanned pages available</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-[#07090e] flex flex-col justify-between overflow-hidden select-none">
      <EnhanceHeaderBar
        lang={lang}
        onBackToCamera={onBackToCamera}
        setShowCancelModal={setShowCancelModal}
        isEditingTitle={isEditingTitle}
        setIsEditingTitle={setIsEditingTitle}
        docTitle={docTitle}
        setDocTitle={setDocTitle}
        safeIndex={safeIndex}
        pageCount={pages.length}
        setShowDeletePageModal={setShowDeletePageModal}
        isRedacting={isRedacting}
        setIsRedacting={(enabled) => {
          if (enabled) {
            setCurvature(0);
            resetZoomAndPan();
          }
          setIsRedacting(enabled);
        }}
        redactionStrokes={redactionStrokes}
        setRedactionStrokes={setRedactionStrokes}
        handleBurnRedaction={actions.handleBurnRedaction}
        isGridView={isGridView}
        setIsGridView={setIsGridView}
        triggerHaptic={triggerHaptic}
      />

      <EnhanceStageAndGrid
        lang={lang}
        isGridView={isGridView}
        setIsGridView={setIsGridView}
        pages={pages}
        safeIndex={safeIndex}
        setCurrentPageIndex={setCurrentPageIndex}
        selectedPages={selectedPages}
        handleBulkDelete={actions.handleBulkDelete}
        handleTogglePageSelect={actions.handleTogglePageSelect}
        onMovePage={onMovePage}
        handleStageTouchStart={handleStageTouchStart}
        handleStageTouchMove={handleStageTouchMove}
        handleStageTouchEnd={handleStageTouchEnd}
        handleStageTouchCancel={handleStageTouchCancel}
        toastMsg={toastMsg}
        zoomScale={zoomScale}
        resetZoomAndPan={resetZoomAndPan}
        stageContainerRef={stageContainerRef}
        panOffset={panOffset}
        previewImageRef={previewImageRef}
        previewSource={fullResPreviewUrl || currentPage.thumbnailDataUrl}
        isRedacting={isRedacting}
        redactionPointsRef={redactionPointsRef}
        redactionLiveStrRef={redactionLiveStrRef}
        redactionSvgRectRef={redactionSvgRectRef}
        redactionPolylineRef={redactionPolylineRef}
        redactionStrokes={redactionStrokes}
        redactionDraftInit={redactionDraftInit}
        setRedactionDraftInit={setRedactionDraftInit}
        setRedactionStrokes={setRedactionStrokes}
        currentPage={currentPage}
        signatures={signatures}
        setSignatures={setSignatures}
        pdfGenerating={pdfGenerating}
        ocrStatus={ocrStatus}
        triggerHaptic={triggerHaptic}
      />

      {!isGridView && (
        <EnhanceBottomDock
          lang={lang}
          safeIndex={safeIndex}
          pages={pages}
          activeFilter={activeFilter}
          isExtractingText={isExtractingText}
          pdfGenerating={pdfGenerating || isRedacting}
          onEditCrop={onEditCrop}
          onRotateCurrentPage={actions.handleRotateCurrentPage}
          onExtractTextFromPage={actions.handleExtractTextFromPage}
          onRetakePage={onRetakePage}
          onDuplicatePage={onDuplicatePage}
          onFilterSelect={actions.handleFilterSelect}
          onApplyFilterToAll={actions.handleApplyFilterToAll}
          onSelectPageIndex={setCurrentPageIndex}
          onAddMorePages={onAddMorePages}
          onSavePdf={actions.handleDownloadPdf}
          onOpenMoreActions={() => { triggerHaptic(10); setShowMoreActions(true); }}
        />
      )}

      <EnhanceModals
        lang={lang}
        pages={pages}
        safeIndex={safeIndex}
        currentPage={currentPage}
        showCancelModal={showCancelModal}
        setShowCancelModal={setShowCancelModal}
        showDeletePageModal={showDeletePageModal}
        setShowDeletePageModal={setShowDeletePageModal}
        showMoreActions={showMoreActions}
        setShowMoreActions={setShowMoreActions}
        isSignatureOpen={isSignatureOpen}
        setIsSignatureOpen={setIsSignatureOpen}
        isWatermarkOpen={isWatermarkOpen}
        setIsWatermarkOpen={setIsWatermarkOpen}
        isAdvancedOptionsOpen={isAdvancedOptionsOpen}
        setIsAdvancedOptionsOpen={setIsAdvancedOptionsOpen}
        isOcrModalOpen={isOcrModalOpen}
        setIsOcrModalOpen={setIsOcrModalOpen}
        watermarkText={watermarkText}
        setWatermarkText={setWatermarkText}
        watermarkStyle={watermarkStyle}
        setWatermarkStyle={setWatermarkStyle}
        compressionPreset={compressionPreset}
        setCompressionPreset={setCompressionPreset}
        pageFormat={pageFormat}
        setPageFormat={setPageFormat}
        enableOcr={enableOcr}
        setEnableOcr={setEnableOcr}
        curvature={curvature}
        setCurvature={setCurvature}
        spinePos={spinePos}
        setSpinePos={setSpinePos}
        suggestedDocTitle={suggestedDocTitle}
        extractedText={extractedText}
        setDocTitle={setDocTitle}
        setToastMsg={setToastMsg}
        setCurrentPageIndex={setCurrentPageIndex}
        setSignatures={setSignatures}
        onDeletePage={onDeletePage}
        onResetAll={onResetAll}
        onDownloadJpg={actions.handleDownloadJpg}
        onSharePdf={actions.handleSharePdf}
        onOpenInReader={actions.handleOpenInOtium}
        onPrintPdf={actions.handlePrintPdf}
        triggerHaptic={triggerHaptic}
      />
    </div>
  );
};
