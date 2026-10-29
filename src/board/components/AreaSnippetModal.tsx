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
    overlay.setPointerCapture(e.pointerId);

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
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs cursor-crosshair select-none touch-none animate-in fade-in duration-150 flex flex-col justify-between"
    >
      {/* Top Banner Guide */}
      <div className="flex items-center justify-between p-4 max-w-lg mx-auto w-full mt-4 rounded-2xl bg-surface/90 border border-line shadow-2xl backdrop-blur-md pointer-events-auto">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-accent/20 text-accent">
            <Crop className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-ink">
              {lang === 'ar' ? 'قص جزء من الكتاب للسبورة' : 'Crop Snippet to Board'}
            </h4>
            <p className="text-xs text-ink-muted">
              {lang === 'ar'
                ? 'اسحب بإصبعك أو بالقلم لرسم إطار حول المسألة أو المخطط'
                : 'Drag with finger or stylus around the formula or diagram'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-hover text-ink-muted hover:text-ink transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Render Selection Box */}
      {isSelecting && boxWidth > 0 && boxHeight > 0 && (
        <div
          style={{
            left: `${boxLeft}px`,
            top: `${boxTop}px`,
            width: `${boxWidth}px`,
            height: `${boxHeight}px`
          }}
          className="absolute border-2 border-accent bg-accent/20 rounded-lg shadow-2xl pointer-events-none"
        >
          <div className="absolute -bottom-7 right-0 px-2 py-0.5 rounded-md bg-accent text-on-accent text-[10px] font-mono shadow-md">
            {Math.round(boxWidth)} × {Math.round(boxHeight)} px
          </div>
        </div>
      )}

      {/* Bottom Hint */}
      <div className="text-center p-3 text-white/80 text-xs font-medium">
        {lang === 'ar' ? 'اضغط Esc للإلغاء' : 'Press Esc to cancel'}
      </div>
    </div>
  );
};
