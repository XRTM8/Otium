import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  X,
  PenTool,
  Eraser,
  RotateCcw,
  Undo2,
  Grid,
  Columns,
  Square,
  Sparkles
} from 'lucide-react';
import type { DrawingPoint, DrawingStroke } from '../types';

interface ScratchpadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type BoardBackground = 'white' | 'black' | 'grid' | 'lined';

export const ScratchpadModal: React.FC<ScratchpadModalProps> = ({ isOpen, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [bgType, setBgType] = useState<BoardBackground>('black');
  const [activeTool, setActiveTool] = useState<'pen' | 'eraser'>('pen');
  const [penColor, setPenColor] = useState<string>('#ffffff');
  const [penSize, setPenSize] = useState<number>(4);

  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [undoStack, setUndoStack] = useState<DrawingStroke[][]>([]);
  const [redoStack, setRedoStack] = useState<DrawingStroke[][]>([]);

  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<DrawingPoint[]>([]);

  // Default pen color based on background
  useEffect(() => {
    if (bgType === 'white') {
      setPenColor('#0f172a');
    } else {
      setPenColor('#ffffff');
    }
  }, [bgType]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width * dpr, rect.height * dpr);

    ctx.save();
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    // Draw existing strokes
    for (const stroke of strokes) {
      const pts = stroke.points;
      if (!pts || pts.length === 0) continue;

      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (pts.length === 1) {
        ctx.fillStyle = stroke.color;
        ctx.beginPath();
        ctx.arc(pts[0].x * w, pts[0].y * h, stroke.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0].x * w, pts[0].y * h);
        for (let i = 1; i < pts.length - 1; i++) {
          const midX = ((pts[i].x + pts[i + 1].x) / 2) * w;
          const midY = ((pts[i].y + pts[i + 1].y) / 2) * h;
          ctx.quadraticCurveTo(pts[i].x * w, pts[i].y * h, midX, midY);
        }
        ctx.lineTo(pts[pts.length - 1].x * w, pts[pts.length - 1].y * h);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Live stroke
    if (isDrawingRef.current && currentPointsRef.current.length > 0 && activeTool === 'pen') {
      const pts = currentPointsRef.current;
      ctx.save();
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (pts.length === 1) {
        ctx.fillStyle = penColor;
        ctx.beginPath();
        ctx.arc(pts[0].x * w, pts[0].y * h, penSize / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0].x * w, pts[0].y * h);
        for (let i = 1; i < pts.length - 1; i++) {
          const midX = ((pts[i].x + pts[i + 1].x) / 2) * w;
          const midY = ((pts[i].y + pts[i + 1].y) / 2) * h;
          ctx.quadraticCurveTo(pts[i].x * w, pts[i].y * h, midX, midY);
        }
        ctx.lineTo(pts[pts.length - 1].x * w, pts[pts.length - 1].y * h);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
  }, [strokes, activeTool, penColor, penSize]);

  // Handle Resize & DPI
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      redrawCanvas();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen, redrawCanvas]);

  if (!isOpen) return null;

  const getNormPoint = (e: React.PointerEvent<HTMLCanvasElement>): DrawingPoint => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
      pressure: e.pressure > 0 ? e.pressure : 0.5,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getNormPoint(e);
    isDrawingRef.current = true;

    if (activeTool === 'eraser') {
      eraseAtPoint(pt);
      return;
    }

    currentPointsRef.current = [pt];
    redrawCanvas();
  };

  const eraseAtPoint = (pt: DrawingPoint) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const thresholdSq = (26 / rect.width) ** 2;
    const aspect = rect.height / rect.width;

    setStrokes((prev) => {
      const filtered = prev.filter((stroke) => {
        return !stroke.points.some((p) => {
          const dx = p.x - pt.x;
          const dy = (p.y - pt.y) * aspect;
          return dx * dx + dy * dy <= thresholdSq;
        });
      });
      if (filtered.length !== prev.length) {
        setUndoStack((u) => [...u, prev]);
      }
      return filtered;
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const pt = getNormPoint(e);

    if (activeTool === 'eraser') {
      eraseAtPoint(pt);
      return;
    }

    currentPointsRef.current.push(pt);
    redrawCanvas();
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (activeTool === 'pen' && currentPointsRef.current.length >= 1) {
      const newStroke: DrawingStroke = {
        id: `scratch_${Date.now()}_${Math.random()}`,
        pageNumber: 0,
        tool: 'pen',
        color: penColor,
        size: penSize,
        points: currentPointsRef.current,
        createdAt: Date.now(),
      };
      setUndoStack((u) => [...u, strokes]);
      setRedoStack([]);
      setStrokes((prev) => [...prev, newStroke]);
    }
    currentPointsRef.current = [];
    redrawCanvas();
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, strokes]);
    setUndoStack((u) => u.slice(0, -1));
    setStrokes(prev);
  };

  const handleClear = () => {
    if (strokes.length === 0) return;
    setUndoStack((u) => [...u, strokes]);
    setRedoStack([]);
    setStrokes([]);
  };

  // Background Styles
  const getBoardBgStyle = () => {
    switch (bgType) {
      case 'white':
        return { backgroundColor: '#ffffff' };
      case 'grid':
        return {
          backgroundColor: '#0f172a',
          backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        };
      case 'lined':
        return {
          backgroundColor: '#fbf6ea',
          backgroundImage: 'repeating-linear-gradient(transparent, transparent 35px, #94a3b840 36px)',
          backgroundSize: '100% 36px',
        };
      case 'black':
      default:
        return { backgroundColor: '#131924' };
    }
  };

  return (
    <div
      ref={containerRef}
      dir="ltr"
      className="fixed inset-0 z-50 flex flex-col select-none animate-in fade-in duration-200"
      style={getBoardBgStyle()}
    >
      {/* Top Floating Header Controls */}
      <div className="absolute top-4 inset-x-4 z-20 flex items-center justify-between pointer-events-none">
        
        {/* Left: Background Selector */}
        <div className="pointer-events-auto flex items-center gap-1.5 p-1.5 rounded-full bg-neutral-900/90 text-white border border-white/20 shadow-2xl backdrop-blur-xl">
          <button
            onClick={() => setBgType('black')}
            title="سبورة كلاسيكية سوداء"
            className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all ${
              bgType === 'black' ? 'bg-emerald-500 text-white' : 'hover:bg-white/10 text-neutral-300'
            }`}
          >
            سبورة سوداء
          </button>
          <button
            onClick={() => setBgType('white')}
            title="سبورة بيضاء ناصعة"
            className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all ${
              bgType === 'white' ? 'bg-emerald-500 text-white' : 'hover:bg-white/10 text-neutral-300'
            }`}
          >
            سبورة بيضاء
          </button>
          <button
            onClick={() => setBgType('grid')}
            title="شبكة مربعات هندسية (رياضيات)"
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all ${
              bgType === 'grid' ? 'bg-emerald-500 text-white' : 'hover:bg-white/10 text-neutral-300'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>مربعات</span>
          </button>
          <button
            onClick={() => setBgType('lined')}
            title="ورق مسطر (لغات وقواعد)"
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all ${
              bgType === 'lined' ? 'bg-emerald-500 text-white' : 'hover:bg-white/10 text-neutral-300'
            }`}
          >
            <Columns className="w-3.5 h-3.5 rotate-90" />
            <span>مسطر</span>
          </button>
        </div>

        {/* Right: Close & Back to Textbook */}
        <button
          onClick={onClose}
          className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs shadow-2xl transition-all cursor-pointer active:scale-95"
        >
          <span>العودة للكتاب</span>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Interactive Drawing Canvas Layer */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ touchAction: 'none' }}
        className={`w-full h-full ${
          activeTool === 'eraser' ? 'cursor-pointer' : 'cursor-crosshair'
        }`}
      />

      {/* Bottom Floating Whiteboard Tools */}
      <div className="absolute bottom-6 inset-x-0 z-20 flex justify-center pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900/95 text-white border border-white/20 shadow-2xl backdrop-blur-2xl">
          {/* Pen */}
          <button
            onClick={() => setActiveTool('pen')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all cursor-pointer ${
              activeTool === 'pen'
                ? 'bg-emerald-500 text-white shadow-lg'
                : 'hover:bg-white/10 text-neutral-300'
            }`}
          >
            <PenTool className="w-4 h-4" />
            <span className="text-xs">قلم</span>
          </button>

          {/* Color Presets */}
          <div className="flex items-center gap-1.5 px-2 border-x border-white/10">
            {['#ffffff', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#0f172a'].map((c) => (
              <button
                key={c}
                onClick={() => {
                  setPenColor(c);
                  setActiveTool('pen');
                }}
                style={{ backgroundColor: c }}
                className={`w-6 h-6 rounded-full border-2 transition-all cursor-pointer ${
                  penColor === c && activeTool === 'pen'
                    ? 'border-white scale-110 ring-2 ring-emerald-400'
                    : 'border-white/20 hover:scale-105'
                }`}
              />
            ))}
          </div>

          {/* Eraser */}
          <button
            onClick={() => setActiveTool('eraser')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all cursor-pointer ${
              activeTool === 'eraser'
                ? 'bg-rose-500 text-white shadow-lg'
                : 'hover:bg-white/10 text-neutral-300'
            }`}
          >
            <Eraser className="w-4 h-4" />
            <span className="text-xs">ممحاة</span>
          </button>

          {/* Undo */}
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className="p-2 rounded-full hover:bg-white/10 text-neutral-300 disabled:opacity-25 transition-colors cursor-pointer"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          {/* Clear All */}
          <button
            onClick={handleClear}
            disabled={strokes.length === 0}
            className="p-2 rounded-full hover:bg-rose-500/20 hover:text-rose-300 text-neutral-300 disabled:opacity-25 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
