import React, { useState, useEffect } from 'react';
import { CameraView } from './components/CameraView';
import { CropView } from './components/CropView';
import { EnhanceView } from './components/EnhanceView';
import type { Quad, ScannedPage, ScanStep } from './core/types';
import { applyFilterAsync } from './core/filters';
import {
  storePageToDisk,
  clearScanSession,
  rotateStoredPage,
  deleteStoredPage,
  loadOriginalDataUrlFromDisk,
} from './core/storage/pageStore';
import { getFullFrameQuad } from './core/edgeDetection';
import { warpPerspective } from './core/geometry';
import { X } from 'lucide-react';

interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPdfGenerated: (file: File) => void;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({
  isOpen,
  onClose,
  onPdfGenerated,
}) => {
  const [step, setStep] = useState<ScanStep>('camera');
  const [currentRawImage, setCurrentRawImage] = useState<string>('');
  const [currentInitialQuad, setCurrentInitialQuad] = useState<Quad | null>(null);
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [retakeTargetIndex, setRetakeTargetIndex] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep('camera');
    }
  }, [isOpen]);

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
    setPages([]);
    setStep('camera');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col select-none overflow-hidden animate-in fade-in duration-200">
      {/* Top Close Button */}
      <div className="absolute top-4 right-4 z-50">
        <button
          onClick={onClose}
          className="p-2.5 rounded-full bg-black/60 text-white hover:bg-black/90 transition-all border border-white/10 cursor-pointer"
          title="إغلاق الماسح الضوئي"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {step === 'camera' && (
        <CameraView
          onCapture={handleCapture}
          pagesCount={pages.length}
          lastThumbnail={pages[pages.length - 1]?.thumbnailDataUrl}
          onFinishBatch={() => setStep('review')}
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
            clearScanSession();
            setPages([]);
            onPdfGenerated(file);
            onClose();
          }}
        />
      )}
    </div>
  );
};
