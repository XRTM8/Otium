import React, { useRef, useState, useEffect } from 'react';
import { X, Check, RotateCcw, PenTool } from 'lucide-react';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSignature: (signatureDataUrl: string) => void;
}

export const SignatureModal: React.FC<SignatureModalProps> = ({
  isOpen,
  onClose,
  onSaveSignature,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [penColor, setPenColor] = useState<string>('#1e3a8a'); // Classic blue ink
  const [lineWidth, setLineWidth] = useState<number>(3);

  // Setup canvas size once when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = penColor;
      ctx.lineWidth = lineWidth;
    }
    setHasDrawn(false);
  }, [isOpen]);

  // Update pen styling without wiping canvas pixels
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = penColor;
      ctx.lineWidth = lineWidth;
    }
  }, [penColor, lineWidth, isOpen]);

  if (!isOpen) return null;

  const getCanvasCoords = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDrawing) return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    setIsDrawing(false);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleConfirm = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSaveSignature(dataUrl);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col justify-end sm:justify-center items-center p-4 select-none">
      <div className="w-full max-w-lg bg-[#121212] border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenTool className="w-5 h-5 text-emerald-400" />
            <span className="text-base font-semibold text-white">Digital Signature</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-full glass-button text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Signature Canvas Stage */}
        <div className="relative w-full h-56 bg-white rounded-2xl overflow-hidden shadow-inner flex items-center justify-center border-2 border-emerald-500/20">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="w-full h-full touch-none cursor-crosshair"
          />

          {!hasDrawn && (
            <p className="absolute pointer-events-none text-gray-400 text-xs italic tracking-wider">
              Sign with your finger here...
            </p>
          )}

          <div className="absolute bottom-6 inset-x-8 border-b border-dashed border-gray-300 pointer-events-none" />
        </div>

        {/* Ink Colors & Tools */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400 font-medium">Ink:</span>
              {[
                { id: '#1e3a8a', label: 'Blue' },
                { id: '#000000', label: 'Black' },
                { id: '#b91c1c', label: 'Red' },
              ].map((color) => (
                <button
                  key={color.id}
                  onClick={() => setPenColor(color.id)}
                  style={{ backgroundColor: color.id }}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${
                    penColor === color.id ? 'border-white scale-110 shadow-lg' : 'border-transparent'
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-1 border-l border-white/10 pl-2">
              {[2, 3.5, 5].map((w) => (
                <button
                  key={w}
                  onClick={() => setLineWidth(w)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                    lineWidth === w ? 'bg-emerald-500 text-black font-bold' : 'text-gray-400 glass-button'
                  }`}
                >
                  {w === 2 ? 'Fine' : w === 3.5 ? 'Medium' : 'Thick'}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleClear}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-300 glass-button active:scale-95"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>

        {/* Confirm Footer */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/5">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-full text-xs font-semibold text-gray-400 glass-button"
          >
            Cancel
          </button>

          <button
            onClick={handleConfirm}
            disabled={!hasDrawn}
            className="flex items-center gap-1.5 px-6 py-2.5 rounded-full bg-emerald-500 text-black font-bold text-xs emerald-glow disabled:opacity-40 transition-transform active:scale-95"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Apply Signature</span>
          </button>
        </div>
      </div>
    </div>
  );
};
