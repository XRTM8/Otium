import React, { useState, useEffect } from 'react';
import { CameraView } from './components/CameraView';
import { CropView } from './components/CropView';
import { EnhanceView } from './components/EnhanceView';
import { LibraryModal } from './components/LibraryModal';
import { SettingsModal } from '../components/SettingsModal';
import type { Quad, ScannedPage, ScanStep } from './core/types';
import { applyFilterAsync } from './core/filters';
import {
  storePageToDisk,
  clearScanSession,
  rotateStoredPage,
  deleteStoredPage,
  loadOriginalDataUrlFromDisk,
  saveActiveSessionPages,
  getActiveSessionPages,
  clearActiveSessionPages,
} from './core/storage/pageStore';
import { getFullFrameQuad } from './core/edgeDetection';
import { warpPerspective } from './core/geometry';
import { AlertTriangle, Bookmark, Trash2 } from 'lucide-react';
import { OtiumLogo } from '../components/OtiumLogo';
import type { ThemeMode } from '../core/types';
import type { Language } from '../core/i18n/translations';

interface ScannerModalProps {
  isOpen: boolean;
  theme?: ThemeMode;
  lang?: Language;
  onClose: () => void;
  onPdfGenerated: (file: File) => void;
}

function formatArabicPagesCount(count: number): string {
  if (count === 1) return 'صفحة واحدة';
  if (count === 2) return 'صفحتان ممسوحتان';
  if (count >= 3 && count <= 10) return `${count} صفحات ممسوحة`;
  return `${count} صفحة ممسوحة`;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({
  isOpen,
  theme = 'midnight',
  lang = 'ar',
  onClose,
  onPdfGenerated,
}) => {
  const [step, setStep] = useState<ScanStep>('camera');
  const [currentRawImage, setCurrentRawImage] = useState<string>('');
  const [currentInitialQuad, setCurrentInitialQuad] = useState<Quad | null>(null);
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [retakeTargetIndex, setRetakeTargetIndex] = useState<number | null>(null);

  // Modals for Vault Archive & Settings
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showCloseConfirmModal, setShowCloseConfirmModal] = useState(false);
  const [isOpeningInReader, setIsOpeningInReader] = useState(false);

  // Restore active draft session upon opening
  useEffect(() => {
    if (isOpen) {
      const activeDraft = getActiveSessionPages();
      if (activeDraft && activeDraft.length > 0) {
        setPages(activeDraft);
        setStep('review');
      } else {
        setStep('camera');
      }
    }
  }, [isOpen]);

  // Persist session pages on modification (debounced off interaction path)
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      saveActiveSessionPages(pages);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [pages, isOpen]);

  if (!isOpen) return null;

  // Handle capture from camera or image file upload
  const handleCapture = (imageSrc: string, isBatchMode: boolean, detectedQuad?: Quad) => {
    setCurrentRawImage(imageSrc);

    if (!isBatchMode || retakeTargetIndex !== null) {
      setCurrentInitialQuad(detectedQuad ?? null);
      setStep('crop');
      return;
    }

    // CamScanner Multi-Page Mode: Process page in background
    const img = new Image();
    img.onload = async () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        const quad = detectedQuad ?? getFullFrameQuad(canvas.width, canvas.height, 0.005);
        const warpedCanvas = warpPerspective(canvas, quad);
        const filteredCanvas = await applyFilterAsync(warpedCanvas, 'magic');

        const pageId = `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const thumbnailDataUrl = await storePageToDisk(
          pageId,
          imageSrc,
          warpedCanvas,
          filteredCanvas,
          'magic'
        );

        const newPage: ScannedPage = {
          id: pageId,
          thumbnailDataUrl,
          quad,
          filter: 'magic',
          timestamp: Date.now(),
        };

        setPages((prev) => [...prev, newPage]);
      } catch (err) {
        console.warn('Batch page capture error:', err);
      }
    };
    img.src = imageSrc;
  };

  const handleCropConfirm = async (warpedCanvas: HTMLCanvasElement, quad: Quad) => {
    try {
      const pageId = `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const filteredCanvas = await applyFilterAsync(warpedCanvas, 'magic');

      const thumbnailDataUrl = await storePageToDisk(
        pageId,
        currentRawImage,
        warpedCanvas,
        filteredCanvas,
        'magic'
      );

      const newPage: ScannedPage = {
        id: pageId,
        thumbnailDataUrl,
        quad,
        filter: 'magic',
        timestamp: Date.now(),
      };

      if (retakeTargetIndex !== null) {
        setPages((prev) => {
          const updated = [...prev];
          if (retakeTargetIndex >= 0 && retakeTargetIndex < updated.length) {
            updated[retakeTargetIndex] = newPage;
          }
          return updated;
        });
        setRetakeTargetIndex(null);
      } else {
        setPages((prev) => [...prev, newPage]);
      }
    } catch (err) {
      console.warn('Crop confirm error:', err);
    } finally {
      setCurrentRawImage('');
      setCurrentInitialQuad(null);
      setStep('review');
    }
  };

  const handleCropCancel = () => {
    setCurrentRawImage('');
    setCurrentInitialQuad(null);
    setRetakeTargetIndex(null);
    setStep(pages.length > 0 ? 'review' : 'camera');
  };

  const handleAddMorePages = () => {
    setRetakeTargetIndex(null);
    setStep('camera');
  };

  const handleRetakePage = (index: number) => {
    setRetakeTargetIndex(index);
    setStep('camera');
  };

  const handleEditCrop = async (index: number) => {
    const page = pages[index];
    if (!page) return;
    try {
      const originalDataUrl = await loadOriginalDataUrlFromDisk(page.id);
      setCurrentRawImage(originalDataUrl);
      setCurrentInitialQuad(page.quad);
      setRetakeTargetIndex(index);
      setStep('crop');
    } catch (e) {
      console.warn('Could not load original image for crop:', e);
    }
  };

  const handleRotatePage = async (index: number) => {
    const page = pages[index];
    if (!page) return;
    try {
      const newThumb = await rotateStoredPage(page.id);
      setPages((prev) => {
        const updated = [...prev];
        if (updated[index]) {
          updated[index] = { ...updated[index], thumbnailDataUrl: newThumb };
        }
        return updated;
      });
    } catch (err) {
      console.error('Failed to rotate page:', err);
    }
  };

  const handleDeletePage = (index: number) => {
    const page = pages[index];
    if (page) {
      deleteStoredPage(page.id).catch(console.warn);
    }
    setPages((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        setStep('camera');
      }
      return next;
    });
  };

  const handleMovePage = (fromIndex: number, toIndex: number) => {
    setPages((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) {
        return prev;
      }
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  };

  const handleResetAll = () => {
    clearScanSession();
    clearActiveSessionPages();
    setPages([]);
    setStep('camera');
  };

  // Safe Close Request: check if unsaved pages exist
  const handleRequestClose = () => {
    if (pages.length === 0) {
      clearScanSession();
      clearActiveSessionPages();
      onClose();
    } else {
      setShowCloseConfirmModal(true);
    }
  };

  const handleSaveDraftAndClose = () => {
    saveActiveSessionPages(pages);
    setShowCloseConfirmModal(false);
    onClose();
  };

  const handleDiscardAndClose = () => {
    clearScanSession();
    clearActiveSessionPages();
    setPages([]);
    setShowCloseConfirmModal(false);
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleBack = (event: Event) => {
      event.preventDefault();
      if (isLibraryOpen) {
        setIsLibraryOpen(false);
        return;
      }
      if (isSettingsOpen) {
        setIsSettingsOpen(false);
        return;
      }
      if (showCloseConfirmModal) {
        setShowCloseConfirmModal(false);
        return;
      }
      if (step === 'crop') {
        handleCropCancel();
        return;
      }
      if (step === 'review' && pages.length === 0) {
        setStep('camera');
        return;
      }
      handleRequestClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleBack(event);
      }
    };

    window.addEventListener('otium:back', handleBack);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('otium:back', handleBack);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isLibraryOpen, isSettingsOpen, showCloseConfirmModal, step, pages.length]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={lang === 'ar' ? 'ماسح المستندات الضوئي' : 'Document Scanner'}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className={`fixed inset-0 z-50 bg-[#07090e] text-white flex flex-col select-none overflow-hidden animate-in fade-in zoom-in-[0.985] duration-250 ease-out theme-${theme}`}
    >
      {step === 'camera' && (
        <CameraView
          onCapture={handleCapture}
          pagesCount={pages.length}
          lastThumbnail={pages[pages.length - 1]?.thumbnailDataUrl}
          onFinishBatch={() => setStep('review')}
          onOpenLibrary={() => setIsLibraryOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onClose={handleRequestClose}
        />
      )}

      {step === 'crop' && (
        <CropView
          imageSrc={currentRawImage}
          initialQuad={currentInitialQuad ?? undefined}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}

      {step === 'review' && (
        <EnhanceView
          pages={pages}
          onBackToCamera={() => setStep('camera')}
          onAddMorePages={handleAddMorePages}
          onDeletePage={handleDeletePage}
          onMovePage={handleMovePage}
          onRetakePage={handleRetakePage}
          onRotatePage={handleRotatePage}
          onEditCrop={handleEditCrop}
          onResetAll={handleResetAll}
          onOpenPdfInReader={(file) => {
            setIsOpeningInReader(true);
            window.setTimeout(() => {
              clearScanSession();
              clearActiveSessionPages();
              setPages([]);
              onPdfGenerated(file);
              window.setTimeout(() => {
                onClose();
              }, 260);
            }, 180);
          }}
        />
      )}

      {/* Library Vault Modal */}
      {isLibraryOpen && (
        <LibraryModal
          isOpen={isLibraryOpen}
          onClose={() => setIsLibraryOpen(false)}
          theme={theme}
          lang={lang}
          onOpenSettings={() => {
            setIsLibraryOpen(false);
            setIsSettingsOpen(true);
          }}
          onOpenDocument={(doc) => {
            setIsLibraryOpen(false);
            clearScanSession();
            clearActiveSessionPages();
            setPages([]);
            const file = new File([doc.pdfBlob], `${doc.title}.pdf`, { type: 'application/pdf' });
            onPdfGenerated(file);
            onClose();
          }}
        />
      )}

      {/* Unified Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          lang={lang}
          initialTab="scanner"
        />
      )}

      {/* Close Confirmation Modal when unsaved pages exist */}
      {showCloseConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none fluid-fade" dir="rtl">
          <div className="bg-[#12151d] border border-white/10 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl fluid-pop">
            <div className="w-12 h-12 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-white font-arabic">إغلاق جلسة المسح الضوئي؟</h3>
              <p className="text-xs text-gray-400 leading-relaxed font-arabic">
                لديك <span className="text-accent font-bold">{lang === 'ar' ? formatArabicPagesCount(pages.length) : `${pages.length} pages`}</span>. هل تود حفظها كمسودة للمتابعة لاحقاً أم حذفها؟
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={handleSaveDraftAndClose}
                className="w-full py-2.5 px-4 rounded-xl bg-accent text-on-accent font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-accent/20 active:scale-95"
              >
                <Bookmark className="w-4 h-4 fill-current" />
                <span>حفظ كمسودة ومغادرة</span>
              </button>

              <button
                onClick={handleDiscardAndClose}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 font-bold text-xs flex items-center justify-center gap-2 border border-rose-500/30 transition-all cursor-pointer active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                <span>حذف الصفحات ومغادرة</span>
              </button>

              <button
                onClick={() => setShowCloseConfirmModal(false)}
                className="w-full py-2.5 px-4 rounded-xl glass-button text-gray-400 hover:text-white font-bold text-xs transition-all cursor-pointer active:scale-95"
              >
                متابعة المسح
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smooth Opening in Reader Transition Overlay */}
      {isOpeningInReader && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/85 backdrop-blur-2xl animate-in fade-in duration-200 select-none">
          <div className="relative w-16 h-16 rounded-3xl bg-accent/20 border border-accent/40 flex items-center justify-center shadow-2xl">
            <div className="absolute inset-0 rounded-3xl border border-accent animate-ping opacity-30" />
            <OtiumLogo size={32} />
          </div>
          <div className="text-center space-y-1">
            <p className="text-base font-bold text-white font-arabic">
              {lang === 'ar' ? 'جاري فتح المستند في القارئ...' : 'Opening in Reader...'}
            </p>
            <p className={`text-xs text-gray-400 ${lang === 'ar' ? 'font-arabic' : 'font-mono'}`}>
              {lang === 'ar' ? formatArabicPagesCount(pages.length) : `${pages.length} ${pages.length === 1 ? 'page' : 'pages'} scanned`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
