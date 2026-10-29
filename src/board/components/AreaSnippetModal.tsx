import React, { useRef, useState, useEffect } from 'react';
import { Crop, X } from 'lucide-react';
import type { Language } from '../../core/i18n/translations';
import type { BoardSnippet } from '../types';

interface AreaSnippetModalProps {
  isOpen: boolean;
  currentPage: number;
  lang: Language;
  onClose: () => void;
  onSnippetCaptured: (snippet: BoardSnippet) => void;
}

export const AreaSnippetModal: React.FC<AreaSnippetModalProps> = ({
  isOpen,
  currentPage,
  lang,
  onClose,
  onSnippetCaptured
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const overlay = overlayRef.current;
    if (!overlay) return;
    try {
      overlay.setPointerCapture(e.pointerId);
    } catch {}

    const rect = overlay.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setStartPoint({ x, y });
    setCurrentPoint({ x, y });
    setIsSelecting(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSelecting) return;
    const overlay = overlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    setCurrentPoint({ x, y });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSelecting || !startPoint || !currentPoint) {
      setIsSelecting(false);
      setStartPoint(null);
      setCurrentPoint(null);
      return;
    }

    const overlay = overlayRef.current;
    if (overlay && overlay.hasPointerCapture(e.pointerId)) {
      try {
        overlay.releasePointerCapture(e.pointerId);
      } catch {}
    }

    setIsSelecting(false);

    // Calculate crop rectangle in client coordinates
    const left = Math.min(startPoint.x, currentPoint.x);
    const top = Math.min(startPoint.y, currentPoint.y);
    const width = Math.abs(currentPoint.x - startPoint.x);
    const height = Math.abs(currentPoint.y - startPoint.y);

    if (width < 20 || height < 20) {
      // Too small, ignore
      setStartPoint(null);
      setCurrentPoint(null);
      return;
    }

    // Capture visual area from the active page canvas
    captureSnippetFromCanvas(left, top, width, height);
  };

  const captureSnippetFromCanvas = (
    screenLeft: number,
    screenTop: number,
    screenWidth: number,
    screenHeight: number
  ) => {
    // Locate the canvas of the current page
    const pageSlot = document.querySelector(`[data-page-slot="${currentPage}"]`);
    const pageCanvas = (pageSlot?.querySelector('canvas') as HTMLCanvasElement) ||
      (document.querySelector('.pdf-page-frame canvas') as HTMLCanvasElement);

    if (!pageCanvas) {
      onClose();
      return;
    }

    const canvasRect = pageCanvas.getBoundingClientRect();

    // Map screen coordinates to canvas pixels
    const scaleX = pageCanvas.width / canvasRect.width;
    const scaleY = pageCanvas.height / canvasRect.height;

    const cropX = Math.max(0, (screenLeft - canvasRect.left) * scaleX);
    const cropY = Math.max(0, (screenTop - canvasRect.top) * scaleY);
    const cropW = Math.min(pageCanvas.width - cropX, screenWidth * scaleX);
    const cropH = Math.min(pageCanvas.height - cropY, screenHeight * scaleY);

    if (cropW <= 0 || cropH <= 0) {
      onClose();
      return;
    }

    try {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = cropW;
      tempCanvas.height = cropH;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) {
        onClose();
        return;
      }

      ctx.drawImage(pageCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      const dataUrl = tempCanvas.toDataURL('image/png');

      const snippet: BoardSnippet = {
        id: `snippet-img-${Date.now()}`,
        type: 'image',
        content: dataUrl,
        pageNumber: currentPage,
        x: 40,
        y: 60,
        width: Math.min(340, Math.round(screenWidth)),
        height: Math.min(420, Math.round(screenHeight)),
        createdAt: Date.now()
      };

      onSnippetCaptured(snippet);
      onClose();
    } catch (err) {
      console.error('Failed to capture snippet from canvas:', err);
      onClose();
    }
  };

  // Selection box geometry
  const boxLeft = startPoint && currentPoint ? Math.min(startPoint.x, currentPoint.x) : 0;
  const boxTop = startPoint && currentPoint ? Math.min(startPoint.y, currentPoint.y) : 0;
  const boxWidth = startPoint && currentPoint ? Math.abs(currentPoint.x - startPoint.x) : 0;
  const boxHeight = startPoint && currentPoint ? Math.abs(currentPoint.y - startPoint.y) : 0;

  return (
    <div
      ref={overlayRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] cursor-crosshair select-none touch-none animate-in fade-in duration-150 flex flex-col justify-between"
    >
      {/* Top Banner Guide - Apple-grade floating pill */}
      <div className="flex items-center justify-between px-4 py-2.5 max-w-md mx-auto w-full mt-5 rounded-2xl bg-surface/90 border border-line/80 shadow-[0_16px_40px_rgba(0,0,0,0.25)] backdrop-blur-xl pointer-events-auto">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-xl bg-accent/15 text-accent">
            <Crop className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-ink tracking-tight">
              {lang === 'ar' ? 'قص جزء من الكتاب إلى السبورة' : 'Clip Diagram to Studio'}
            </h4>
            <p className="text-[11px] text-ink-muted leading-tight">
              {lang === 'ar'
                ? 'اسحب لتحديد المسألة أو المخطط المراد نقله'
                : 'Drag to select formula, figure, or diagram'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-xl hover:bg-hover text-ink-muted hover:text-ink transition-colors cursor-pointer"
          title={lang === 'ar' ? 'إلغاء (Esc)' : 'Cancel (Esc)'}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Render High-Precision Selection Box with Viewfinder Brackets */}
      {isSelecting && boxWidth > 0 && boxHeight > 0 && (
        <div
          style={{
            left: `${boxLeft}px`,
            top: `${boxTop}px`,
            width: `${boxWidth}px`,
            height: `${boxHeight}px`
          }}
          className="absolute border border-accent/80 bg-accent/10 rounded-md shadow-2xl pointer-events-none"
        >
          {/* 4 Optical Corner Viewfinder Brackets */}
          <span className="absolute -top-1 -left-1 w-2.5 h-2.5 border-t-2 border-l-2 border-accent" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 border-t-2 border-r-2 border-accent" />
          <span className="absolute -bottom-1 -left-1 w-2.5 h-2.5 border-b-2 border-l-2 border-accent" />
          <span className="absolute -bottom-1 -right-1 w-2.5 h-2.5 border-b-2 border-r-2 border-accent" />

          {/* Dimension Badge */}
          <div className="absolute -bottom-6 rtl:right-0 ltr:left-0 px-2 py-0.5 rounded-md bg-surface/95 border border-line text-ink text-[10px] font-mono tracking-wider shadow-md backdrop-blur-md">
            {Math.round(boxWidth)} × {Math.round(boxHeight)}
          </div>
        </div>
      )}

      {/* Bottom Hint */}
      <div className="text-center p-3 text-white/70 text-[11px] font-medium tracking-wide">
        {lang === 'ar' ? 'اضغط زر Esc للإلغاء' : 'Press Esc to cancel'}
      </div>
    </div>
  );
};
