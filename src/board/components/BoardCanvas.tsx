import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTeaching } from '../../components/teachingContextValue';

import type { BoardBackground, BoardPageData, BoardSnippet, BoardStroke, BoardTool } from '../types';
import type { Language } from '../../core/i18n/translations';
import {
  computeDraggedSnippetCoords,
  observeBoardStageResize,
  startBoardLaserLoop,
  syncBoardCanvasDimensions,
} from '../utils/boardCanvasDom';
import { boardAppearance } from '../utils/boardAppearance';
import { drawBoardInk } from '../utils/boardInk';
import { type LaserPoint } from '../utils/laserTrail';
import { BoardSnippetOverlay } from './BoardSnippetOverlay';
import { useBoardLiveInk } from './useBoardLiveInk';
import { useBoardPersistence } from './useBoardPersistence';
import { useBoardActions } from './useBoardActions';
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
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const laserCanvasRef = useRef<HTMLCanvasElement>(null);
  const { prefs, registerBoard, target, presentation } = useTeaching();
  const [drawingRevision, setDrawingRevision] = useState(0);
  const [undoStack, setUndoStack] = useState<BoardStroke[][]>([]);
  const [pages, setPages] = useState<BoardPageData[]>([
    { id: 'page-1', strokes: [], redoStack: [], background: 'white' },
  ]);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const stylusOnly = prefs.stylusOnly;
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [activeTool, setActiveTool] = useState<BoardTool>('hand');
  const [background, setBackground] = useState<BoardBackground>('white');
  const [colorOverride, setColorOverride] = useState<{ base: string; value: string } | null>(null);
  const [widthOverride, setWidthOverride] = useState<{ base: number; value: number } | null>(null);
  const [strokes, setStrokes] = useState<BoardStroke[]>([]);
  const [redoStack, setRedoStack] = useState<BoardStroke[][]>([]);
  const appearance = boardAppearance(background, theme, prefs.boardFollowTheme, prefs.boardColor);
  const isDarkBg = appearance.dark;
  const laserTrailRef = useRef<LaserPoint[]>([]);
  const [draggingSnippetId, setDraggingSnippetId] = useState<string | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rawSelectedColor = colorOverride?.base === prefs.color ? colorOverride.value : prefs.color;
  const selectedColor =
    isDarkBg && rawSelectedColor === '#111827'
      ? '#f8fafc'
      : !isDarkBg && rawSelectedColor === '#f8fafc'
        ? '#111827'
        : rawSelectedColor;
  const selectedWidth = widthOverride?.base === prefs.width ? widthOverride.value : prefs.width;
  const syncedPages = useMemo(
    () =>
      pages.map((page, index) =>
        index === currentPageIndex ? { ...page, strokes, redoStack, undoStack, background } : page
      ),
    [pages, currentPageIndex, strokes, redoStack, undoStack, background]
  );

  // Use a temporary setter indirection so persistence and live-ink hooks break their cyclic ref cleanly
  const isDrawingRefBridge = useRef(false);
  const { ready, status, error, setStatus, setError } = useBoardPersistence({
    documentId,
    lang,
    snippets,
    syncedPages,
    currentPageIndex,
    drawingRevision,
    isDrawingRef: isDrawingRefBridge,
    draggingSnippetId,
    onRestoreSnippets,
    setPages,
    setCurrentPageIndex,
    setStrokes,
    setRedoStack,
    setUndoStack,
    setBackground,
  });

  const {
    liveStrokeRef,
    strokeRectRef,
    isDrawingRef,
    clearLiveCanvas,
    paintLiveStroke,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useBoardLiveInk({
    stageRef,
    canvasRef,
    liveCanvasRef,
    ready,
    target,
    presentation,
    activeTool,
    stylusOnly,
    isDarkBg,
    selectedColor,
    selectedWidth,
    strokes,
    setStrokes,
    setUndoStack,
    setRedoStack,
    setDrawingRevision,
    laserTrailRef,
  });

  useLayoutEffect(() => {
    isDrawingRefBridge.current = isDrawingRef.current;
  });

  const setSelectedColor = useCallback((color: string) => {
    setColorOverride({ base: prefs.color, value: color });
  }, [prefs.color]);

  const setSelectedWidth = useCallback((width: number) => {
    setWidthOverride({ base: prefs.width, value: width });
  }, [prefs.width]);

  const paintStrokesRef = useRef<BoardStroke[]>([]);
  useLayoutEffect(() => {
    paintStrokesRef.current = strokes;
  }, [strokes]);

  // Repaint all vector strokes with Bézier curves
  const repaintAllStrokes = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(canvas.width / 1920, canvas.height / 1080);
    drawBoardInk(ctx, paintStrokesRef.current, isDarkBg);

    ctx.restore();
    if (!liveStrokeRef.current) {
      clearLiveCanvas();
    } else {
      paintLiveStroke();
    }
  }, [clearLiveCanvas, paintLiveStroke, isDarkBg, liveStrokeRef]);

  // Sync canvas size with high DPI pixel ratio and observe container resizing
  const syncCanvasDimensions = useCallback(() => {
    syncBoardCanvasDimensions({
      canvas: canvasRef.current,
      liveCanvas: liveCanvasRef.current,
      laserCanvas: laserCanvasRef.current,
      container: stageRef.current,
      dpr: window.devicePixelRatio || 1,
      onClearRectCache: () => {
        strokeRectRef.current = null;
      },
      onRepaintAll: repaintAllStrokes,
    });
  }, [repaintAllStrokes, strokeRectRef]);

  useLayoutEffect(() => {
    syncCanvasDimensions();
    const container = stageRef.current;
    if (!container) return;
    return observeBoardStageResize(container, syncCanvasDimensions);
  }, [syncCanvasDimensions]);

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(repaintAllStrokes);
    return () => cancelAnimationFrame(frame);
  }, [repaintAllStrokes]);

  // Laser loop animation (only runs while laser tool is active)
  useEffect(() => {
    return startBoardLaserLoop(
      laserCanvasRef.current,
      activeTool === 'laser' && target === 'board' && !presentation,
      laserTrailRef
    );
  }, [activeTool, target, presentation]);

  const {
    handleUndo,
    handleRedo,
    handleClearAll,
    handleSwitchPage,
    handleAddPage,
    handleExportPdf,
    handleExportPng,
  } = useBoardActions({
    pages,
    setPages,
    currentPageIndex,
    setCurrentPageIndex,
    strokes,
    setStrokes,
    undoStack,
    setUndoStack,
    redoStack,
    setRedoStack,
    background,
    setBackground,
    laserTrailRef,
    theme,
    boardFollowTheme: prefs.boardFollowTheme,
    boardColor: prefs.boardColor,
    appearanceColor: appearance.color,
    snippets,
    setIsExporting,
    setStatus,
    setError,
  });

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
    } catch (err) {
      console.debug('[BoardCanvas] setPointerCapture skipped:', err);
    }
  };

  const handleSnippetPointerMove = (id: string, e: React.PointerEvent) => {
    if (draggingSnippetId !== id) return;
    const { x, y } = computeDraggedSnippetCoords({
      stageRect: stageRef.current!.getBoundingClientRect(),
      clientX: e.clientX,
      clientY: e.clientY,
      offset: dragOffsetRef.current,
      snippet: snippets.find((s) => s.id === id),
    });
    onUpdateSnippetPosition(id, x, y);
  };

  const handleSnippetPointerUp = (id: string, e: React.PointerEvent) => {
    if (draggingSnippetId === id) {
      setDraggingSnippetId(null);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {
        console.debug('[BoardCanvas] releasePointerCapture skipped:', err);
      }
    }
  };

  useLayoutEffect(() => {
    registerBoard({
      ready,
      tool: activeTool,
      color: selectedColor,
      width: selectedWidth,
      background,
      isDark: isDarkBg,
      page: currentPageIndex + 1,
      pages: syncedPages.length,
      canUndo: !!undoStack.length,
      canRedo: !!redoStack.length,
      exporting: isExporting,
      status,
      error,
      setTool: setActiveTool,
      setColor: setSelectedColor,
      setWidth: setSelectedWidth,
      setBackground,
      undo: handleUndo,
      redo: handleRedo,
      clear: handleClearAll,
      addPage: handleAddPage,
      goToPage: (page) => handleSwitchPage(page - 1),
      exportPdf: () => void handleExportPdf(),
      exportPng: () => void handleExportPng(),
      clip: () => onRequestAreaClip?.(),
    });
  }, [
    ready,
    activeTool,
    selectedColor,
    selectedWidth,
    background,
    currentPageIndex,
    syncedPages.length,
    undoStack.length,
    redoStack.length,
    isExporting,
    status,
    error,
    registerBoard,
    setSelectedColor,
    setSelectedWidth,
    handleUndo,
    handleRedo,
    handleClearAll,
    handleAddPage,
    handleSwitchPage,
    handleExportPdf,
    handleExportPng,
    onRequestAreaClip,
    isDarkBg,
  ]);
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

      {/* Live 120Hz Active Stroke Overlay (avoids full-board repaints per sample) */}
      <canvas
        ref={liveCanvasRef}
        className="absolute inset-0 pointer-events-none z-[11]"
      />

      {/* Floating Laser Trail Overlay */}
      <canvas
        ref={laserCanvasRef}
        className="absolute inset-0 pointer-events-none z-20"
      />

      {/* Pinned PDF Snippets (Cards & Diagrams) */}
      <BoardSnippetOverlay
        lang={lang}
        snippets={snippets}
        presentation={presentation}
        onRemoveSnippet={onRemoveSnippet}
        onPointerDown={handleSnippetPointerDown}
        onPointerMove={handleSnippetPointerMove}
        onPointerUp={handleSnippetPointerUp}
      />
    </div>
  );
};
