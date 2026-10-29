import React, { useEffect, useState, useRef } from 'react';
import type { FilterType, ScannedPage } from '../core/types';
import { createPdfFromCanvases } from '../core/pdf';
import type {
  PdfCompressionPreset,
  PdfPageFormat,
  PdfPageInput,
  PdfWatermarkStyle,
} from '../core/pdf';
import { loadPageCanvasFromDisk, updateStoredPageFilter, storePageToDisk } from '../core/storage/pageStore';
import { saveDocumentToLibrary } from '../core/storage/documentLibrary';
import { dewarpBookCurvature } from '../core/geometry';
import { performOcr, terminateOcrWorker } from '../core/ocr/ocrEngine';
import { detectBarcodesFromCanvas } from '../core/barcode';
import type { DetectedBarcode } from '../core/barcode';
import { isSafeUrl, nativeSharePdf, nativeSavePdf, nativeOpenInOtium, nativeSaveImage, nativePrintPdf } from '../core/nativeBridge';
import { SignatureModal } from './SignatureModal';
import { OtiumLogo } from './OtiumLogo';
import {
  X,
  ArrowLeft,
  Share2,
  Sparkles,
  Download,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Camera,
  Crop,
  Edit3,
  PenTool,
  CheckCircle2,
  LayoutGrid,
  Stamp,
  Image as ImageIcon,
  CheckSquare,
  Square,
  QrCode,
  Copy,
  ExternalLink,
  EyeOff,
  Undo2,
  Palette,
  CopyCheck,
  SlidersHorizontal,
  Send,
  Printer,
  MoreHorizontal,
} from 'lucide-react';

interface EnhanceViewProps {
  pages: ScannedPage[];
  onBackToCamera: () => void;
  onAddMorePages: () => void;
  onDeletePage: (index: number) => void;
  onMovePage: (fromIndex: number, toIndex: number) => void;
  onRetakePage: (index: number) => void;
  onRotatePage: (index: number) => Promise<void>;
  onEditCrop?: (index: number) => void;
  onDuplicatePage?: (index: number) => void;
  onResetAll: () => void;
  onOpenPdfInReader?: (file: File) => void;
}

export const EnhanceView: React.FC<EnhanceViewProps> = ({
  pages,
  onBackToCamera,
  onAddMorePages,
  onDeletePage,
  onMovePage,
  onRetakePage,
  onRotatePage,
  onEditCrop,
  onDuplicatePage,
  onResetAll,
  onOpenPdfInReader,
}) => {
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [showDeletePageModal, setShowDeletePageModal] = useState<boolean>(false);
  const [showMoreActions, setShowMoreActions] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>('magic');
  const [curvature, setCurvature] = useState<number>(0);
  const [spinePos, setSpinePos] = useState<number>(0.5);
  const [enableOcr, setEnableOcr] = useState<boolean>(false);
  const [compressionPreset, setCompressionPreset] = useState<PdfCompressionPreset>('balanced');
  const [pageFormat, setPageFormat] = useState<PdfPageFormat>('a4');
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const [signatures, setSignatures] = useState<Record<number, { dataUrl: string; x: number; y: number }>>({});
  const [isGridView, setIsGridView] = useState(false);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [watermarkText, setWatermarkText] = useState<string>('');
  const [watermarkStyle, setWatermarkStyle] = useState<PdfWatermarkStyle>('diagonal');
  const [isWatermarkOpen, setIsWatermarkOpen] = useState(false);
  const [isAdvancedOptionsOpen, setIsAdvancedOptionsOpen] = useState(false);
  const [isRedacting, setIsRedacting] = useState<boolean>(false);
  const [redactionStrokes, setRedactionStrokes] = useState<{ x: number; y: number }[][]>([]);
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[]>([]);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const [toastMsg, setToastMsg] = useState<string>('');
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string>('');
  const [fullResPreviewUrl, setFullResPreviewUrl] = useState<string>('');
  const [detectedBarcodes, setDetectedBarcodes] = useState<DetectedBarcode[]>([]);
  const [docTitle, setDocTitle] = useState<string>(() => {
    const d = new Date();
    const dateStr = d.toISOString().slice(0, 10);
    const timeStr = d.toTimeString().slice(0, 5).replace(':', '-');
    return `Otium_Doc_${dateStr}_${timeStr}`;
  });
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  // 120Hz Gestures & Touch State
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [swipeTranslateX, setSwipeTranslateX] = useState<number>(0);
  const [isSwiping, setIsSwiping] = useState<boolean>(false);

  const lastTapTimeRef = useRef<number>(0);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchDistanceStartRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(1);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);

  const safeIndex = Math.min(currentPageIndex, Math.max(0, pages.length - 1));
  const currentPage = pages[safeIndex];

  // Auto-reset zoom and pan when changing page
  useEffect(() => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setSwipeTranslateX(0);
    setIsSwiping(false);
  }, [safeIndex]);

  // Cleanup preview object URLs on change or unmount
  useEffect(() => {
    return () => {
      if (fullResPreviewUrl && fullResPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(fullResPreviewUrl);
      }
    };
  }, [fullResPreviewUrl]);

  // Terminate OCR WebAssembly worker when unmounting review to reclaim RAM
  useEffect(() => {
    return () => {
      terminateOcrWorker().catch(() => {});
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!currentPage) return;

    // Instant 0ms thumbnail display for butter-smooth swiping
    setFullResPreviewUrl(currentPage.thumbnailDataUrl);

    loadPageCanvasFromDisk(currentPage.id)
      .then((canvas) => {
        if (!active) return;
        const finalCanvas = curvature > 0 ? dewarpBookCurvature(canvas, curvature, spinePos) : canvas;
        setFullResPreviewUrl(finalCanvas.toDataURL('image/jpeg', 0.9));

        // Background Barcode & QR Code Intelligence
        detectBarcodesFromCanvas(finalCanvas).then((codes) => {
          if (active) setDetectedBarcodes(codes);
        });
      })
      .catch(() => {
        if (active) {
          setFullResPreviewUrl(currentPage.thumbnailDataUrl);
          setDetectedBarcodes([]);
        }
      });

    return () => {
      active = false;
    };
  }, [currentPage?.id, currentPage?.thumbnailDataUrl, curvature, spinePos]);

  const triggerHaptic = (duration = 15) => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(duration);
      } catch {}
    }
  };

  const handleStageTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isRedacting) return;

    if (e.touches.length === 2) {
      // Pinch-to-zoom start
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchDistanceStartRef.current = dist;
      initialZoomRef.current = zoomScale;
      return;
    }

    if (e.touches.length === 1) {
      const now = Date.now();
      const touch = e.touches[0];

      // Double-tap to zoom toggle (1x <-> 2.5x)
      if (now - lastTapTimeRef.current < 280) {
        lastTapTimeRef.current = 0;
        triggerHaptic(15);
        if (zoomScale > 1.05) {
          setZoomScale(1);
          setPanOffset({ x: 0, y: 0 });
        } else {
          setZoomScale(2.5);
        }
        return;
      }
      lastTapTimeRef.current = now;

      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: now };
      panStartRef.current = { ...panOffset };
    }
  };

  const handleStageTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isRedacting) return;

    if (e.touches.length === 2 && touchDistanceStartRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scaleFactor = dist / touchDistanceStartRef.current;
      const newScale = Math.min(4.0, Math.max(1.0, initialZoomRef.current * scaleFactor));
      setZoomScale(newScale);
      if (newScale === 1.0) {
        setPanOffset({ x: 0, y: 0 });
      }
      return;
    }

    if (e.touches.length === 1 && touchStartRef.current) {
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;

      if (zoomScale > 1.05) {
        // Pan image when zoomed in
        if (panStartRef.current) {
          const maxPanX = (zoomScale - 1) * 160;
          const maxPanY = (zoomScale - 1) * 220;
          const nextX = Math.min(maxPanX, Math.max(-maxPanX, panStartRef.current.x + dx));
          const nextY = Math.min(maxPanY, Math.max(-maxPanY, panStartRef.current.y + dy));
          setPanOffset({ x: nextX, y: nextY });
        }
      } else if (pages.length > 1) {
        // Butter-smooth horizontal swipe between pages
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
          setIsSwiping(true);
          const isAtBoundary = (safeIndex === 0 && dx > 0) || (safeIndex === pages.length - 1 && dx < 0);
          setSwipeTranslateX(isAtBoundary ? dx * 0.3 : dx);
        }
      }
    }
  };

  const handleStageTouchEnd = () => {
    if (isRedacting) return;
    touchDistanceStartRef.current = null;

    if (isSwiping && touchStartRef.current) {
      const dt = Date.now() - touchStartRef.current.time;
      const velocity = Math.abs(swipeTranslateX) / Math.max(1, dt);

      if (Math.abs(swipeTranslateX) > 60 || velocity > 0.4) {
        if (swipeTranslateX < 0 && safeIndex < pages.length - 1) {
          triggerHaptic(20);
          setCurrentPageIndex(safeIndex + 1);
        } else if (swipeTranslateX > 0 && safeIndex > 0) {
          triggerHaptic(20);
          setCurrentPageIndex(safeIndex - 1);
        }
      }
      setSwipeTranslateX(0);
      setIsSwiping(false);
    }
    touchStartRef.current = null;
  };

  const handleFilterSelect = async (newFilter: FilterType) => {
    triggerHaptic(10);
    setActiveFilter(newFilter);
    try {
      await updateStoredPageFilter(currentPage.id, newFilter);
      const canvas = await loadPageCanvasFromDisk(currentPage.id);
      const finalCanvas = curvature > 0 ? dewarpBookCurvature(canvas, curvature, spinePos) : canvas;
      setFullResPreviewUrl(finalCanvas.toDataURL('image/jpeg', 0.9));
    } catch (e) {
      console.warn('Filter update failed:', e);
    }
  };

  const handleApplyFilterToAll = async () => {
    triggerHaptic(15);
    setToastMsg(`Applying ${activeFilter} to all pages...`);
    for (const p of pages) {
      await updateStoredPageFilter(p.id, activeFilter);
    }
    const canvas = await loadPageCanvasFromDisk(currentPage.id);
    const finalCanvas = curvature > 0 ? dewarpBookCurvature(canvas, curvature, spinePos) : canvas;
    setFullResPreviewUrl(finalCanvas.toDataURL('image/jpeg', 0.9));
    setToastMsg(`Applied ${activeFilter} to all pages`);
    setTimeout(() => setToastMsg(''), 2200);
  };

  const handleTogglePageSelect = (idx: number) => {
    triggerHaptic(10);
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleBulkDelete = () => {
    if (selectedPages.size === 0) return;
    triggerHaptic(20);
    const indices = Array.from(selectedPages).sort((a, b) => b - a);
    indices.forEach((idx) => onDeletePage(idx));
    setSelectedPages(new Set());
    setToastMsg(`Deleted ${indices.length} pages`);
    setTimeout(() => setToastMsg(''), 2200);
  };

  const handleDownloadJpg = async () => {
    triggerHaptic(20);
    try {
      const rawCanvas = await loadPageCanvasFromDisk(currentPage.id);
      const processed = curvature > 0 ? dewarpBookCurvature(rawCanvas, curvature, spinePos) : rawCanvas;
      const filename = `${docTitle.trim() || 'Otium_Scan'}_Page_${safeIndex + 1}.jpg`;
      const blob = await new Promise<Blob | null>((res) => processed.toBlob(res, 'image/jpeg', 0.92));
      if (!blob) return;

      await nativeSaveImage(blob, filename);
      setToastMsg(`✓ تم حفظ صفحة ${safeIndex + 1} في الصور`);
      setTimeout(() => setToastMsg(''), 2200);
    } catch (e) {
      console.warn('JPG export failed:', e);
    }
  };

  const handleBurnRedaction = async () => {
    if (redactionStrokes.length === 0) {
      setIsRedacting(false);
      return;
    }
    triggerHaptic(20);
    try {
      const rawCanvas = await loadPageCanvasFromDisk(currentPage.id);
      const ctx = rawCanvas.getContext('2d');
      if (ctx && previewImageRef.current) {
        const rect = previewImageRef.current.getBoundingClientRect();
        const scaleX = rawCanvas.width / rect.width;
        const scaleY = rawCanvas.height / rect.height;

        ctx.strokeStyle = '#000000';
        ctx.fillStyle = '#000000';
        ctx.lineWidth = 18 * scaleX;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (const stroke of redactionStrokes) {
          if (stroke.length === 0) continue;
          ctx.beginPath();
          ctx.moveTo(stroke[0].x * scaleX, stroke[0].y * scaleY);
          for (let i = 1; i < stroke.length; i++) {
            ctx.lineTo(stroke[i].x * scaleX, stroke[i].y * scaleY);
          }
          ctx.stroke();
        }

        // Overwrite disk page storage with permanently redacted pixels
        await storePageToDisk(
          currentPage.id,
          currentPage.thumbnailDataUrl,
          rawCanvas,
          rawCanvas,
          currentPage.filter
        );

        setFullResPreviewUrl(rawCanvas.toDataURL('image/jpeg', 0.9));
        setRedactionStrokes([]);
        setIsRedacting(false);
        setToastMsg('Confidential info permanently censored');
        setTimeout(() => setToastMsg(''), 2200);
      }
    } catch (e) {
      console.warn('Redaction burn failed:', e);
    }
  };

  const generateCompiledPdf = async (presetOverride?: PdfCompressionPreset): Promise<Blob> => {
    const pageInputs: PdfPageInput[] = [];

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const rawCanvas = await loadPageCanvasFromDisk(page.id);
      const processed = curvature > 0 ? dewarpBookCurvature(rawCanvas, curvature, spinePos) : rawCanvas;

      // Overlay digital signature if present for this page
      const sig = signatures[i];
      if (sig) {
        const sigImg = new Image();
        sigImg.src = sig.dataUrl;
        await new Promise((res) => {
          sigImg.onload = res;
          sigImg.onerror = res;
        });
        const ctx = processed.getContext('2d');
        if (ctx) {
          const sigW = Math.round(processed.width * 0.32);
          const sigH = Math.round((sigImg.naturalHeight / sigImg.naturalWidth) * sigW);
          const posX = Math.round(sig.x * processed.width);
          const posY = Math.round(sig.y * processed.height);
          ctx.drawImage(sigImg, posX, posY, sigW, sigH);
        }
      }

      let words: import('../core/pdf').OcrWordToken[] = [];
      if (enableOcr) {
        setOcrStatus(`OCR scanning page ${i + 1} of ${pages.length}...`);
        words = await performOcr(processed, 'ara+eng');
      }

      pageInputs.push({
        canvas: processed,
        words,
      });
    }

    setOcrStatus('');
    return await createPdfFromCanvases(
      pageInputs,
      presetOverride || compressionPreset,
      pageFormat,
      watermarkText,
      watermarkStyle
    );
  };

  const handleRotateCurrentPage = async () => {
    triggerHaptic(20);
    try {
      await onRotatePage(safeIndex);
      const canvas = await loadPageCanvasFromDisk(currentPage.id);
      const finalCanvas = curvature > 0 ? dewarpBookCurvature(canvas, curvature, spinePos) : canvas;
      setFullResPreviewUrl(finalCanvas.toDataURL('image/jpeg', 0.9));
    } catch (e) {
      console.warn('Rotation failed:', e);
    }
  };

  const persistToLibrary = async (pdfBlob: Blob) => {
    try {
      await saveDocumentToLibrary({
        id: `doc_${Date.now()}`,
        title: docTitle.trim() || `Scan — ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        pageCount: pages.length,
        thumbnail: pages[0].thumbnailDataUrl,
        pdfBlob,
      });
    } catch (e) {
      console.warn('Could not cache document to library:', e);
    }
  };

  const handleSharePdf = async () => {
    triggerHaptic(20);
    setPdfGenerating(true);
    try {
      const pdfBlob = await generateCompiledPdf();
      await persistToLibrary(pdfBlob);
      const filename = `${docTitle.trim() || 'Otium_Scan'}.pdf`;
      await nativeSharePdf(pdfBlob, filename, docTitle.trim() || 'Otium Document');
    } catch (e) {
      console.warn('Share PDF failed:', e);
    } finally {
      setPdfGenerating(false);
      setOcrStatus('');
    }
  };

  const handleShareWhatsApp = async () => {
    triggerHaptic(20);
    setPdfGenerating(true);
    setToastMsg('⏳ جاري تجهيز نسخة خفيفة للمشاركة...');
    try {
      // Force 'compact' compression for ultra-fast WhatsApp/messaging transfer (< 1.5MB)
      const pdfBlob = await generateCompiledPdf('compact');
      await persistToLibrary(pdfBlob);
      const filename = `${docTitle.trim() || 'Otium_Scan'}_fast.pdf`;
      await nativeSharePdf(pdfBlob, filename, docTitle.trim() || 'Otium Document');
      setToastMsg('✓ تم فتح شاشة المشاركة');
    } catch (e) {
      console.warn('WhatsApp Quick Share failed:', e);
      setToastMsg('تعذر إتمام المشاركة السريعة');
    } finally {
      setPdfGenerating(false);
      setOcrStatus('');
      setTimeout(() => setToastMsg(''), 2200);
    }
  };

  const handleDownloadPdf = async () => {
    triggerHaptic(20);
    setPdfGenerating(true);
    try {
      const pdfBlob = await generateCompiledPdf();
      await persistToLibrary(pdfBlob);
      const filename = `${docTitle.trim() || 'Otium_Scan'}.pdf`;
      await nativeSavePdf(pdfBlob, filename);
      setToastMsg('✓ تم حفظ ملف الـ PDF');
      setTimeout(() => setToastMsg(''), 2500);
    } catch (e) {
      console.warn('Download PDF failed:', e);
    } finally {
      setPdfGenerating(false);
      setOcrStatus('');
    }
  };

  const handleOpenInOtium = async () => {
    triggerHaptic(25);
    setPdfGenerating(true);
    try {
      const pdfBlob = await generateCompiledPdf();
      await persistToLibrary(pdfBlob);
      const filename = `${docTitle.trim() || 'Otium_Scan'}.pdf`;
      if (onOpenPdfInReader) {
        const file = new File([pdfBlob], filename, { type: 'application/pdf' });
        onOpenPdfInReader(file);
        return;
      }
      await nativeOpenInOtium(pdfBlob, filename);
    } catch (e) {
      console.warn('Open in Otium Reader failed:', e);
    } finally {
      setPdfGenerating(false);
      setOcrStatus('');
    }
  };

  const handlePrintPdf = async () => {
    triggerHaptic(20);
    setPdfGenerating(true);
    try {
      const pdfBlob = await generateCompiledPdf();
      await persistToLibrary(pdfBlob);
      const filename = `${docTitle.trim() || 'Otium_Scan'}.pdf`;
      await nativePrintPdf(pdfBlob, filename);
    } catch (e) {
      console.warn('Print PDF failed:', e);
    } finally {
      setPdfGenerating(false);
      setOcrStatus('');
    }
  };

  if (!currentPage) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center p-6 text-center">
        <p className="text-gray-400 text-sm">No scanned pages available</p>
      </div>
    );
  }

  const previewSource = fullResPreviewUrl || currentPage.thumbnailDataUrl;

  return (
    <div className="relative w-full h-full bg-[#07090e] flex flex-col justify-between overflow-hidden select-none">
      {/* Top Bar with Safe Area Inset */}
      <div
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px) + 10px, 48px)',
        }}
        className="relative z-20 flex items-center justify-between px-3 pb-3 otium-chrome border-b border-white/[0.08]"
      >
        {/* Left: Back & Cancel All */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onBackToCamera}
            className="p-2 rounded-full glass-button text-gray-300 active:text-white"
            title="رجوع للكاميرا"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowCancelModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 active:scale-95 transition-all text-[11px] font-bold"
            title="إلغاء كافة الصور والعودة للرئيسية"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="font-arabic">إلغاء الكل</span>
          </button>
        </div>

        {/* Center: Title & Page Count */}
        <div className="flex flex-col items-center max-w-[40%]">
          {isEditingTitle ? (
            <input
              type="text"
              value={docTitle}
              autoFocus
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setIsEditingTitle(false);
              }}
              onChange={(e) => setDocTitle(e.target.value)}
              className="text-xs bg-white/10 text-white px-2 py-0.5 rounded-lg border border-accent focus:outline-none text-center max-w-full font-bold"
            />
          ) : (
            <button
              onClick={() => setIsEditingTitle(true)}
              className="flex items-center gap-1 text-xs sm:text-sm font-bold tracking-wide text-white truncate max-w-full hover:text-accent"
              title="تعديل اسم المستند"
            >
              <span className="truncate">{docTitle}</span>
              <Edit3 className="w-3 h-3 text-accent opacity-80 shrink-0" />
            </button>
          )}
          <span className="text-[10px] text-accent font-bold tracking-wider mt-0.5">
            صفحة {safeIndex + 1} من {pages.length}
          </span>
        </div>

        {/* Right: Quick Tools */}
        <div className="flex items-center gap-1">
          {/* Delete Current Page */}
          <button
            onClick={() => setShowDeletePageModal(true)}
            className="p-1.5 rounded-full glass-button text-gray-300 hover:text-rose-400 active:scale-95 transition-colors"
            title="حذف هذه الصفحة"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
          </button>

          {/* Privacy Redaction */}
          <button
            onClick={() => {
              triggerHaptic(15);
              setIsRedacting(!isRedacting);
            }}
            className={`p-1.5 rounded-full glass-button transition-colors ${
              isRedacting ? 'text-accent border-accent/50 bg-accent/20' : 'text-gray-300 active:text-accent'
            }`}
            title="حجب نصوص حساسة"
          >
            <EyeOff className="w-4 h-4" />
          </button>

          {/* Grid Overview Toggle */}
          <button
            onClick={() => {
              triggerHaptic(15);
              setIsGridView(!isGridView);
            }}
            className={`p-1.5 rounded-full glass-button transition-colors ${
              isGridView ? 'text-accent border-accent/50 bg-accent/10' : 'text-gray-300 active:text-accent'
            }`}
            title="عرض شبكي"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>

          {/* Security Watermark */}
          <button
            onClick={() => {
              triggerHaptic(15);
              setIsWatermarkOpen(true);
            }}
            className={`p-1.5 rounded-full glass-button transition-colors ${
              watermarkText ? 'text-accent border-accent/50 bg-accent/10' : 'text-gray-300 active:text-accent'
            }`}
            title="علامة مائية"
          >
            <Stamp className="w-4 h-4" />
          </button>

          {/* Sign Document */}
          <button
            onClick={() => {
              triggerHaptic(15);
              setIsSignatureOpen(true);
            }}
            className={`p-1.5 rounded-full glass-button transition-colors ${
              signatures[safeIndex] ? 'text-accent border-accent/50' : 'text-gray-300 active:text-accent'
            }`}
            title="إضافة توقيع"
          >
            <PenTool className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Active Redaction Control Bar */}
      {isRedacting && (
        <div className="relative z-30 px-6 py-2.5 bg-black/95 border-b border-accent/30 flex items-center justify-between text-xs animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-accent font-semibold">
            <EyeOff className="w-4 h-4 shrink-0" />
            <span className="truncate">Drag finger over text to censor</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                triggerHaptic(10);
                setRedactionStrokes((prev) => prev.slice(0, -1));
              }}
              disabled={redactionStrokes.length === 0}
              className="p-1.5 rounded-lg glass-button text-gray-300 disabled:opacity-30 hover:text-white"
              title="Undo last stroke"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                triggerHaptic(10);
                setIsRedacting(false);
                setRedactionStrokes([]);
              }}
              className="px-3 py-1 rounded-lg text-gray-400 hover:text-white text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleBurnRedaction}
              className="px-3.5 py-1 rounded-lg bg-accent text-on-accent font-bold text-xs shadow-lg shadow-accent/25 active:scale-95"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {/* Main Stage: Carousel View or Grid Overview Sheet */}
      {isGridView ? (
        <div className="relative flex-1 w-full h-full flex flex-col p-4 overflow-y-auto">
          {/* Grid Toolbar */}
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-xs text-gray-400 font-semibold">
              {pages.length} Pages • {selectedPages.size} Selected
            </span>

            <div className="flex items-center gap-2">
              {selectedPages.size > 0 && (
                <button
                  onClick={handleBulkDelete}
                  className="px-3 py-1.5 rounded-xl bg-red-500/20 text-red-400 font-semibold text-xs border border-red-500/30 flex items-center gap-1 active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete ({selectedPages.size})</span>
                </button>
              )}

              <button
                onClick={() => setIsGridView(false)}
                className="px-3.5 py-1.5 rounded-xl bg-accent text-on-accent font-bold text-xs shadow-lg shadow-accent/25 active:scale-95"
              >
                Done
              </button>
            </div>
          </div>

          {/* 3-Column Page Card Grid */}
          <div className="grid grid-cols-3 gap-3 pb-8">
            {pages.map((p, idx) => {
              const isSelected = selectedPages.has(idx);
              const isCurrent = idx === safeIndex;
              return (
                <div
                  key={p.id}
                  onClick={() => {
                    setCurrentPageIndex(idx);
                    setIsGridView(false);
                  }}
                  className={`relative rounded-xl overflow-hidden border-2 bg-black/40 flex flex-col group cursor-pointer transition-all ${
                    isSelected
                      ? 'border-accent ring-2 ring-accent/40 shadow-lg'
                      : isCurrent
                      ? 'border-accent/70'
                      : 'border-white/10 hover:border-white/30'
                  }`}
                >
                  <div className="aspect-[3/4] w-full relative">
                    <img src={p.thumbnailDataUrl} alt="" className="w-full h-full object-cover" />
                    {/* Multi-select Checkbox */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePageSelect(idx);
                      }}
                      className="absolute top-1.5 left-1.5 p-1 rounded-md bg-black/70 text-white shadow"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-accent" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                    {/* Page badge */}
                    <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] text-white font-bold">
                      #{idx + 1}
                    </span>
                  </div>

                  {/* Reorder actions */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center justify-between p-1 bg-white/5 border-t border-white/5"
                  >
                    <button
                      disabled={idx === 0}
                      onClick={() => onMovePage(idx, idx - 1)}
                      className="px-2 py-0.5 text-[10px] text-gray-300 disabled:opacity-20 hover:text-white"
                    >
                      ◀
                    </button>
                    <span className="text-[9px] text-gray-500 font-semibold">Move</span>
                    <button
                      disabled={idx === pages.length - 1}
                      onClick={() => onMovePage(idx, idx + 1)}
                      className="px-2 py-0.5 text-[10px] text-gray-300 disabled:opacity-20 hover:text-white"
                    >
                      ▶
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          onTouchStart={handleStageTouchStart}
          onTouchMove={handleStageTouchMove}
          onTouchEnd={handleStageTouchEnd}
          className="relative flex-1 w-full h-full flex items-center justify-center p-4 overflow-hidden touch-none"
        >
          {toastMsg && (
            <div className="absolute top-4 inset-x-0 flex justify-center z-40 pointer-events-none animate-in fade-in duration-200">
              <span className="px-4 py-1.5 rounded-full bg-accent text-on-accent font-semibold text-xs shadow-2xl flex items-center gap-1.5 border border-white/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{toastMsg}</span>
              </span>
            </div>
          )}

          {/* Zoom Level Indicator & Reset Pill */}
          {zoomScale > 1.05 && (
            <div className="absolute top-2 inset-x-0 flex justify-center z-40 pointer-events-auto animate-in fade-in duration-150">
              <button
                onClick={() => {
                  triggerHaptic(10);
                  setZoomScale(1);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="px-3.5 py-1 rounded-full bg-black/85 backdrop-blur-md border border-accent/50 text-accent text-xs font-bold shadow-2xl flex items-center gap-1.5 active:scale-95 transition-transform"
              >
                <span>{Math.round(zoomScale * 100)}%</span>
                <span className="text-[10px] text-gray-300 font-arabic font-normal">• انقر للعودة إلى 1x</span>
              </button>
            </div>
          )}

          {/* Smart Barcode / QR Code Intelligence Badge */}
          {detectedBarcodes.length > 0 && zoomScale <= 1.05 && (
            <div className="absolute top-2 inset-x-6 z-30 flex items-center justify-between px-3.5 py-2 rounded-2xl bg-black/85 backdrop-blur-xl border border-accent/40 shadow-2xl animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-2 overflow-hidden">
                <QrCode className="w-4 h-4 text-accent shrink-0" />
                <div className="flex flex-col overflow-hidden text-left">
                  <span className="text-[10px] text-accent font-bold uppercase tracking-wider">
                    {detectedBarcodes[0].format.replace('_', ' ')} Detected
                  </span>
                  <span className="text-xs text-white truncate max-w-[180px] font-mono">
                    {detectedBarcodes[0].rawValue}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => {
                    triggerHaptic(15);
                    navigator.clipboard?.writeText(detectedBarcodes[0].rawValue);
                    setToastMsg('Code copied to clipboard');
                    setTimeout(() => setToastMsg(''), 2000);
                  }}
                  className="p-1.5 rounded-lg glass-button text-gray-300 hover:text-white"
                  title="Copy code"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                {isSafeUrl(detectedBarcodes[0].rawValue) && (
                  <a
                    href={detectedBarcodes[0].rawValue}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg glass-button text-accent hover:text-white"
                    title="Open link"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Full-Frame Unobstructed Document Preview Stage */}
          <div
            style={{
              transform: `translateX(${swipeTranslateX}px) translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
              transition: isSwiping || zoomScale > 1.05 ? 'none' : 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            className="relative w-full h-full max-h-[64vh] flex items-center justify-center select-none will-change-transform"
          >
            <img
              ref={previewImageRef}
              src={previewSource}
              alt={`Page ${safeIndex + 1}`}
              className="max-w-full max-h-full object-contain rounded-xl shadow-2xl border border-white/10 pointer-events-none"
            />

            {/* Interactive Redaction Drawing Layer */}
            {isRedacting && (
              <svg
                onPointerDown={(e) => {
                  e.preventDefault();
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                  setCurrentStroke([pt]);
                }}
                onPointerMove={(e) => {
                  if (currentStroke.length === 0) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                  setCurrentStroke((prev) => [...prev, pt]);
                }}
                onPointerUp={() => {
                  if (currentStroke.length > 0) {
                    setRedactionStrokes((prev) => [...prev, currentStroke]);
                    setCurrentStroke([]);
                  }
                }}
                className="absolute inset-0 w-full h-full z-30 touch-none cursor-crosshair bg-black/5"
              >
                {redactionStrokes.map((stroke, i) => (
                  <polyline
                    key={i}
                    points={stroke.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke="#000000"
                    strokeWidth="18"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {currentStroke.length > 0 && (
                  <polyline
                    points={currentStroke.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke="#000000"
                    strokeWidth="18"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </svg>
            )}

            {!isRedacting && redactionStrokes.length > 0 && (
              <svg className="absolute inset-0 w-full h-full z-20 pointer-events-none">
                {redactionStrokes.map((stroke, i) => (
                  <polyline
                    key={i}
                    points={stroke.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke="#000000"
                    strokeWidth="18"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </svg>
            )}

            {/* Attached Digital Signature */}
            {signatures[safeIndex] && (
              <div
                style={{
                  left: `${signatures[safeIndex].x * 100}%`,
                  top: `${signatures[safeIndex].y * 100}%`,
                }}
                className="absolute z-20 w-32 -translate-x-1/2 -translate-y-1/2 p-1.5 border-2 border-dashed border-accent bg-accent/10 rounded-xl shadow-2xl flex items-center justify-center group"
              >
                <img
                  src={signatures[safeIndex].dataUrl}
                  alt="Signature"
                  className="w-full h-auto object-contain pointer-events-none"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerHaptic(10);
                    setSignatures((prev) => {
                      const next = { ...prev };
                      delete next[safeIndex];
                      return next;
                    });
                  }}
                  className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold shadow-md active:scale-90"
                  title="Remove signature"
                >
                  ✕
                </button>
              </div>
            )}

            {pdfGenerating && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-30">
                <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-sm font-semibold text-white">
                  {ocrStatus || 'Compiling Optimized PDF...'}
                </p>
              </div>
            )}
          </div>

          {safeIndex > 0 && (
            <button
              onClick={() => {
                triggerHaptic(10);
                setCurrentPageIndex(safeIndex - 1);
              }}
              className="absolute left-3 p-2.5 rounded-full glass-button text-white active:scale-90 shadow-xl z-20"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {safeIndex < pages.length - 1 && (
            <button
              onClick={() => {
                triggerHaptic(10);
                setCurrentPageIndex(safeIndex + 1);
              }}
              className="absolute right-3 p-2.5 rounded-full glass-button text-white active:scale-90 shadow-xl z-20"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>
      )}

      {/* Bottom Controls Dock: Clean, Non-overlapping & Screen-fitted */}
      <div className="relative z-20 flex flex-col gap-2 px-3 pt-2 pb-[max(0.75rem,calc(env(safe-area-inset-bottom,0px)+0.5rem))] glass-panel border-t border-white/[0.08] font-arabic shrink-0">
        {/* Row 1: Integrated Page Editing Tools & Filter Strip (Scrollable) */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
          {/* Quick Page Actions */}
          <button
            onClick={() => {
              triggerHaptic(15);
              onEditCrop?.(safeIndex);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-accent/15 text-accent border border-accent/30 text-xs font-bold active:scale-95 shrink-0"
            title="تعديل القص / Crop"
          >
            <Crop className="w-3.5 h-3.5" />
            <span>تعديل القص</span>
          </button>

          <button
            onClick={handleRotateCurrentPage}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl glass-button text-gray-200 text-xs font-semibold active:scale-95 shrink-0"
            title="تدوير 90°"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>تدوير</span>
          </button>

          <button
            onClick={() => {
              triggerHaptic(15);
              onRetakePage(safeIndex);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl glass-button text-gray-200 text-xs font-medium active:scale-95 shrink-0"
            title="إعادة التقاط الصفحة بالكاميرا"
          >
            <Camera className="w-3.5 h-3.5 text-accent" />
            <span>إعادة التقاط</span>
          </button>

          {onDuplicatePage && (
            <button
              onClick={() => {
                triggerHaptic(15);
                onDuplicatePage(safeIndex);
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl glass-button text-gray-200 text-xs font-medium active:scale-95 shrink-0"
              title="مضاعفة هذه الصفحة"
            >
              <CopyCheck className="w-3.5 h-3.5" />
              <span>مضاعفة</span>
            </button>
          )}

          {/* Visual Divider */}
          <div className="h-4 w-px bg-white/20 mx-1 shrink-0" />

          {/* Filter Pills */}
          {(
            [
              { id: 'magic', label: 'ورق ناصع', icon: Sparkles },
              { id: 'vibrant', label: 'ملون فائق', icon: Palette },
              { id: 'bw', label: 'أبيض وأسود' },
              { id: 'grayscale', label: 'رمادي' },
              { id: 'vintage', label: 'أوراق قديمة' },
              { id: 'original', label: 'الأصلي' },
            ] as const
          ).map((item) => {
            const isActive = activeFilter === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleFilterSelect(item.id)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 ${
                  isActive
                    ? 'bg-accent text-on-accent font-semibold shadow-md ring-1 ring-accent/40'
                    : 'glass-button text-gray-300'
                }`}
              >
                {'icon' in item && item.icon && <item.icon className="w-3.5 h-3.5" />}
                <span>{item.label}</span>
              </button>
            );
          })}

          {pages.length > 1 && (
            <button
              onClick={handleApplyFilterToAll}
              className="text-[10px] text-accent font-semibold underline underline-offset-2 ml-1 active:opacity-60 whitespace-nowrap shrink-0"
              title="تطبيق الفلتر على جميع الصفحات"
            >
              تطبيق على الكل
            </button>
          )}
        </div>

        {/* Row 2: Thumbnails Strip (if multi-page) */}
        {pages.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto py-0.5 px-0.5 scrollbar-none">
            {pages.map((p, idx) => (
              <button
                key={p.id}
                onClick={() => {
                  triggerHaptic(10);
                  setCurrentPageIndex(idx);
                }}
                className={`relative flex-shrink-0 w-10 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                  idx === safeIndex
                    ? 'border-accent scale-105 shadow-md ring-2 ring-accent/40'
                    : 'border-white/20 opacity-60'
                }`}
              >
                <img
                  src={p.thumbnailDataUrl}
                  alt={`Thumb ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-[8px] px-1 rounded text-white font-bold">
                  {idx + 1}
                </span>
              </button>
            ))}

            <button
              onClick={() => {
                triggerHaptic(15);
                onAddMorePages();
              }}
              className="flex-shrink-0 w-10 h-14 rounded-lg border-2 border-dashed border-accent/50 flex flex-col items-center justify-center text-accent active:scale-95 glass-button"
              title="مسح صفحة إضافية"
            >
              <Plus className="w-4 h-4 mb-0.5" />
              <span className="text-[8px] font-semibold">إضافة</span>
            </button>
          </div>
        )}

        {/* Row 3: PDF Options & Estimated Size */}
        <div className="flex items-center justify-between px-1 text-xs text-gray-400 gap-2">
          <button
            onClick={() => {
              triggerHaptic(15);
              setIsAdvancedOptionsOpen(true);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-gray-200 text-xs font-semibold active:scale-95 transition-all shadow-sm shrink-0"
            title="خيارات حجم وضغط الـ PDF ومقاس A4 وثنية الكتب"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="whitespace-nowrap">خيارات PDF (A4)</span>
          </button>

          <span className="text-[11px] text-gray-400 flex items-center gap-1 shrink-0">
            <span>الحجم التقريبي:</span>
            <span dir="ltr" className="text-accent font-bold font-mono inline-block">
              {compressionPreset === 'compact'
                ? `${Math.round(pages.length * 35)} KB`
                : compressionPreset === 'balanced'
                ? `${(pages.length * 0.18).toFixed(1)} MB`
                : `${(pages.length * 0.85).toFixed(1)} MB`}
            </span>
          </span>
        </div>

        {/* Row 4: Primary Export & Companion Actions (Screen-fitted, Never overflows) */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <button
            onClick={handleOpenInOtium}
            disabled={pdfGenerating}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-accent hover:opacity-95 text-on-accent font-black text-xs active:scale-95 transition-all shadow-lg shadow-accent/25 disabled:opacity-50 cursor-pointer"
            title="فتح المستند في قارئ أو تيوم مباشرة"
          >
            <OtiumLogo size={16} className="text-current shrink-0" />
            <span className="font-bold text-xs truncate">فتح في القارئ</span>
          </button>

          <button
            onClick={handleSharePdf}
            disabled={pdfGenerating}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl glass-button text-gray-200 hover:text-white font-bold text-xs active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            title="مشاركة وتصدير مستند الـ PDF"
          >
            <Share2 className="w-4 h-4 text-accent shrink-0" />
            <span className="text-xs truncate">مشاركة وتصدير</span>
          </button>

          <button
            onClick={handleDownloadJpg}
            disabled={pdfGenerating}
            className="p-2.5 rounded-xl glass-button text-gray-200 hover:text-white active:scale-95 transition-transform shrink-0 disabled:opacity-50 cursor-pointer"
            title="حفظ الصفحة كصورة JPG"
          >
            <ImageIcon className="w-4 h-4 text-gray-300" />
          </button>

          <button
            onClick={() => setShowMoreActions(true)}
            className="p-2.5 rounded-xl glass-button text-gray-200 active:scale-95 transition-transform shrink-0"
            title="المزيد من الخيارات (طباعة، واتساب، تنزيل)"
          >
            <MoreHorizontal className="w-4 h-4 text-gray-300" />
          </button>
        </div>
      </div>

      {/* Modal: Confirm Cancel All / Discard Entire Session */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#12151d] border border-white/10 rounded-3xl p-5 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white font-arabic">حذف كافة الصور والعودة للرئيسية؟</h3>
              <p className="text-xs text-gray-400 leading-relaxed font-arabic">
                سيتم إلغاء جلسة المسح الحالية وإفراغ كافة الصفحات الملتقطة والرجوع لشاشة الكاميرا.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1 font-arabic">
              <button
                onClick={() => {
                  triggerHaptic(20);
                  setShowCancelModal(false);
                  onResetAll();
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs active:scale-95 transition-transform shadow-lg shadow-rose-500/20"
              >
                نعم، حذف الكل
              </button>
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-2.5 rounded-xl glass-button text-gray-300 font-semibold text-xs active:scale-95 transition-transform"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Delete Current Page */}
      {showDeletePageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#12151d] border border-white/10 rounded-3xl p-5 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white font-arabic">حذف هذه الصفحة؟</h3>
              <p className="text-xs text-gray-400 leading-relaxed font-arabic">
                {pages.length <= 1
                  ? 'هذه هي الصفحة الوحيدة في الجلسة. حذفها سيعيدك إلى شاشة الكاميرا.'
                  : `سيتم حذف الصفحة رقم ${safeIndex + 1} من المستند.`}
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1 font-arabic">
              <button
                onClick={() => {
                  triggerHaptic(20);
                  setShowDeletePageModal(false);
                  if (pages.length <= 1) {
                    onResetAll();
                  } else {
                    onDeletePage(safeIndex);
                    if (safeIndex > 0) setCurrentPageIndex(safeIndex - 1);
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs active:scale-95 transition-transform shadow-lg shadow-rose-500/20"
              >
                نعم، حذف الصفحة
              </button>
              <button
                onClick={() => setShowDeletePageModal(false)}
                className="flex-1 py-2.5 rounded-xl glass-button text-gray-300 font-semibold text-xs active:scale-95 transition-transform"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sheet: More Actions (WhatsApp, Download PDF, Print) */}
      {showMoreActions && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm animate-in fade-in"
          onClick={() => setShowMoreActions(false)}
        >
          <div
            className="bg-[#12151d] border-t border-white/15 rounded-t-3xl p-5 w-full max-w-md space-y-3 shadow-2xl animate-in slide-in-from-bottom-5 font-arabic"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 rounded-full bg-white/20 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-white text-center pb-2 border-b border-white/10">
              خيارات التصدير والمشاركة
            </h3>

            <button
              onClick={() => {
                setShowMoreActions(false);
                handleShareWhatsApp();
              }}
              className="w-full flex items-center gap-3 p-3 rounded-2xl glass-button text-white text-xs font-semibold hover:border-accent/40"
            >
              <Send className="w-4 h-4 text-accent shrink-0" />
              <span>إرسال سريع عبر الواتساب والمحادثات (&lt; 1.5MB)</span>
            </button>

            <button
              onClick={() => {
                setShowMoreActions(false);
                handleDownloadPdf();
              }}
              className="w-full flex items-center gap-3 p-3 rounded-2xl glass-button text-white text-xs font-semibold hover:border-accent/40"
            >
              <Download className="w-4 h-4 text-accent shrink-0" />
              <span>تنزيل وحفظ ملف PDF في الجهاز</span>
            </button>

            <button
              onClick={() => {
                setShowMoreActions(false);
                handlePrintPdf();
              }}
              className="w-full flex items-center gap-3 p-3 rounded-2xl glass-button text-white text-xs font-semibold hover:border-accent/40"
            >
              <Printer className="w-4 h-4 text-accent shrink-0" />
              <span>طباعة المستند عبر طابعة</span>
            </button>

            <button
              onClick={() => setShowMoreActions(false)}
              className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 font-semibold text-xs mt-2"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      <SignatureModal
        isOpen={isSignatureOpen}
        onClose={() => setIsSignatureOpen(false)}
        onSaveSignature={(sigUrl) => {
          triggerHaptic(20);
          setSignatures((prev) => ({
            ...prev,
            [safeIndex]: { dataUrl: sigUrl, x: 0.58, y: 0.72 },
          }));
          setToastMsg('Signature placed on current page');
          setTimeout(() => setToastMsg(''), 2200);
        }}
      />

      {/* Security Watermark Dialog Modal */}
      {/* Security Watermark Modal */}
      {isWatermarkOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 select-none font-arabic">
          <div className="w-full max-w-sm bg-[#12161f] border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 text-right">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <button
                onClick={() => setIsWatermarkOpen(false)}
                className="p-1.5 rounded-full glass-button text-gray-400 hover:text-white"
              >
                ✕
              </button>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">العلامة المائية الأمنية</span>
                <Stamp className="w-5 h-5 text-accent" />
              </div>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed">
              طباعة نص حماية شبه شفاف على صفحات مستند الـ PDF لمنع النسخ غير المصرح به.
            </p>

            {/* Watermark Layout Style: Single Center vs Full Page Tiled Grid */}
            <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/5 border border-white/10 text-xs">
              <button
                onClick={() => setWatermarkStyle('diagonal')}
                className={`flex-1 py-1.5 rounded-xl font-bold transition-all ${
                  watermarkStyle === 'diagonal'
                    ? 'bg-accent text-on-accent shadow'
                    : 'text-gray-400'
                }`}
              >
                قطري في المنتصف
              </button>
              <button
                onClick={() => setWatermarkStyle('tiled')}
                className={`flex-1 py-1.5 rounded-xl font-bold transition-all ${
                  watermarkStyle === 'tiled'
                    ? 'bg-accent text-on-accent shadow'
                    : 'text-gray-400'
                }`}
              >
                شبكة حماية مكررة
              </button>
            </div>

            <input
              type="text"
              placeholder="اكتب نص العلامة المائية (مثال: سري، مسودة...)"
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              className="w-full bg-white/5 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-accent/60 text-right font-arabic"
            />

            {/* Quick Presets */}
            <div className="flex items-center justify-end gap-1.5 flex-wrap">
              {['سري للغاية', 'نسخة للمراجعة', 'مسودة', 'مدفوع', 'CONFIDENTIAL', 'COPY'].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setWatermarkText(preset)}
                  className="px-2.5 py-1 rounded-lg bg-white/5 text-[10px] text-gray-300 border border-white/5 hover:border-accent/40 active:scale-95 font-arabic"
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
              {watermarkText && (
                <button
                  onClick={() => {
                    setWatermarkText('');
                    setIsWatermarkOpen(false);
                    setToastMsg('تمت إزالة العلامة المائية');
                    setTimeout(() => setToastMsg(''), 2000);
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs text-red-400 glass-button font-bold"
                >
                  إزالة العلامة
                </button>
              )}
              <button
                onClick={() => {
                  setIsWatermarkOpen(false);
                  if (watermarkText.trim()) {
                    setToastMsg(`تم ضبط العلامة: "${watermarkText.trim()}"`);
                    setTimeout(() => setToastMsg(''), 2200);
                  }
                }}
                className="px-5 py-2 rounded-xl bg-accent text-on-accent font-bold text-xs shadow-lg shadow-accent/25 active:scale-95 mr-auto"
              >
                تطبيق العلامة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Advanced PDF & Export Settings Modal */}
      {isAdvancedOptionsOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-200 select-none font-arabic">
          <div className="w-full max-w-sm max-h-[90vh] bg-[#0c1017] border border-white/[0.12] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.08] otium-chrome">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-accent" />
                <span className="text-sm font-bold text-white">إعدادات PDF المتقدمة</span>
              </div>
              <button
                onClick={() => setIsAdvancedOptionsOpen(false)}
                className="p-1.5 rounded-full glass-button text-gray-400 active:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-right">
              {/* 1. Quality & Size */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-200 block">جودة وحجم الملف</label>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-white/[0.05] border border-white/[0.08]">
                  {(
                    [
                      { id: 'compact', label: 'مضغوط', desc: '~35 KB' },
                      { id: 'balanced', label: 'متوازن', desc: '~180 KB' },
                      { id: 'max', label: 'فائق', desc: '~850 KB' },
                    ] as const
                  ).map((q) => (
                    <button
                      key={q.id}
                      onClick={() => {
                        triggerHaptic(10);
                        setCompressionPreset(q.id);
                      }}
                      className={`py-2 px-1 rounded-xl text-center transition-all ${
                        compressionPreset === q.id
                          ? 'bg-accent text-on-accent font-bold shadow-md'
                          : 'text-gray-300 hover:text-white'
                      }`}
                    >
                      <span className="text-xs block font-bold">{q.label}</span>
                      <span className={`text-[9px] block ${compressionPreset === q.id ? 'text-black/80' : 'text-gray-400'}`}>
                        {q.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Page Format (A4 vs Fit) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-200 block">أبعاد الورقة ومقاس الصفحة</label>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-white/[0.05] border border-white/[0.08]">
                  <button
                    onClick={() => {
                      triggerHaptic(10);
                      setPageFormat('a4');
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
                      pageFormat === 'a4'
                        ? 'bg-accent text-on-accent shadow-md'
                        : 'text-gray-300 hover:text-white'
                    }`}
                  >
                    معيار A4 الدولي (للطباعة)
                  </button>
                  <button
                    onClick={() => {
                      triggerHaptic(10);
                      setPageFormat('fit');
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
                      pageFormat === 'fit'
                        ? 'bg-accent text-on-accent shadow-md'
                        : 'text-gray-300 hover:text-white'
                    }`}
                  >
                    أبعاد الصورة الأصلية (Fit)
                  </button>
                </div>
              </div>

              {/* 3. OCR Engine */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
                <button
                  onClick={() => {
                    triggerHaptic(15);
                    setEnableOcr(!enableOcr);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    enableOcr
                      ? 'bg-accent text-on-accent shadow'
                      : 'bg-white/[0.08] text-gray-400'
                  }`}
                >
                  {enableOcr ? 'مفعل ✓' : 'معطل'}
                </button>
                <div>
                  <span className="text-xs font-bold text-gray-200 block">التعرف على النصوص (OCR)</span>
                  <span className="text-[10px] text-gray-400">استخراج النص للبحث والنسخ داخل الـ PDF</span>
                </div>
              </div>

              {/* 4. Book Spine Dewarping */}
              <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-accent font-mono font-bold">
                    {Math.round(curvature * 100)}%
                  </span>
                  <span className="text-xs font-bold text-gray-200">تسوية انحناء ثنية الكتب</span>
                </div>
                <div className="flex items-center gap-1.5 justify-center">
                  <button
                    onClick={() => setSpinePos(0.15)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                      spinePos <= 0.25 ? 'bg-accent text-on-accent' : 'bg-white/[0.06] text-gray-400'
                    }`}
                  >
                    صفحة يمنى
                  </button>
                  <button
                    onClick={() => setSpinePos(0.5)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                      spinePos > 0.25 && spinePos < 0.75 ? 'bg-accent text-on-accent' : 'bg-white/[0.06] text-gray-400'
                    }`}
                  >
                    الوسط
                  </button>
                  <button
                    onClick={() => setSpinePos(0.85)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                      spinePos >= 0.75 ? 'bg-accent text-on-accent' : 'bg-white/[0.06] text-gray-400'
                    }`}
                  >
                    صفحة يسرى
                  </button>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={curvature}
                  onChange={(e) => setCurvature(parseFloat(e.target.value))}
                  className="w-full accent-accent cursor-pointer"
                />
              </div>

              {/* 5. Watermark & Signature triggers */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => {
                    setIsAdvancedOptionsOpen(false);
                    setIsWatermarkOpen(true);
                  }}
                  className="py-2.5 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-gray-200 flex items-center justify-center gap-1.5 border border-white/[0.08]"
                >
                  <Stamp className="w-3.5 h-3.5 text-accent" />
                  <span>علامة مائية</span>
                </button>
                <button
                  onClick={() => {
                    setIsAdvancedOptionsOpen(false);
                    setIsSignatureOpen(true);
                  }}
                  className="py-2.5 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-gray-200 flex items-center justify-center gap-1.5 border border-white/[0.08]"
                >
                  <PenTool className="w-3.5 h-3.5 text-accent" />
                  <span>توقيع يدوي</span>
                </button>
              </div>

              {/* Close / Done */}
              <button
                onClick={() => setIsAdvancedOptionsOpen(false)}
                className="w-full py-2.5 rounded-xl bg-accent text-on-accent font-bold text-xs active:scale-95 mt-2"
              >
                تم تطبيق الإعدادات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
