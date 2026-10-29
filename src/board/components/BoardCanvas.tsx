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
import { recognizeGeometricShape } from '../utils/shapeRecognition';

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

// Curated academic pigment palette
const LIGHT_COLORS = ['#111827', '#1d4ed8', '#be123c', '#047857'];
const DARK_COLORS = ['#f8fafc', '#38bdf8', '#fb7185', '#34d399'];

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
  const [selectedColor, setSelectedColor] = useState<string>('#111827');
  const [selectedWidth, setSelectedWidth] = useState<number>(4);

  const [strokes, setStrokes] = useState<BoardStroke[]>([]);
  const [redoStack, setRedoStack] = useState<BoardStroke[][]>([]);
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<StrokePoint[]>([]);

  // Shape Recognition Draw & Hold refs
  const shapeHoldTimerRef = useRef<number | null>(null);
  const lastStationaryCoordRef = useRef<{ x: number; y: number } | null>(null);
  const isShapeSnappedRef = useRef<boolean>(false);

  const cancelShapeHoldTimer = useCallback(() => {
    if (shapeHoldTimerRef.current !== null) {
      window.clearTimeout(shapeHoldTimerRef.current);
      shapeHoldTimerRef.current = null;
    }
  }, []);

  const checkAndSnapShape = useCallback(() => {
    if (!isDrawingRef.current || isShapeSnappedRef.current) return;
    const pts = currentPointsRef.current;
    if (pts.length < 5) return;

    const recognized = recognizeGeometricShape(pts);
    if (recognized) {
      if ('vibrate' in navigator) {
        try {
          navigator.vibrate(18);
        } catch {}
      }
      isShapeSnappedRef.current = true;
      currentPointsRef.current = recognized.points;

      setStrokes((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        return [...prev.slice(0, -1), { ...last, points: recognized.points }];
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelShapeHoldTimer();
    };
  }, [cancelShapeHoldTimer]);

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
    if (isDarkBg && selectedColor === '#111827') {
      setSelectedColor('#f8fafc');
    } else if (!isDarkBg && selectedColor === '#f8fafc') {
      setSelectedColor('#111827');
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
        ctx.globalCompositeOperation = isDarkBg ? 'screen' : 'multiply';
        ctx.strokeStyle = stroke.color || (isDarkBg ? 'rgba(250, 204, 21, 0.45)' : 'rgba(250, 204, 21, 0.65)');
        ctx.lineWidth = stroke.width || 24;
        ctx.globalAlpha = isDarkBg ? 0.45 : 0.65;
      } else {
        ctx.globalCompositeOperation = 'source-over';
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
  }, [strokes, isDarkBg]);

  // Sync canvas size with high DPI pixel ratio and observe container resizing
  const syncCanvasDimensions = useCallback(() => {
    const canvas = canvasRef.current;
    const laserCanvas = laserCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !laserCanvas || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
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
  }, [repaintAllStrokes]);

  useLayoutEffect(() => {
    syncCanvasDimensions();
    const container = containerRef.current;
    if (!container) return;

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        syncCanvasDimensions();
      });
      resizeObserver.observe(container);
    }

    const handleResize = () => {
      syncCanvasDimensions();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [syncCanvasDimensions]);

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
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}

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
    isShapeSnappedRef.current = false;
    lastStationaryCoordRef.current = { x: coords.x, y: coords.y };
    cancelShapeHoldTimer();

    if (activeTool === 'pen' || activeTool === 'highlighter') {
      shapeHoldTimerRef.current = window.setTimeout(checkAndSnapShape, 550);
    }

    const newStroke: BoardStroke = {
      id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      points: [coords],
      color:
        activeTool === 'highlighter'
          ? isDarkBg
            ? 'rgba(250, 204, 21, 0.45)'
            : 'rgba(250, 204, 21, 0.65)'
          : selectedColor,
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

    if (isShapeSnappedRef.current) return;

    // Reset hold timer if pointer moved significantly (> 12px)
    if (lastStationaryCoordRef.current) {
      const distMoved = Math.hypot(
        coords.x - lastStationaryCoordRef.current.x,
        coords.y - lastStationaryCoordRef.current.y
      );
      if (distMoved > 12) {
        lastStationaryCoordRef.current = { x: coords.x, y: coords.y };
        cancelShapeHoldTimer();
        if (activeTool === 'pen' || activeTool === 'highlighter') {
          shapeHoldTimerRef.current = window.setTimeout(checkAndSnapShape, 550);
        }
      }
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

    currentPointsRef.current.push(...newPoints);

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
    cancelShapeHoldTimer();
    isShapeSnappedRef.current = false;

    if (stylusOnly && e.pointerType === 'touch') {
      return;
    }

    const canvas = canvasRef.current;
    try {
      if (canvas && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch {}
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
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
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
        className="absolute inset-0 cursor-crosshair z-10 touch-none select-none"
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

      {/* Floating Zen Whiteboard Studio Dock */}
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-surface/85 border border-line/70 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.18)] ring-1 ring-white/10 text-ink max-w-[96vw] overflow-x-auto select-none"
      >
        {/* Tool Segmented Group */}
        <div className="flex items-center gap-1 bg-hover-subtle/70 rounded-xl p-0.5 border border-line/50">
          {/* Pen Tool */}
          <button
            type="button"
            onClick={() => setActiveTool('pen')}
            title={lang === 'ar' ? 'قلم الكتابة الحبري' : 'Inking Pen'}
            className={`p-2 rounded-lg transition-all cursor-pointer ${
              activeTool === 'pen'
                ? 'bg-surface text-accent shadow-xs scale-102 font-bold'
                : 'text-ink-muted hover:text-ink hover:bg-hover'
            }`}
          >
            <Pen className="w-4 h-4" />
          </button>

          {/* Highlighter Tool */}
          <button
            type="button"
            onClick={() => setActiveTool('highlighter')}
            title={lang === 'ar' ? 'تظليل فسفوري مضاعف' : 'Highlighter'}
            className={`p-2 rounded-lg transition-all cursor-pointer ${
              activeTool === 'highlighter'
                ? 'bg-amber-500 text-white shadow-xs scale-102 font-bold'
                : 'text-ink-muted hover:text-ink hover:bg-hover'
            }`}
          >
            <Highlighter className="w-4 h-4" />
          </button>

          {/* Eraser Tool */}
          <button
            type="button"
            onClick={() => setActiveTool('eraser')}
            title={lang === 'ar' ? 'ممحاة المسارات الذكية' : 'Stroke Eraser'}
            className={`p-2 rounded-lg transition-all cursor-pointer ${
              activeTool === 'eraser'
                ? 'bg-rose-500 text-white shadow-xs scale-102 font-bold'
                : 'text-ink-muted hover:text-ink hover:bg-hover'
            }`}
          >
            <Eraser className="w-4 h-4" />
          </button>

          {/* Digital Laser Pointer */}
          <button
            type="button"
            onClick={() => setActiveTool('laser')}
            title={lang === 'ar' ? 'مؤشر ليزر للشرح التفاعلي' : 'Laser Pointer'}
            className={`p-2 rounded-lg transition-all cursor-pointer ${
              activeTool === 'laser'
                ? 'bg-red-600 text-white shadow-xs shadow-red-500/30 scale-102 font-bold'
                : 'text-ink-muted hover:text-ink hover:bg-hover'
            }`}
          >
            <Pointer className="w-4 h-4" />
          </button>
        </div>

        {/* Color Palette (Active only when Pen is active) */}
        {activeTool === 'pen' && (
          <>
            <div className="h-5 w-px bg-line/60 mx-0.5" />
            <div className="flex items-center gap-1.5 px-1 bg-hover-subtle/50 rounded-xl py-1 border border-line/40">
              {palette.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  style={{ backgroundColor: color }}
                  className={`w-4 h-4 rounded-full transition-all cursor-pointer ${
                    selectedColor === color
                      ? 'scale-125 ring-2 ring-accent ring-offset-2 ring-offset-surface shadow-xs'
                      : 'hover:scale-110 opacity-80 hover:opacity-100'
                  }`}
                />
              ))}
            </div>

            {/* Visual Pen Stroke Width Dots */}
            <div className="flex items-center gap-1 bg-hover-subtle/70 rounded-xl p-0.5 border border-line/50">
              {PEN_WIDTHS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setSelectedWidth(w.value)}
                  title={w.label}
                  className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                    selectedWidth === w.value
                      ? 'bg-surface text-accent shadow-xs'
                      : 'hover:bg-hover text-ink-muted hover:text-ink'
                  }`}
                >
                  <span
                    style={{ width: `${w.value * 0.9 + 1}px`, height: `${w.value * 0.9 + 1}px` }}
                    className="rounded-full bg-current"
                  />
                </button>
              ))}
            </div>
          </>
        )}

        <div className="h-5 w-px bg-line/60 mx-0.5" />

        {/* Background Style Switcher */}
        <div className="flex items-center gap-1 bg-hover-subtle/50 rounded-xl p-0.5 border border-line/50 text-[11px]">
          <button
            type="button"
            onClick={() => setBackground('white')}
            title={lang === 'ar' ? 'ورقة بيضاء نقية' : 'Plain White'}
            className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
              background === 'white'
                ? 'bg-surface border border-line/70 text-accent font-bold shadow-xs'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {lang === 'ar' ? 'بيضاء' : 'White'}
          </button>
          <button
            type="button"
            onClick={() => setBackground('grid')}
            title={lang === 'ar' ? 'شبكة مربعات هندسية' : 'Math Grid'}
            className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
              background === 'grid'
                ? 'bg-surface border border-line/70 text-accent font-bold shadow-xs'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {lang === 'ar' ? 'مربعات' : 'Grid'}
          </button>
          <button
            type="button"
            onClick={() => setBackground('ruled')}
            title={lang === 'ar' ? 'أسطر دفتر مسطرة' : 'Ruled Lines'}
            className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
              background === 'ruled'
                ? 'bg-surface border border-line/70 text-accent font-bold shadow-xs'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {lang === 'ar' ? 'مسطر' : 'Ruled'}
          </button>
          <button
            type="button"
            onClick={() => setBackground('dark')}
            title={lang === 'ar' ? 'سبورة داكنة عالية التباين' : 'Dark Slate'}
            className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
              background === 'dark'
                ? 'bg-slate-800 border border-slate-700 text-white font-bold shadow-xs'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {lang === 'ar' ? 'داكنة' : 'Dark'}
          </button>
        </div>

        <div className="h-5 w-px bg-line/60 mx-0.5" />

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
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer ${
            stylusOnly
              ? 'bg-accent/15 border-accent text-accent font-bold shadow-xs'
              : 'border-line/60 hover:bg-hover text-ink-muted hover:text-ink'
          }`}
        >
          <Hand className={`w-3.5 h-3.5 ${stylusOnly ? 'text-accent' : 'text-ink-muted'}`} />
          <span className="text-[11px] hidden md:inline">
            {lang === 'ar' ? (stylusOnly ? 'قلم حصري' : 'لمس حر') : (stylusOnly ? 'Stylus' : 'Touch')}
          </span>
          {stylusOnly && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />}
        </button>

        <div className="h-5 w-px bg-line/60 mx-0.5" />

        {/* Multi-Page Whiteboard Navigator [ ‹  1 / 3  ›  + ] */}
        <div className="flex items-center gap-1 bg-hover-subtle/70 px-1.5 py-1 rounded-xl border border-line/60">
          <button
            type="button"
            onClick={() => handleSwitchPage(currentPageIndex - 1)}
            disabled={currentPageIndex <= 0}
            title={lang === 'ar' ? 'الصفحة السابقة' : 'Previous Board Page'}
            className="p-1 rounded-lg hover:bg-surface disabled:opacity-25 disabled:pointer-events-none text-ink-muted hover:text-ink transition-colors cursor-pointer"
          >
            {isRtl ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>

          <span className="text-xs font-mono font-bold text-ink px-1.5 min-w-[36px] text-center tracking-tight">
            {currentPageIndex + 1} / {pages.length}
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
            className="p-1 rounded-lg hover:bg-accent hover:text-on-accent text-accent transition-all cursor-pointer disabled:opacity-25 disabled:pointer-events-none"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="h-5 w-px bg-line/60 mx-0.5" />

        {/* Export Lecture Button & Menu */}
        <div className="relative" ref={exportMenuRef}>
          <button
            type="button"
            onClick={() => setIsExportOpen((prev) => !prev)}
            title={lang === 'ar' ? 'تصدير وحفظ المحاضرة' : 'Export Lecture'}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isExportOpen
                ? 'bg-accent text-on-accent border-accent shadow-md scale-102'
                : 'hover:bg-hover border-line/60 text-ink-muted hover:text-ink'
            }`}
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          </button>

          {/* Export Dropdown Popover */}
          {isExportOpen && (
            <div
              dir={isRtl ? 'rtl' : 'ltr'}
              className="absolute bottom-full mb-3 rtl:right-0 ltr:left-0 z-50 w-64 rounded-2xl bg-surface/95 border border-line/80 shadow-[0_20px_50px_rgba(0,0,0,0.2)] p-2 space-y-1 text-start backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="px-2.5 py-1.5 text-[11px] font-bold text-ink-muted border-b border-line/60 tracking-tight">
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
                  <span className="font-bold tracking-tight">
                    {lang === 'ar' ? 'ملف PDF لجميع الصفحات' : 'All Pages as PDF'}
                  </span>
                  <span className="text-[10px] text-ink-muted truncate">
                    {lang === 'ar' ? `${pages.length} صفحات مجمعة بدقة عالية` : `${pages.length} vector pages combined`}
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
                  <span className="font-bold tracking-tight">
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
            <span className="hidden sm:inline">{lang === 'ar' ? 'قص من الكتاب' : 'Clip'}</span>
          </button>
        )}

        <div className="h-5 w-px bg-line/60 mx-0.5" />

        {/* Undo / Redo */}
        <button
          type="button"
          onClick={handleUndo}
          disabled={strokes.length === 0}
          title={lang === 'ar' ? 'تراجع' : 'Undo'}
          className="p-1.5 rounded-xl hover:bg-hover disabled:opacity-25 disabled:pointer-events-none text-ink-muted hover:text-ink transition-colors cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleRedo}
          disabled={redoStack.length === 0}
          title={lang === 'ar' ? 'إعادة' : 'Redo'}
          className="p-1.5 rounded-xl hover:bg-hover disabled:opacity-25 disabled:pointer-events-none text-ink-muted hover:text-ink transition-colors cursor-pointer"
        >
          <RotateCw className="w-4 h-4" />
        </button>

        {/* Clear All */}
        <button
          type="button"
          onClick={handleClearAll}
          disabled={strokes.length === 0}
          title={lang === 'ar' ? 'مسح الصفحة الحالية' : 'Clear Current Page'}
          className="p-1.5 rounded-xl hover:bg-hover disabled:opacity-25 disabled:pointer-events-none text-ink-muted hover:text-danger-ink transition-colors cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        {onCloseBoard && (
          <>
            <div className="h-5 w-px bg-line/60 mx-0.5" />
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
