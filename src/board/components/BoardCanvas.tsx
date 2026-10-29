import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Crop,
  Download,
  Eraser,
  FileText,
  Hand,
  Highlighter,
  Image as ImageIcon,
  Loader2,
  Move,
  Pen,
  Plus,
  Pointer,
  RotateCcw,
  RotateCw,
  Trash2,
  X
} from 'lucide-react';
import type { BoardBackground, BoardPageData, BoardSnippet, BoardStroke, BoardTool, StrokePoint } from '../types';
import type { Language } from '../../core/i18n/translations';
import { exportAllPagesToPdf, exportPageToPng, type ExportableBoardPage } from '../utils/boardExport';

interface BoardCanvasProps {
  lang: Language;
  snippets: BoardSnippet[];
  onRemoveSnippet: (id: string) => void;
  onUpdateSnippetPosition: (id: string, x: number, y: number) => void;
  onRequestAreaClip?: () => void;
  onCloseBoard?: () => void;
}

const PEN_WIDTHS = [
  { id: 'thin', value: 3, label: '3px' },
  { id: 'medium', value: 6, label: '6px' },
  { id: 'thick', value: 12, label: '12px' }
];

const LIGHT_COLORS = ['#0f172a', '#2563eb', '#dc2626', '#059669'];
const DARK_COLORS = ['#f8fafc', '#60a5fa', '#f87171', '#34d399'];

export const BoardCanvas: React.FC<BoardCanvasProps> = ({
  lang,
  snippets,
  onRemoveSnippet,
  onUpdateSnippetPosition,
  onRequestAreaClip,
  onCloseBoard
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const laserCanvasRef = useRef<HTMLCanvasElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Multi-page state
  const [pages, setPages] = useState<BoardPageData[]>([
    { id: 'page-1', strokes: [], redoStack: [], background: 'white' }
  ]);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);

  // Palm rejection state (Stylus only mode)
  const [stylusOnly, setStylusOnly] = useState<boolean>(false);

  // Export popover state
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const [activeTool, setActiveTool] = useState<BoardTool>('pen');
  const [background, setBackground] = useState<BoardBackground>('white');
  const [selectedColor, setSelectedColor] = useState<string>('#0f172a');
  const [selectedWidth, setSelectedWidth] = useState<number>(4);

  const [strokes, setStrokes] = useState<BoardStroke[]>([]);
  const [redoStack, setRedoStack] = useState<BoardStroke[][]>([]);
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<StrokePoint[]>([]);

  // Laser pointer trailing particles
  const laserTrailRef = useRef<{ x: number; y: number; time: number }[]>([]);
  const laserAnimFrameRef = useRef<number | null>(null);

  // Dragging snippets on canvas
  const [draggingSnippetId, setDraggingSnippetId] = useState<string | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const isDarkBg = background === 'dark';
  const palette = isDarkBg ? DARK_COLORS : LIGHT_COLORS;

  // Auto-tune selected color when switching between light and dark backgrounds
  useEffect(() => {
    if (isDarkBg && selectedColor === '#0f172a') {
      setSelectedColor('#f8fafc');
    } else if (!isDarkBg && selectedColor === '#f8fafc') {
      setSelectedColor('#0f172a');
    }
  }, [isDarkBg, selectedColor]);

  // Keep pages array synced with active drawing state
  useEffect(() => {
    setPages((prev) => {
      if (!prev[currentPageIndex]) return prev;
      const cur = prev[currentPageIndex];
      if (cur.strokes === strokes && cur.redoStack === redoStack && cur.background === background) {
        return prev;
      }
      const next = [...prev];
      next[currentPageIndex] = {
        ...cur,
        strokes,
        redoStack,
        background
      };
      return next;
    });
  }, [strokes, redoStack, background, currentPageIndex]);

  // Close export menu when clicking outside
  useEffect(() => {
    if (!isExportOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isExportOpen]);

  // Sync canvas size with high DPI pixel ratio
  const syncCanvasDimensions = useCallback(() => {
    const canvas = canvasRef.current;
    const laserCanvas = laserCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !laserCanvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    laserCanvas.width = Math.round(rect.width * dpr);
    laserCanvas.height = Math.round(rect.height * dpr);
    laserCanvas.style.width = `${rect.width}px`;
    laserCanvas.style.height = `${rect.height}px`;

    repaintAllStrokes();
  }, [strokes, background]);

  useLayoutEffect(() => {
    syncCanvasDimensions();
    const handleResize = () => {
      syncCanvasDimensions();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [syncCanvasDimensions]);

  // Repaint all vector strokes with Bézier curves
  const repaintAllStrokes = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of strokes) {
      if (!stroke.points || stroke.points.length === 0) continue;

      ctx.beginPath();
      if (stroke.tool === 'highlighter') {
        ctx.strokeStyle = stroke.color || 'rgba(250, 204, 21, 0.4)';
        ctx.lineWidth = stroke.width || 22;
        ctx.globalAlpha = 0.45;
      } else {
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.globalAlpha = 1.0;
      }

      const pts = stroke.points;
      if (pts.length === 1) {
        ctx.arc(pts[0].x, pts[0].y, stroke.width / 2, 0, Math.PI * 2);
        ctx.fillStyle = stroke.color;
        ctx.fill();
        continue;
      }

      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const xc = (pts[i].x + pts[i + 1].x) / 2;
        const yc = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    }

    ctx.restore();
  }, [strokes]);

  useEffect(() => {
    repaintAllStrokes();
  }, [repaintAllStrokes]);

  // Laser loop animation
  useEffect(() => {
    const laserCanvas = laserCanvasRef.current;
    if (!laserCanvas) return;
    const ctx = laserCanvas.getContext('2d');
    if (!ctx) return;

    const renderLaser = () => {
      const now = performance.now();
      const trail = laserTrailRef.current;
      const dpr = window.devicePixelRatio || 1;

      while (trail.length > 0 && now - trail[0].time > 1100) {
        trail.shift();
      }

      ctx.clearRect(0, 0, laserCanvas.width, laserCanvas.height);

      if (trail.length > 0) {
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Draw glowing fading trail
        for (let i = 1; i < trail.length; i++) {
          const p1 = trail[i - 1];
          const p2 = trail[i];
          const age = now - p2.time;
          const alpha = Math.max(0, 1 - age / 1100);

          ctx.beginPath();
          ctx.strokeStyle = `rgba(239, 68, 68, ${alpha * 0.75})`;
          ctx.lineWidth = Math.max(2, 8 * (1 - age / 1100));
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 10;
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }

        // Draw bright laser dot at latest point
        const latest = trail[trail.length - 1];
        ctx.beginPath();
        ctx.arc(latest.x, latest.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#f87171';
        ctx.shadowBlur = 16;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(latest.x, latest.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        ctx.restore();
      }

      laserAnimFrameRef.current = requestAnimationFrame(renderLaser);
    };

    laserAnimFrameRef.current = requestAnimationFrame(renderLaser);

    return () => {
      if (laserAnimFrameRef.current) {
        cancelAnimationFrame(laserAnimFrameRef.current);
      }
    };
  }, []);

  // Stroke erasure intersection checker
  const eraseStrokesNearPoint = (x: number, y: number, radius = 20) => {
    setStrokes((prevStrokes) => {
      const remaining = prevStrokes.filter((stroke) => {
        return !stroke.points.some((p) => {
          const dx = p.x - x;
          const dy = p.y - y;
          return dx * dx + dy * dy <= radius * radius;
        });
      });
      if (remaining.length !== prevStrokes.length) {
        setRedoStack([]);
      }
      return remaining;
    });
  };

  // Pointer event handlers for zero-latency drawing with Palm Rejection
  const getCanvasCoordinates = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Palm Rejection: if active, reject non-pen touches
    if (stylusOnly && e.pointerType === 'touch') {
      return;
    }

    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const coords = getCanvasCoordinates(e);

    if (activeTool === 'laser') {
      laserTrailRef.current.push({ x: coords.x, y: coords.y, time: performance.now() });
      return;
    }

    if (activeTool === 'eraser') {
      eraseStrokesNearPoint(coords.x, coords.y);
      isDrawingRef.current = true;
      return;
    }

    isDrawingRef.current = true;
    currentPointsRef.current = [coords];

    const newStroke: BoardStroke = {
      id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      points: [coords],
      color: activeTool === 'highlighter' ? 'rgba(250, 204, 21, 0.45)' : selectedColor,
      width: activeTool === 'highlighter' ? 24 : selectedWidth,
      tool: activeTool === 'highlighter' ? 'highlighter' : 'pen'
    };

    setStrokes((prev) => [...prev, newStroke]);
    setRedoStack([]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Palm Rejection: ignore touch events when stylus only is enabled
    if (stylusOnly && e.pointerType === 'touch') {
      return;
    }

    const coords = getCanvasCoordinates(e);

    if (activeTool === 'laser') {
      laserTrailRef.current.push({ x: coords.x, y: coords.y, time: performance.now() });
      return;
    }

    if (!isDrawingRef.current) return;

    if (activeTool === 'eraser') {
      eraseStrokesNearPoint(coords.x, coords.y);
      return;
    }

    // Capture coalesced events if available (high-precision smartboard pens)
    const coalesced = (e.nativeEvent as any).getCoalescedEvents
      ? ((e.nativeEvent as any).getCoalescedEvents() as PointerEvent[])
      : [e.nativeEvent];

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const newPoints: StrokePoint[] = coalesced.map((pe) => ({
      x: pe.clientX - rect.left,
      y: pe.clientY - rect.top,
      pressure: pe.pressure || 0.5
    }));

    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const updatedStroke = {
        ...last,
        points: [...last.points, ...newPoints]
      };
      return [...prev.slice(0, -1), updatedStroke];
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (stylusOnly && e.pointerType === 'touch') {
      return;
    }

    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    isDrawingRef.current = false;
    currentPointsRef.current = [];
  };

  // Undo / Redo
  const handleUndo = () => {
    if (strokes.length === 0) return;
    const lastStroke = strokes[strokes.length - 1];
    setRedoStack((prev) => [[lastStroke], ...prev]);
    setStrokes((prev) => prev.slice(0, -1));
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const [nextStrokeBatch, ...rest] = redoStack;
    setStrokes((prev) => [...prev, ...nextStrokeBatch]);
    setRedoStack(rest);
  };

  const handleClearAll = () => {
    if (strokes.length === 0) return;
    setRedoStack((prev) => [strokes, ...prev]);
    setStrokes([]);
  };

  // Multi-Page Navigation Handlers
  const handleSwitchPage = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= pages.length || targetIndex === currentPageIndex) return;

    // 1. Sync current page
    const updatedPages = [...pages];
    updatedPages[currentPageIndex] = {
      ...updatedPages[currentPageIndex],
      strokes,
      redoStack,
      background
    };
    setPages(updatedPages);

    // 2. Load target page
    const target = updatedPages[targetIndex];
    setStrokes(target.strokes);
    setRedoStack(target.redoStack);
    setBackground(target.background);
    setCurrentPageIndex(targetIndex);
    laserTrailRef.current = [];
  };

  const handleAddPage = () => {
    if (pages.length >= 10) return;

    const updatedPages = [...pages];
    updatedPages[currentPageIndex] = {
      ...updatedPages[currentPageIndex],
      strokes,
      redoStack,
      background
    };

    const newPage: BoardPageData = {
      id: `page-${Date.now()}`,
      strokes: [],
      redoStack: [],
      background
    };

    updatedPages.push(newPage);
    setPages(updatedPages);
    setCurrentPageIndex(updatedPages.length - 1);
    setStrokes([]);
    setRedoStack([]);
    laserTrailRef.current = [];
  };

  // Export Handlers
  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      const canvas = canvasRef.current;
      const w = canvas ? canvas.width : 1920;
      const h = canvas ? canvas.height : 1080;

      const pagesToExport: ExportableBoardPage[] = pages.map((p, idx) =>
        idx === currentPageIndex ? { ...p, strokes, background } : p
      );

      await exportAllPagesToPdf(pagesToExport, w, h, snippets);
    } catch (err) {
      console.error('Failed to export lecture PDF:', err);
    } finally {
      setIsExporting(false);
      setIsExportOpen(false);
    }
  };

  const handleExportPng = async () => {
    setIsExporting(true);
    try {
      const canvas = canvasRef.current;
      const w = canvas ? canvas.width : 1920;
      const h = canvas ? canvas.height : 1080;

      const currentPage: ExportableBoardPage = {
        id: pages[currentPageIndex]?.id || 'page-1',
        strokes,
        background
      };

      await exportPageToPng(currentPage, w, h, snippets, currentPageIndex + 1);
    } catch (err) {
      console.error('Failed to export lecture PNG:', err);
    } finally {
      setIsExporting(false);
      setIsExportOpen(false);
    }
  };

  // Snippet Card Dragging
  const handleSnippetPointerDown = (id: string, e: React.PointerEvent) => {
    e.stopPropagation();
    setDraggingSnippetId(id);
    const snip = snippets.find((s) => s.id === id);
    if (!snip) return;
    dragOffsetRef.current = {
      x: e.clientX - snip.x,
      y: e.clientY - snip.y
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleSnippetPointerMove = (id: string, e: React.PointerEvent) => {
    if (draggingSnippetId !== id) return;
    const newX = Math.max(10, e.clientX - dragOffsetRef.current.x);
    const newY = Math.max(10, e.clientY - dragOffsetRef.current.y);
    onUpdateSnippetPosition(id, newX, newY);
  };

  const handleSnippetPointerUp = (id: string, e: React.PointerEvent) => {
    if (draggingSnippetId === id) {
      setDraggingSnippetId(null);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const isRtl = lang === 'ar';

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full select-none overflow-hidden touch-none transition-colors duration-300 ${
        background === 'dark'
          ? 'bg-slate-900 text-slate-100'
          : background === 'grid'
          ? 'bg-white bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:20px_20px] text-slate-900'
          : background === 'ruled'
          ? 'bg-[#fcfbf9] bg-[linear-gradient(transparent_27px,#e2e8f0_28px)] [background-size:100%_28px] text-slate-900'
          : 'bg-white text-slate-900'
      }`}
    >
      {/* Interactive Inking Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="absolute inset-0 cursor-crosshair z-10"
      />

      {/* Floating Laser Trail Overlay */}
      <canvas
        ref={laserCanvasRef}
        className="absolute inset-0 pointer-events-none z-20"
      />

      {/* Pinned PDF Snippets (Cards & Diagrams) */}
      <div className="absolute inset-0 pointer-events-none z-15">
        {snippets.map((snip) => (
          <div
            key={snip.id}
            style={{
              transform: `translate3d(${snip.x}px, ${snip.y}px, 0)`,
              width: `${snip.width}px`
            }}
            className="absolute top-0 left-0 pointer-events-auto rounded-2xl border border-line bg-surface/95 backdrop-blur-md shadow-xl overflow-hidden transition-shadow hover:shadow-2xl flex flex-col"
          >
            {/* Snippet Header */}
            <div
              onPointerDown={(e) => handleSnippetPointerDown(snip.id, e)}
              onPointerMove={(e) => handleSnippetPointerMove(snip.id, e)}
              onPointerUp={(e) => handleSnippetPointerUp(snip.id, e)}
              className="flex items-center justify-between px-3 py-1.5 bg-hover-subtle border-b border-line cursor-grab active:cursor-grabbing text-ink-muted text-xs select-none"
            >
              <div className="flex items-center gap-1.5 font-semibold text-[11px] text-accent">
                <Move className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? `اقتباس صفحة ${snip.pageNumber}` : `Page ${snip.pageNumber} Clip`}</span>
              </div>
              <button
                type="button"
                onClick={() => onRemoveSnippet(snip.id)}
                className="p-1 rounded-lg hover:bg-hover hover:text-danger-ink text-ink-muted transition-colors cursor-pointer"
                title={lang === 'ar' ? 'إزالة الاقتباس' : 'Remove Snippet'}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Snippet Content */}
            <div className="p-3 text-xs leading-relaxed max-h-72 overflow-y-auto">
              {snip.type === 'image' ? (
                <img
                  src={snip.content}
                  alt={lang === 'ar' ? 'مخطط من الكتاب' : 'Book Diagram'}
                  className="w-full h-auto rounded-lg border border-line-subtle object-contain select-none pointer-events-none"
                  draggable={false}
                />
              ) : (
                <blockquote className="border-r-2 rtl:border-r-2 ltr:border-l-2 border-accent/60 pr-2 rtl:pr-2 ltr:pl-2 italic text-ink font-serif">
                  {snip.content}
                </blockquote>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Floating Zen Whiteboard Dock */}
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-surface/90 border border-line backdrop-blur-md shadow-2xl text-ink max-w-[96vw] overflow-x-auto select-none"
      >
        {/* Pen Tool */}
        <button
          type="button"
          onClick={() => setActiveTool('pen')}
          title={lang === 'ar' ? 'قلم الكتابة' : 'Pen'}
          className={`p-2 rounded-xl transition-all cursor-pointer ${
            activeTool === 'pen'
              ? 'bg-accent text-on-accent shadow-md scale-105'
              : 'hover:bg-hover text-ink-muted hover:text-ink'
          }`}
        >
          <Pen className="w-4 h-4" />
        </button>

        {/* Highlighter Tool */}
        <button
          type="button"
          onClick={() => setActiveTool('highlighter')}
          title={lang === 'ar' ? 'قلم التظليل العريض' : 'Highlighter'}
          className={`p-2 rounded-xl transition-all cursor-pointer ${
            activeTool === 'highlighter'
              ? 'bg-amber-500 text-white shadow-md scale-105'
              : 'hover:bg-hover text-ink-muted hover:text-ink'
          }`}
        >
          <Highlighter className="w-4 h-4" />
        </button>

        {/* Eraser Tool */}
        <button
          type="button"
          onClick={() => setActiveTool('eraser')}
          title={lang === 'ar' ? 'ممحاة المسارات' : 'Eraser'}
          className={`p-2 rounded-xl transition-all cursor-pointer ${
            activeTool === 'eraser'
              ? 'bg-rose-500 text-white shadow-md scale-105'
              : 'hover:bg-hover text-ink-muted hover:text-ink'
          }`}
        >
          <Eraser className="w-4 h-4" />
        </button>

        {/* Digital Laser Pointer */}
        <button
          type="button"
          onClick={() => setActiveTool('laser')}
          title={lang === 'ar' ? 'مؤشر الليزر المتوهج للشرح' : 'Laser Pointer'}
          className={`p-2 rounded-xl transition-all cursor-pointer ${
            activeTool === 'laser'
              ? 'bg-red-600 text-white shadow-md shadow-red-500/30 scale-105 animate-pulse'
              : 'hover:bg-hover text-ink-muted hover:text-ink'
          }`}
        >
          <Pointer className="w-4 h-4" />
        </button>

        <div className="h-5 w-px bg-line mx-0.5" />

        {/* Color Palette (Active only when Pen is active) */}
        {activeTool === 'pen' && (
          <div className="flex items-center gap-1.5 px-1">
            {palette.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setSelectedColor(color)}
                style={{ backgroundColor: color }}
                className={`w-5 h-5 rounded-full border-2 transition-transform cursor-pointer ${
                  selectedColor === color
                    ? 'border-accent scale-125 shadow-sm ring-1 ring-accent'
                    : 'border-transparent hover:scale-110'
                }`}
              />
            ))}
          </div>
        )}

        {/* Pen Width Selector */}
        {activeTool === 'pen' && (
          <div className="flex items-center gap-1 bg-hover-subtle rounded-xl p-0.5 border border-line-subtle">
            {PEN_WIDTHS.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setSelectedWidth(w.value)}
                className={`px-2 py-0.5 text-[10px] font-mono rounded-lg transition-colors cursor-pointer ${
                  selectedWidth === w.value
                    ? 'bg-surface text-accent font-bold shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        )}

        <div className="h-5 w-px bg-line mx-0.5" />

        {/* Background Style Switcher */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setBackground('white')}
            title={lang === 'ar' ? 'ورقة بيضاء' : 'Plain White'}
            className={`px-2 py-1 text-xs rounded-xl border cursor-pointer transition-colors ${
              background === 'white'
                ? 'bg-surface border-accent text-accent font-semibold'
                : 'border-line text-ink-muted hover:text-ink'
            }`}
          >
            {lang === 'ar' ? 'بيضاء' : 'White'}
          </button>
          <button
            type="button"
            onClick={() => setBackground('grid')}
            title={lang === 'ar' ? 'شبكة مربعات هندسية' : 'Math Grid'}
            className={`px-2 py-1 text-xs rounded-xl border cursor-pointer transition-colors ${
              background === 'grid'
                ? 'bg-surface border-accent text-accent font-semibold'
                : 'border-line text-ink-muted hover:text-ink'
            }`}
          >
            {lang === 'ar' ? 'شبكة' : 'Grid'}
          </button>
          <button
            type="button"
            onClick={() => setBackground('ruled')}
            title={lang === 'ar' ? 'أسطر دفتر مسطرة' : 'Ruled Lines'}
            className={`px-2 py-1 text-xs rounded-xl border cursor-pointer transition-colors ${
              background === 'ruled'
                ? 'bg-surface border-accent text-accent font-semibold'
                : 'border-line text-ink-muted hover:text-ink'
            }`}
          >
            {lang === 'ar' ? 'مسطر' : 'Ruled'}
          </button>
          <button
            type="button"
            onClick={() => setBackground('dark')}
            title={lang === 'ar' ? 'سبورة داكنة' : 'Dark Slate'}
            className={`px-2 py-1 text-xs rounded-xl border cursor-pointer transition-colors ${
              background === 'dark'
                ? 'bg-slate-800 border-accent text-accent font-semibold'
                : 'border-line text-ink-muted hover:text-ink'
            }`}
          >
            {lang === 'ar' ? 'داكنة' : 'Dark'}
          </button>
        </div>

        <div className="h-5 w-px bg-line mx-0.5" />

        {/* Palm Rejection Toggle (Stylus Only) */}
        <button
          type="button"
          onClick={() => setStylusOnly((prev) => !prev)}
          title={
            lang === 'ar'
              ? stylusOnly
                ? 'وضع القلم فقط مفعّل (رفض راحة اليد لحماية السبورة)'
                : 'تفعيل وضع القلم فقط (تجاهل لمس الكف لمنع البقع)'
              : stylusOnly
              ? 'Stylus Only active (Palm rejection enabled)'
              : 'Enable Stylus Only (Reject palm touches)'
          }
          className={`flex items-center gap-1 px-2 py-1.5 rounded-xl border transition-all cursor-pointer ${
            stylusOnly
              ? 'bg-accent/15 border-accent text-accent font-bold shadow-xs'
              : 'border-line hover:bg-hover text-ink-muted hover:text-ink'
          }`}
        >
          <Hand className={`w-3.5 h-3.5 ${stylusOnly ? 'text-accent' : 'text-ink-muted'}`} />
          <span className="text-[11px] hidden md:inline">
            {lang === 'ar' ? (stylusOnly ? 'قلم حصري' : 'لمس حر') : (stylusOnly ? 'Stylus' : 'Touch')}
          </span>
          {stylusOnly && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />}
        </button>

        <div className="h-5 w-px bg-line mx-0.5" />

        {/* Multi-Page Whiteboard Navigator [ < 1/3 > + ] */}
        <div className="flex items-center gap-1 bg-hover-subtle px-1.5 py-1 rounded-xl border border-line">
          <button
            type="button"
            onClick={() => handleSwitchPage(currentPageIndex - 1)}
            disabled={currentPageIndex <= 0}
            title={lang === 'ar' ? 'الصفحة السابقة' : 'Previous Board Page'}
            className="p-1 rounded-lg hover:bg-surface disabled:opacity-25 disabled:pointer-events-none text-ink-muted hover:text-ink transition-colors cursor-pointer"
          >
            {isRtl ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>

          <span className="text-xs font-mono font-bold text-ink px-1 min-w-[34px] text-center">
            {currentPageIndex + 1}/{pages.length}
          </span>

          <button
            type="button"
            onClick={() => handleSwitchPage(currentPageIndex + 1)}
            disabled={currentPageIndex >= pages.length - 1}
            title={lang === 'ar' ? 'الصفحة التالية' : 'Next Board Page'}
            className="p-1 rounded-lg hover:bg-surface disabled:opacity-25 disabled:pointer-events-none text-ink-muted hover:text-ink transition-colors cursor-pointer"
          >
            {isRtl ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={handleAddPage}
            disabled={pages.length >= 10}
            title={lang === 'ar' ? 'إضافة صفحة سبورة جديدة' : 'Add New Board Page'}
            className="p-1 rounded-lg hover:bg-accent hover:text-on-accent text-accent transition-all cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="h-5 w-px bg-line mx-0.5" />

        {/* Export Lecture Button & Menu */}
        <div className="relative" ref={exportMenuRef}>
          <button
            type="button"
            onClick={() => setIsExportOpen((prev) => !prev)}
            title={lang === 'ar' ? 'تصدير ملخص المحاضرة (PDF / صورة)' : 'Export Lecture (PDF / Image)'}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isExportOpen
                ? 'bg-accent text-on-accent border-accent shadow-md'
                : 'hover:bg-hover border-line text-ink-muted hover:text-ink'
            }`}
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          </button>

          {/* Export Dropdown Popover */}
          {isExportOpen && (
            <div
              dir={isRtl ? 'rtl' : 'ltr'}
              className="absolute bottom-full mb-3 rtl:right-0 ltr:left-0 z-50 w-60 rounded-2xl bg-surface border border-line shadow-2xl p-2 space-y-1 text-start backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="px-2.5 py-1.5 text-[11px] font-bold text-ink-muted border-b border-line">
                {lang === 'ar' ? 'تصدير وحفظ المحاضرة' : 'Export Lecture'}
              </div>

              {/* Option 1: PDF Export (All Pages) */}
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={isExporting}
                className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-hover text-ink text-xs transition-colors cursor-pointer text-start"
              >
                <div className="w-7 h-7 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-bold">
                    {lang === 'ar' ? 'ملف PDF لجميع الصفحات' : 'All Pages as PDF'}
                  </span>
                  <span className="text-[10px] text-ink-muted truncate">
                    {lang === 'ar' ? `${pages.length} صفحات مجمعة بدقة عالية` : `${pages.length} combined vector pages`}
                  </span>
                </div>
              </button>

              {/* Option 2: Current Page PNG */}
              <button
                type="button"
                onClick={handleExportPng}
                disabled={isExporting}
                className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-hover text-ink text-xs transition-colors cursor-pointer text-start"
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-bold">
                    {lang === 'ar' ? 'صورة الصفحة الحالية (PNG)' : 'Current Page Image (PNG)'}
                  </span>
                  <span className="text-[10px] text-ink-muted truncate">
                    {lang === 'ar' ? 'صورة عالية النقاء للمشاركة الفورية' : 'High-res image for quick sharing'}
                  </span>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Area Clip Button: Crop diagram from PDF to Board */}
        {onRequestAreaClip && (
          <button
            type="button"
            onClick={onRequestAreaClip}
            title={lang === 'ar' ? 'قص مسألة أو رسم من الكتاب وإلصاقه على السبورة' : 'Crop Area from PDF to Board'}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-accent/15 border border-accent/30 text-accent text-xs font-semibold hover:bg-accent hover:text-on-accent transition-all cursor-pointer"
          >
            <Crop className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{lang === 'ar' ? 'قص من الكتاب' : 'Clip PDF'}</span>
          </button>
        )}

        <div className="h-5 w-px bg-line mx-0.5" />

        {/* Undo / Redo */}
        <button
          type="button"
          onClick={handleUndo}
          disabled={strokes.length === 0}
          title={lang === 'ar' ? 'تراجع' : 'Undo'}
          className="p-1.5 rounded-xl hover:bg-hover disabled:opacity-30 disabled:pointer-events-none text-ink-muted hover:text-ink transition-colors cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleRedo}
          disabled={redoStack.length === 0}
          title={lang === 'ar' ? 'إعادة' : 'Redo'}
          className="p-1.5 rounded-xl hover:bg-hover disabled:opacity-30 disabled:pointer-events-none text-ink-muted hover:text-ink transition-colors cursor-pointer"
        >
          <RotateCw className="w-4 h-4" />
        </button>

        {/* Clear All */}
        <button
          type="button"
          onClick={handleClearAll}
          disabled={strokes.length === 0}
          title={lang === 'ar' ? 'مسح الصفحة الحالية' : 'Clear Current Page'}
          className="p-1.5 rounded-xl hover:bg-hover disabled:opacity-30 disabled:pointer-events-none text-ink-muted hover:text-danger-ink transition-colors cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        {onCloseBoard && (
          <>
            <div className="h-5 w-px bg-line mx-0.5" />
            <button
              type="button"
              onClick={onCloseBoard}
              title={lang === 'ar' ? 'إغلاق شاشة السبورة' : 'Close Board'}
              className="p-1.5 rounded-xl hover:bg-hover text-ink-muted hover:text-ink transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
