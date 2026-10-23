import React, { useEffect, useRef, useCallback } from 'react';
import type { DrawingPoint, DrawingStroke, SmartboardTool } from '../types';

interface DrawingOverlayProps {
  pageNumber: number;
  width: number;
  height: number;
  strokes: DrawingStroke[];
  onAddStroke: (stroke: DrawingStroke) => void;
  onDeleteStroke: (strokeId: string) => void;
  isBoardMode: boolean;
  activeTool: SmartboardTool;
  penColor: string;
  penSize: number;
  highlighterColor: string;
  highlighterSize: number;
}

interface LaserPoint {
  x: number;
  y: number;
  time: number;
}

export const DrawingOverlay: React.FC<DrawingOverlayProps> = ({
  pageNumber,
  width,
  height,
  strokes,
  onAddStroke,
  onDeleteStroke,
  isBoardMode,
  activeTool,
  penColor,
  penSize,
  highlighterColor,
  highlighterSize,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const laserCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<DrawingPoint[]>([]);
  const isPalmErasingRef = useRef(false);

  // Laser Pointer State
  const laserPointsRef = useRef<LaserPoint[]>([]);
  const laserAnimFrameRef = useRef<number | null>(null);

  // Normalize point (0 to 1) relative to canvas size
  const getNormalizedPoint = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): DrawingPoint => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) {
        return { x: 0, y: 0, pressure: 0.5 };
      }
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      return {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
        pressure: e.pressure > 0 ? e.pressure : 0.5,
      };
    },
    []
  );

  // Smooth quadratic bezier curve renderer
  const drawStrokeOnCtx = useCallback(
    (ctx: CanvasRenderingContext2D, stroke: DrawingStroke | { tool: string; color: string; size: number; points: DrawingPoint[] }, w: number, h: number) => {
      const pts = stroke.points;
      if (!pts || pts.length === 0) return;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Base scaling relative to a standard 600px width page
      const scaleFactor = Math.max(0.5, w / 600);
      const computedWidth = Math.max(1, stroke.size * scaleFactor);

      if (stroke.tool === 'highlighter') {
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = computedWidth * 2.2;
        ctx.globalAlpha = 0.42;
      } else {
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = computedWidth;
        ctx.globalAlpha = 0.95;
      }

      if (pts.length === 1) {
        const p = pts[0];
        ctx.fillStyle = stroke.color;
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }

      ctx.beginPath();
      ctx.moveTo(pts[0].x * w, pts[0].y * h);

      if (pts.length === 2) {
        ctx.lineTo(pts[1].x * w, pts[1].y * h);
      } else {
        for (let i = 1; i < pts.length - 1; i++) {
          const midX = ((pts[i].x + pts[i + 1].x) / 2) * w;
          const midY = ((pts[i].y + pts[i + 1].y) / 2) * h;
          ctx.quadraticCurveTo(pts[i].x * w, pts[i].y * h, midX, midY);
        }
        const last = pts[pts.length - 1];
        ctx.lineTo(last.x * w, last.y * h);
      }

      ctx.stroke();
      ctx.restore();
    },
    []
  );

  // Redraw main strokes layer
  const redrawAllStrokes = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, width * dpr, height * dpr);

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Draw existing strokes
    for (const stroke of strokes) {
      drawStrokeOnCtx(ctx, stroke, width, height);
    }

    // 2. Draw live stroke if currently drawing
    if (isDrawingRef.current && currentPointsRef.current.length > 0 && !isPalmErasingRef.current) {
      if (activeTool === 'pen' || activeTool === 'highlighter') {
        drawStrokeOnCtx(
          ctx,
          {
            tool: activeTool,
            color: activeTool === 'pen' ? penColor : highlighterColor,
            size: activeTool === 'pen' ? penSize : highlighterSize,
            points: currentPointsRef.current,
          },
          width,
          height
        );
      }
    }

    ctx.restore();
  }, [width, height, strokes, activeTool, penColor, penSize, highlighterColor, highlighterSize, drawStrokeOnCtx]);

  // Sync canvas dimensions and redraw on resize/DPR change
  useEffect(() => {
    const canvas = canvasRef.current;
    const laserCanvas = laserCanvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    if (laserCanvas) {
      laserCanvas.width = Math.round(width * dpr);
      laserCanvas.height = Math.round(height * dpr);
      laserCanvas.style.width = `${width}px`;
      laserCanvas.style.height = `${height}px`;
    }

    redrawAllStrokes();
  }, [width, height, redrawAllStrokes]);

  // Distance from point to line segment
  const checkStrokeHit = useCallback(
    (point: DrawingPoint): string | null => {
      if (width <= 0 || height <= 0) return null;
      const aspect = height / width;
      // Hit radius in normalized horizontal units (approx 22px on screen)
      const threshold = 22 / width;
      const thresholdSq = threshold * threshold;

      for (let sIdx = strokes.length - 1; sIdx >= 0; sIdx--) {
        const stroke = strokes[sIdx];
        const pts = stroke.points;
        if (!pts || pts.length === 0) continue;

        if (pts.length === 1) {
          const dx = point.x - pts[0].x;
          const dy = (point.y - pts[0].y) * aspect;
          if (dx * dx + dy * dy <= thresholdSq) {
            return stroke.id;
          }
          continue;
        }

        for (let i = 0; i < pts.length - 1; i++) {
          const p1 = pts[i];
          const p2 = pts[i + 1];

          const px = point.x;
          const py = point.y * aspect;
          const x1 = p1.x;
          const y1 = p1.y * aspect;
          const x2 = p2.x;
          const y2 = p2.y * aspect;

          const dx = x2 - x1;
          const dy = y2 - y1;
          const lenSq = dx * dx + dy * dy;

          let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
          t = Math.max(0, Math.min(1, t));

          const projX = x1 + t * dx;
          const projY = y1 + t * dy;

          const distSq = (px - projX) * (px - projX) + (py - projY) * (py - projY);
          if (distSq <= thresholdSq) {
            return stroke.id;
          }
        }
      }
      return null;
    },
    [strokes, width, height]
  );

  // Laser animation loop
  const updateLaser = useCallback(() => {
    const canvas = laserCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, width * dpr, height * dpr);

    const now = Date.now();
    // Keep points from last 600ms
    laserPointsRef.current = laserPointsRef.current.filter((p) => now - p.time < 600);
    const pts = laserPointsRef.current;

    if (pts.length > 0) {
      ctx.save();
      ctx.scale(dpr, dpr);

      // Trailing tail
      if (pts.length > 1) {
        for (let i = 0; i < pts.length - 1; i++) {
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const age = now - p2.time;
          const alpha = Math.max(0, 1 - age / 600);

          ctx.beginPath();
          ctx.moveTo(p1.x * width, p1.y * height);
          ctx.lineTo(p2.x * width, p2.y * height);
          ctx.strokeStyle = `rgba(239, 68, 68, ${alpha * 0.8})`;
          ctx.lineWidth = Math.max(2, 6 * alpha);
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      }

      // Glowing Head Dot
      const current = pts[pts.length - 1];
      const cx = current.x * width;
      const cy = current.y * height;

      // Outer Glow
      const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 18);
      grad.addColorStop(0, 'rgba(239, 68, 68, 0.9)');
      grad.addColorStop(0.4, 'rgba(239, 68, 68, 0.5)');
      grad.addColorStop(1, 'rgba(239, 68, 68, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.fill();

      // Sharp Core
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      laserAnimFrameRef.current = requestAnimationFrame(updateLaser);
    } else {
      laserAnimFrameRef.current = null;
    }
  }, [width, height]);

  // Pointer Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isBoardMode) return;

    // Smartboard Palm Rejection / Palm Eraser:
    // If contact geometry is large (e.g. palm on smartboard), act as eraser
    const isPalm = e.pointerType === 'touch' && (e.width > 35 || e.height > 35);
    isPalmErasingRef.current = isPalm;

    const pt = getNormalizedPoint(e);

    if (activeTool === 'laser') {
      laserPointsRef.current = [{ ...pt, time: Date.now() }];
      if (!laserAnimFrameRef.current) {
        laserAnimFrameRef.current = requestAnimationFrame(updateLaser);
      }
      return;
    }

    if (activeTool === 'eraser' || isPalm) {
      const hitId = checkStrokeHit(pt);
      if (hitId) {
        onDeleteStroke(hitId);
      }
      isDrawingRef.current = true;
      return;
    }

    // Pen or Highlighter
    isDrawingRef.current = true;
    currentPointsRef.current = [pt];
    redrawAllStrokes();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isBoardMode) return;
    const pt = getNormalizedPoint(e);

    if (activeTool === 'laser') {
      laserPointsRef.current.push({ ...pt, time: Date.now() });
      if (!laserAnimFrameRef.current) {
        laserAnimFrameRef.current = requestAnimationFrame(updateLaser);
      }
      return;
    }

    if (!isDrawingRef.current) return;

    if (activeTool === 'eraser' || isPalmErasingRef.current) {
      const hitId = checkStrokeHit(pt);
      if (hitId) {
        onDeleteStroke(hitId);
      }
      return;
    }

    // Pen / Highlighter: only add point if it moved sufficiently
    const pts = currentPointsRef.current;
    if (pts.length > 0) {
      const last = pts[pts.length - 1];
      const dx = (pt.x - last.x) * width;
      const dy = (pt.y - last.y) * height;
      if (dx * dx + dy * dy < 2.5) {
        return; // Ignore subpixel jitter for 120Hz performance
      }
    }

    currentPointsRef.current.push(pt);
    redrawAllStrokes();
  };

  const finishDrawing = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    isPalmErasingRef.current = false;

    if (activeTool === 'eraser' || activeTool === 'laser') {
      currentPointsRef.current = [];
      return;
    }

    const pts = currentPointsRef.current;
    if (pts.length >= 1) {
      const newStroke: DrawingStroke = {
        id: `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        pageNumber,
        tool: activeTool === 'highlighter' ? 'highlighter' : 'pen',
        color: activeTool === 'highlighter' ? highlighterColor : penColor,
        size: activeTool === 'highlighter' ? highlighterSize : penSize,
        points: pts,
        createdAt: Date.now(),
      };
      onAddStroke(newStroke);
    }

    currentPointsRef.current = [];
    redrawAllStrokes();
  };

  const handlePointerUp = () => finishDrawing();
  const handlePointerCancel = () => finishDrawing();

  // Determine cursor based on board mode and active tool
  const getCursorClass = () => {
    if (!isBoardMode) return 'pointer-events-none cursor-default';
    switch (activeTool) {
      case 'pen':
      case 'highlighter':
        return 'cursor-crosshair pointer-events-auto';
      case 'eraser':
        return 'cursor-pointer pointer-events-auto';
      case 'laser':
        return 'cursor-none pointer-events-auto';
      default:
        return 'cursor-default pointer-events-auto';
    }
  };

  return (
    <>
      {/* Main Drawing Strokes Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{
          touchAction: isBoardMode ? 'none' : 'auto',
        }}
        className={`absolute inset-0 z-20 ${getCursorClass()} transition-opacity duration-150`}
      />

      {/* Laser Pointer Transient Glow Canvas */}
      {isBoardMode && activeTool === 'laser' && (
        <canvas
          ref={laserCanvasRef}
          className="absolute inset-0 z-25 pointer-events-none"
        />
      )}
    </>
  );
};
