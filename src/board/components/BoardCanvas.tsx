import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Move, X } from 'lucide-react';
import { useTeaching, type SaveStatus } from '../../components/TeachingContext';
import { readBoard, writeBoard } from '../utils/boardStorage';

import type { BoardBackground, BoardPageData, BoardSnippet, BoardStroke, BoardTool, StrokePoint } from '../types';
import type { Language } from '../../core/i18n/translations';
import { exportAllPagesToPdf, exportPageToPng, type ExportableBoardPage } from '../utils/boardExport';
import { recognizeGeometricShape } from '../utils/shapeRecognition';
import { boardAppearance, boardRasterSize } from '../utils/boardAppearance';
import { drawBoardInk } from '../utils/boardInk';
import type { ThemeMode } from '../../core/types';

interface BoardCanvasProps {
  lang: Language;
  theme?: ThemeMode;
  snippets: BoardSnippet[];
  onRemoveSnippet: (id: string) => void;
  onUpdateSnippetPosition: (id: string, x: number, y: number) => void;
  onRequestAreaClip?: () => void;
  documentId: string;
  onRestoreSnippets: (snippets: BoardSnippet[]) => void;
}


// Curated academic pigment palette

export const BoardCanvas: React.FC<BoardCanvasProps> = ({
  lang,
  theme = 'paper',
  snippets,
  onRemoveSnippet,
  onUpdateSnippetPosition,
  onRequestAreaClip,
  documentId,
  onRestoreSnippets
}) => {
  // Keep logical coordinates stable while allowing the board to use the
  // whole pane assigned to it, including a narrow split-screen pane.
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const laserCanvasRef = useRef<HTMLCanvasElement>(null);
  const { prefs, registerBoard, target, presentation } = useTeaching();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [error, setError] = useState('');
  const saveQueue = useRef(Promise.resolve());
  const [drawingRevision, setDrawingRevision] = useState(0);
  const pointer = useRef<number | null>(null);
  const lastPen = useRef(0);
  const [undoStack, setUndoStack] = useState<BoardStroke[][]>([]);

  // Multi-page state
  const [pages, setPages] = useState<BoardPageData[]>([
    { id: 'page-1', strokes: [], redoStack: [], background: 'white' }
  ]);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);

  // Palm rejection state (Stylus only mode)
  const stylusOnly = prefs.stylusOnly;

  // Export popover state
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const [activeTool, setActiveTool] = useState<BoardTool>('hand');
  const [background, setBackground] = useState<BoardBackground>('white');
  const [selectedColor, setSelectedColor] = useState<string>(prefs.color);
  const [selectedWidth, setSelectedWidth] = useState<number>(prefs.width);

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

  const appearance = boardAppearance(background, theme, prefs.boardFollowTheme, prefs.boardColor);
  const isDarkBg = appearance.dark;
  const paintState = useRef({ strokes, isDarkBg });
  useLayoutEffect(() => { paintState.current = { strokes, isDarkBg }; }, [strokes, isDarkBg]);
  useEffect(() => { setSelectedColor(prefs.color); setSelectedWidth(prefs.width); }, [prefs.color, prefs.width]);


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

  // Repaint all vector strokes with Bézier curves
  const repaintAllStrokes = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(canvas.width / 1920, canvas.height / 1080);
    drawBoardInk(ctx, paintState.current.strokes, paintState.current.isDarkBg);

    ctx.restore();
  }, []);

  // Sync canvas size with high DPI pixel ratio and observe container resizing
  const syncCanvasDimensions = useCallback(() => {
    const canvas = canvasRef.current;
    const laserCanvas = laserCanvasRef.current;
    const container = stageRef.current;
    if (!canvas || !laserCanvas || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const raster = boardRasterSize(rect.width, rect.height, window.devicePixelRatio || 1);

    if (canvas.width === raster.width && canvas.height === raster.height) return;
    canvas.width = raster.width;
    canvas.height = raster.height;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    laserCanvas.width = raster.width;
    laserCanvas.height = raster.height;
    laserCanvas.style.width = `${rect.width}px`;
    laserCanvas.style.height = `${rect.height}px`;

    repaintAllStrokes();
  }, [repaintAllStrokes]);

  useLayoutEffect(() => {
    syncCanvasDimensions();
    const container = stageRef.current;
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

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(repaintAllStrokes);
    return () => cancelAnimationFrame(frame);
  }, [strokes, isDarkBg, repaintAllStrokes]);

  // Laser loop animation
  useEffect(() => {
    const laserCanvas = laserCanvasRef.current;
    if (!laserCanvas) return;
    const ctx = laserCanvas.getContext('2d');
    if (!ctx) return;

    // Do not redraw an idle board at 60fps. The animation exists only while
    // the laser is actually in use.
    if (activeTool !== 'laser' || target !== 'board' || presentation) {
      ctx.clearRect(0, 0, laserCanvas.width, laserCanvas.height);
      return;
    }

    const renderLaser = () => {
      const now = performance.now();
      const trail = laserTrailRef.current;

      while (trail.length > 0 && now - trail[0].time > 1100) {
        trail.shift();
      }

      ctx.clearRect(0, 0, laserCanvas.width, laserCanvas.height);

      if (trail.length > 0) {
        ctx.save();
        ctx.scale(laserCanvas.width / 1920, laserCanvas.height / 1080);
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
  }, [activeTool, target, presentation]);

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
      x: (e.clientX - rect.left) * 1920 / rect.width,
      y: (e.clientY - rect.top) * 1080 / rect.height,
      pressure: e.pressure || 0.5
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ready || target !== 'board' || presentation || activeTool === 'hand') return;
    if (e.pointerType === 'pen') lastPen.current = Date.now();
    if (e.pointerType === 'touch' && (e.width > 35 || e.height > 35 || Date.now() - lastPen.current < 800)) return;
    if (pointer.current !== null) return;
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

    pointer.current = e.pointerId;
    setUndoStack(prev => [...prev, strokes].slice(-60));
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
      color: selectedColor,
      width: activeTool === 'highlighter' ? selectedWidth * 6 : selectedWidth,
      tool: activeTool === 'highlighter' ? 'highlighter' : 'pen'
    };

    setStrokes((prev) => [...prev, newStroke]);
    setRedoStack([]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'pen') lastPen.current = Date.now();
    if (pointer.current !== e.pointerId) return;
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
    const samples = (e.nativeEvent as any).getCoalescedEvents
      ? ((e.nativeEvent as any).getCoalescedEvents() as PointerEvent[])
      : [e.nativeEvent];

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const coalesced = samples.length ? samples : [e.nativeEvent];
    const newPoints: StrokePoint[] = coalesced.map((pe) => ({
      x: (pe.clientX - rect.left) * 1920 / rect.width,
      y: (pe.clientY - rect.top) * 1080 / rect.height,
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
    if (pointer.current !== e.pointerId) return;
    pointer.current = null;
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
    setDrawingRevision(value => value + 1);
  };

  // Full snapshots make erasing and clear-all undoable as one action.
  const handleUndo = () => {
    if (!undoStack.length) return;
    setStatus('saving');
    setRedoStack(prev => [strokes, ...prev].slice(0, 60));
    setStrokes(undoStack[undoStack.length - 1]); setUndoStack(prev => prev.slice(0, -1));
  };
  const handleRedo = () => {
    if (!redoStack.length) return;
    setStatus('saving');
    setUndoStack(prev => [...prev, strokes].slice(-60));
    setStrokes(redoStack[0]); setRedoStack(prev => prev.slice(1));
  };
  const handleClearAll = () => {
    if (!strokes.length) return;
    setStatus('saving');
    setUndoStack(prev => [...prev, strokes].slice(-60)); setRedoStack([]); setStrokes([]);
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
      undoStack,
      background
    };
    setPages(updatedPages);

    // 2. Load target page
    const target = updatedPages[targetIndex];
    setStrokes(target.strokes);
    setRedoStack(target.redoStack);
    setUndoStack(target.undoStack || []);
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
      undoStack,
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
    setUndoStack([]);
    setRedoStack([]);
    laserTrailRef.current = [];
  };

  // Export Handlers
  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      const w = 1920;
      const h = 1080;

      const pagesToExport: ExportableBoardPage[] = pages.map((p, idx) =>
        idx === currentPageIndex ? { ...p, strokes, background } : p
      );

      await exportAllPagesToPdf(pagesToExport.map(page => ({ ...page, backgroundColor: boardAppearance(page.background, theme, prefs.boardFollowTheme, prefs.boardColor).color })), w, h, snippets);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF export failed');
    } finally {
      setIsExporting(false);

    }
  };

  const handleExportPng = async () => {
    setIsExporting(true);
    try {
      const w = 1920;
      const h = 1080;

      const currentPage: ExportableBoardPage = {
        id: pages[currentPageIndex]?.id || 'page-1',
        strokes,
        background,
        backgroundColor: appearance.color
      };

      await exportPageToPng(currentPage, w, h, snippets, currentPageIndex + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image export failed');
    } finally {
      setIsExporting(false);

    }
  };

  // Snippet Card Dragging
  const handleSnippetPointerDown = (id: string, e: React.PointerEvent) => {
    if (presentation || (e.target as HTMLElement).closest('button')) return;
    e.stopPropagation();
    setDraggingSnippetId(id);
    const snip = snippets.find((s) => s.id === id);
    if (!snip) return;
    const rect = stageRef.current!.getBoundingClientRect();
    dragOffsetRef.current = { x: (e.clientX - rect.left) * 1920 / rect.width - snip.x, y: (e.clientY - rect.top) * 1080 / rect.height - snip.y };
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handleSnippetPointerMove = (id: string, e: React.PointerEvent) => {
    if (draggingSnippetId !== id) return;
    const rect = stageRef.current!.getBoundingClientRect();
    const snip = snippets.find(s => s.id === id);
    const newX = Math.max(10, Math.min(1920 - (snip?.width || 300), (e.clientX - rect.left) * 1920 / rect.width - dragOffsetRef.current.x));
    const newY = Math.max(10, Math.min(1000, (e.clientY - rect.top) * 1080 / rect.height - dragOffsetRef.current.y));
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

  useEffect(() => {
    let alive = true;
    setReady(false); setStatus('loading');
    void readBoard(documentId).then(snapshot => {
      if (!alive) return;
      if (snapshot) {
        const current = snapshot.pages[snapshot.currentPage];
        setPages(snapshot.pages); setCurrentPageIndex(snapshot.currentPage);
        setStrokes(current.strokes); setRedoStack(current.redoStack); setUndoStack(current.undoStack || []); setBackground(current.background);
      }
      onRestoreSnippets(snapshot?.snippets || []);
      setReady(true); setStatus('saved');
    }).catch(() => { if (alive) { setStatus('error'); setError(lang === 'ar' ? 'تعذر تحميل السبورة المحفوظة. أعد فتح الملف.' : 'Saved board could not be loaded. Reopen the document.'); } });
    return () => { alive = false; };
  }, [documentId, onRestoreSnippets]);
  useEffect(() => {
    if (!ready || isDrawingRef.current || draggingSnippetId) return;
    let alive = true;
    const snapshot = { pages: pages.map((page, index) => index === currentPageIndex ? { ...page, strokes, redoStack, undoStack, background } : page), currentPage: currentPageIndex, snippets };
    setStatus('saving');
    saveQueue.current = saveQueue.current.catch(() => {}).then(() => writeBoard(documentId, snapshot));
    void saveQueue.current.then(() => { if (alive) setStatus('saved'); }).catch(() => { if (alive) setStatus('error'); });
    return () => { alive = false; };
  }, [ready, documentId, pages, currentPageIndex, strokes, redoStack, undoStack, background, snippets, drawingRevision, draggingSnippetId]);
  useLayoutEffect(() => {
    registerBoard({ ready, tool: activeTool, color: selectedColor, width: selectedWidth, background, isDark: isDarkBg,
      page: currentPageIndex + 1, pages: pages.length, canUndo: !!undoStack.length, canRedo: !!redoStack.length,
      exporting: isExporting, status, error,
      setTool: setActiveTool, setColor: setSelectedColor, setWidth: setSelectedWidth, setBackground,
      undo: handleUndo, redo: handleRedo, clear: handleClearAll, addPage: handleAddPage,
      goToPage: page => handleSwitchPage(page - 1), exportPdf: () => void handleExportPdf(), exportPng: () => void handleExportPng(), clip: () => onRequestAreaClip?.() });
  }, [ready, activeTool, selectedColor, selectedWidth, background, currentPageIndex, pages, strokes, undoStack, redoStack, isExporting, status, error, snippets, registerBoard, onRequestAreaClip, isDarkBg, appearance.color, theme, prefs.boardFollowTheme, prefs.boardColor]);
  useEffect(() => () => registerBoard(null), [registerBoard]);


  // The dock floats above the workspace. Reserving its whole height here
  // produced a dead strip below the board and made the canvas feel broken.
  return (
    <div
      ref={stageRef}
      data-board-color={appearance.color}
      style={{ height: '100%', backgroundColor: appearance.color, color: isDarkBg ? '#f8fafc' : '#111827',
        backgroundImage: background === 'grid' ? `radial-gradient(${appearance.pattern} 1px, transparent 1px)` : background === 'ruled' ? `linear-gradient(transparent 27px, ${appearance.pattern} 28px)` : 'none',
        backgroundSize: background === 'grid' ? '20px 20px' : '100% 28px' }}
      className="relative w-full h-full select-none overflow-hidden touch-none transition-colors duration-200"
    >
      {/* Interactive Inking Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onLostPointerCapture={handlePointerUp}
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
              left: `${snip.x / 1920 * 100}%`, top: `${snip.y / 1080 * 100}%`,
              width: `${snip.width / 1920 * 100}%`
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
                hidden={presentation}
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
    </div>
  );
};
