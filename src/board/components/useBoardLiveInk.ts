import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import type { BoardStroke, BoardTool, StrokePoint } from '../types';
import { type CoalescedPointerLike, sampleCoalescedBoardPoints } from '../utils/boardCanvasDom';
import { recognizeGeometricShape } from '../utils/shapeRecognition';
import { drawBoardInk, isStrokeNearPoint } from '../utils/boardInk';
import type { LaserPoint } from '../utils/laserTrail';

interface UseBoardLiveInkOptions {
  stageRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  liveCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  ready: boolean;
  target: string;
  presentation: boolean;
  activeTool: BoardTool;
  stylusOnly: boolean;
  isDarkBg: boolean;
  selectedColor: string;
  selectedWidth: number;
  strokes: BoardStroke[];
  setStrokes: React.Dispatch<React.SetStateAction<BoardStroke[]>>;
  setUndoStack: React.Dispatch<React.SetStateAction<BoardStroke[][]>>;
  setRedoStack: React.Dispatch<React.SetStateAction<BoardStroke[][]>>;
  setDrawingRevision: React.Dispatch<React.SetStateAction<number>>;
  laserTrailRef: React.MutableRefObject<LaserPoint[]>;
}

export function useBoardLiveInk({
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
}: UseBoardLiveInkOptions) {
  const liveStrokeRef = useRef<BoardStroke | null>(null);
  const livePaintRafRef = useRef<number | null>(null);
  const strokeRectRef = useRef<DOMRect | null>(null);
  const undoSnapshotRef = useRef<BoardStroke[] | null>(null);
  const erasedInCurrentGestureRef = useRef(false);
  const pointer = useRef<number | null>(null);
  const lastPen = useRef(0);
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<StrokePoint[]>([]);
  const shapeHoldTimerRef = useRef<number | null>(null);
  const lastStationaryCoordRef = useRef<{ x: number; y: number } | null>(null);
  const isShapeSnappedRef = useRef<boolean>(false);

  const cancelShapeHoldTimer = useCallback(() => {
    if (shapeHoldTimerRef.current !== null) {
      window.clearTimeout(shapeHoldTimerRef.current);
      shapeHoldTimerRef.current = null;
    }
  }, []);

  const clearLiveCanvas = useCallback(() => {
    const liveCanvas = liveCanvasRef.current;
    if (!liveCanvas) return;
    const ctx = liveCanvas.getContext('2d');
    ctx?.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
  }, [liveCanvasRef]);

  const paintLiveStroke = useCallback(() => {
    const liveCanvas = liveCanvasRef.current;
    if (!liveCanvas) return;
    const ctx = liveCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
    const liveStroke = liveStrokeRef.current;
    if (!liveStroke) return;
    ctx.save();
    ctx.scale(liveCanvas.width / 1920, liveCanvas.height / 1080);
    drawBoardInk(ctx, [liveStroke], isDarkBg);
    ctx.restore();
  }, [isDarkBg, liveCanvasRef]);

  const scheduleLivePaint = useCallback(() => {
    if (livePaintRafRef.current !== null) return;
    livePaintRafRef.current = requestAnimationFrame(() => {
      livePaintRafRef.current = null;
      paintLiveStroke();
    });
  }, [paintLiveStroke]);

  const checkAndSnapShape = useCallback(() => {
    if (!isDrawingRef.current || isShapeSnappedRef.current || !liveStrokeRef.current) return;
    const pts = currentPointsRef.current;
    if (pts.length < 5) return;

    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    const scaledInput = pts.map((p) => ({
      x: (p.x * rect.width) / 1920,
      y: (p.y * rect.height) / 1080,
      pressure: p.pressure,
    }));
    const recognized = recognizeGeometricShape(scaledInput);
    if (recognized) {
      if ('vibrate' in navigator) {
        try {
          navigator.vibrate(18);
        } catch (err) {
          console.debug('[BoardLiveInk] Haptic vibrate skipped:', err);
        }
      }
      isShapeSnappedRef.current = true;
      const points = recognized.points.map((p) => ({
        ...p,
        x: (p.x * 1920) / rect.width,
        y: (p.y * 1080) / rect.height,
      }));
      currentPointsRef.current = points;
      liveStrokeRef.current = { ...liveStrokeRef.current, points, shape: recognized.type };
      paintLiveStroke();
    }
  }, [paintLiveStroke, stageRef]);

  useEffect(() => {
    return () => {
      cancelShapeHoldTimer();
      if (livePaintRafRef.current !== null) {
        cancelAnimationFrame(livePaintRafRef.current);
        livePaintRafRef.current = null;
      }
    };
  }, [cancelShapeHoldTimer]);

  const eraseStrokesNearPoint = (x: number, y: number, radius = 20) => {
    setStrokes((prevStrokes) => {
      const hasHit = prevStrokes.some((stroke) => isStrokeNearPoint(stroke, x, y, radius));
      if (!hasHit) {
        return prevStrokes;
      }
      if (!erasedInCurrentGestureRef.current && undoSnapshotRef.current) {
        const snapshot = undoSnapshotRef.current;
        setUndoStack((prev) => [...prev, snapshot].slice(-60));
        erasedInCurrentGestureRef.current = true;
      }
      setRedoStack([]);
      return prevStrokes.filter((stroke) => !isStrokeNearPoint(stroke, x, y, radius));
    });
  };

  const getCanvasCoordinates = (e: { clientX: number; clientY: number; pressure?: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const cached = strokeRectRef.current;
    const rect = cached && cached.width > 0 && cached.height > 0 ? cached : canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * 1920) / rect.width,
      y: ((e.clientY - rect.top) * 1080) / rect.height,
      pressure: e.pressure || 0.5,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ready || target !== 'board' || presentation || activeTool === 'hand') return;
    if (e.pointerType === 'pen') lastPen.current = Date.now();
    if (e.pointerType === 'touch' && (!e.isPrimary || e.width > 35 || e.height > 35 || Date.now() - lastPen.current < 800)) return;
    if (pointer.current !== null) return;
    if (stylusOnly && e.pointerType === 'touch') return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      console.debug('[BoardLiveInk] setPointerCapture skipped:', err);
    }

    pointer.current = e.pointerId;
    strokeRectRef.current = canvas.getBoundingClientRect();
    const coords = getCanvasCoordinates(e);

    if (activeTool === 'laser') {
      laserTrailRef.current.push({ x: coords.x, y: coords.y, time: performance.now() });
      return;
    }

    if (activeTool === 'eraser') {
      undoSnapshotRef.current = strokes;
      erasedInCurrentGestureRef.current = false;
      eraseStrokesNearPoint(coords.x, coords.y);
      isDrawingRef.current = true;
      return;
    }

    isDrawingRef.current = true;
    undoSnapshotRef.current = strokes;
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
      tool: activeTool === 'highlighter' ? 'highlighter' : 'pen',
    };

    liveStrokeRef.current = newStroke;
    paintLiveStroke();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'pen') lastPen.current = Date.now();
    if (pointer.current !== e.pointerId) return;
    if (stylusOnly && e.pointerType === 'touch') return;

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

    if (isShapeSnappedRef.current || !liveStrokeRef.current) return;

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

    const canvas = canvasRef.current;
    if (!canvas) return;
    const newPoints = sampleCoalescedBoardPoints(
      e.nativeEvent as CoalescedPointerLike,
      canvas,
      strokeRectRef.current
    );

    currentPointsRef.current.push(...newPoints);
    liveStrokeRef.current.points.push(...newPoints);
    scheduleLivePaint();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointer.current !== e.pointerId) return;
    pointer.current = null;
    cancelShapeHoldTimer();
    isShapeSnappedRef.current = false;
    strokeRectRef.current = null;
    if (livePaintRafRef.current !== null) {
      cancelAnimationFrame(livePaintRafRef.current);
      livePaintRafRef.current = null;
    }

    if (stylusOnly && e.pointerType === 'touch') return;

    const canvas = canvasRef.current;
    try {
      if (canvas && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch (err) {
      console.debug('[BoardLiveInk] releasePointerCapture skipped:', err);
    }
    isDrawingRef.current = false;
    currentPointsRef.current = [];

    const finished = liveStrokeRef.current;
    liveStrokeRef.current = null;
    const prevSnapshot = undoSnapshotRef.current;
    undoSnapshotRef.current = null;
    erasedInCurrentGestureRef.current = false;
    if (finished) {
      if (prevSnapshot) {
        setUndoStack((prev) => [...prev, prevSnapshot].slice(-60));
      }
      setStrokes((prev) => [...prev, finished]);
      setRedoStack([]);
    }
    setDrawingRevision((value) => value + 1);
  };

  return {
    liveStrokeRef,
    strokeRectRef,
    isDrawingRef,
    clearLiveCanvas,
    paintLiveStroke,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
