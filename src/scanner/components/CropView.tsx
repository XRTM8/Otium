import React, { useRef, useState, useCallback } from 'react';
import type { Point, Quad } from '../core/types';
import { getDefaultQuad, getFullFrameQuad, warpPerspective, isQuadConvex } from '../core/geometry';
import { detectDocumentCorners } from '../core/edgeDetection';
import { Check, RotateCcw, X, Wand2, RotateCw, Maximize2, Undo2, Redo2, FileText, CreditCard, Receipt } from 'lucide-react';

interface CropViewProps {
  imageSrc: string;
  initialQuad?: Quad;
  onConfirm: (warpedCanvas: HTMLCanvasElement, quad: Quad) => void;
  onCancel: () => void;
}

type CornerKey = 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft';
type EdgeKey = 'top' | 'right' | 'bottom' | 'left';

export const CropView: React.FC<CropViewProps> = ({ imageSrc, initialQuad, onConfirm, onCancel }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  // Cache the image bounding rect at drag-start so coordinate mapping stays stable during the gesture
  const imageBoundsRef = useRef<DOMRect | null>(null);
  const [currentSrc, setCurrentSrc] = useState<string>(imageSrc);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [activeCorner, setActiveCorner] = useState<CornerKey | null>(null);
  const [activeEdge, setActiveEdge] = useState<EdgeKey | null>(null);
  const [edgeDragStart, setEdgeDragStart] = useState<{ client: Point; quad: Quad } | null>(null);
  const [pointerPos, setPointerPos] = useState<Point | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const hasInitializedRef = useRef(false);

  // Undo / Redo History Stack
  const [undoStack, setUndoStack] = useState<Quad[]>([]);
  const [redoStack, setRedoStack] = useState<Quad[]>([]);

  const triggerHaptic = useCallback((duration = 10) => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(duration);
      } catch {}
    }
  }, []);

  const pushHistory = useCallback((currentQuad: Quad | null) => {
    if (!currentQuad) return;
    setUndoStack((prev) => [...prev.slice(-12), { ...currentQuad }]);
    setRedoStack([]);
  }, []);

  const handleUndo = () => {
    if (undoStack.length === 0 || !quad) return;
    triggerHaptic(10);
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, { ...quad }]);
    setUndoStack((u) => u.slice(0, -1));
    setQuad(prev);
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || !quad) return;
    triggerHaptic(10);
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, { ...quad }]);
    setRedoStack((r) => r.slice(0, -1));
    setQuad(next);
  };

  const applyAspectRatio = (ratio: number) => {
    if (!imageRef.current || imageSize.width === 0 || imageSize.height === 0 || !quad) return;
    triggerHaptic(15);
    pushHistory(quad);

    const imgW = imageSize.width;
    const imgH = imageSize.height;

    let targetW = imgW * 0.90;
    let targetH = targetW / ratio;

    if (targetH > imgH * 0.90) {
      targetH = imgH * 0.90;
      targetW = targetH * ratio;
    }

    const x0 = Math.round((imgW - targetW) / 2);
    const y0 = Math.round((imgH - targetH) / 2);
    const x1 = Math.round(x0 + targetW);
    const y1 = Math.round(y0 + targetH);

    setQuad({
      topLeft: { x: x0, y: y0 },
      topRight: { x: x1, y: y0 },
      bottomRight: { x: x1, y: y1 },
      bottomLeft: { x: x0, y: y1 },
    });
  };

  const handleImageLoad = () => {
    if (!imageRef.current) return;
    const { naturalWidth, naturalHeight } = imageRef.current;
    setImageSize({ width: naturalWidth, height: naturalHeight });

    // Use passed initialQuad or default to safe full frame
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      if (initialQuad && isQuadConvex(initialQuad)) {
        setQuad(initialQuad);
      } else {
        // Safe full frame to guarantee zero accidental text cropping
        setQuad(getFullFrameQuad(naturalWidth, naturalHeight, 0.005));
      }
    }
  };

  const handleAutoDetect = () => {
    if (!imageRef.current || !quad) return;
    triggerHaptic(15);
    pushHistory(quad);
    const detected = detectDocumentCorners(imageRef.current);
    setQuad(detected);
  };

  const handleSelectFullImage = () => {
    if (imageSize.width === 0 || imageSize.height === 0 || !quad) return;
    triggerHaptic(15);
    pushHistory(quad);
    setQuad({
      topLeft: { x: 0, y: 0 },
      topRight: { x: imageSize.width, y: 0 },
      bottomRight: { x: imageSize.width, y: imageSize.height },
      bottomLeft: { x: 0, y: imageSize.height },
    });
  };

  const handleResetQuad = () => {
    if (!quad) return;
    triggerHaptic(15);
    pushHistory(quad);
    setQuad(getDefaultQuad(imageSize.width, imageSize.height));
  };

  // Map viewport client coords to natural image coords
  // Uses a cached bounding rect during drag so the mapping stays stable as React re-renders
  const clientToImageCoords = useCallback(
    (clientX: number, clientY: number): Point => {
      if (!imageRef.current || imageSize.width <= 0 || imageSize.height <= 0) return { x: 0, y: 0 };
      // Use cached rect if available (stable during pointer capture), otherwise measure live
      const rect = imageBoundsRef.current ?? imageRef.current.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
      const scaleX = imageSize.width / rect.width;
      const scaleY = imageSize.height / rect.height;

      const imgX = Math.max(0, Math.min(imageSize.width, (clientX - rect.left) * scaleX));
      const imgY = Math.max(0, Math.min(imageSize.height, (clientY - rect.top) * scaleY));

      return { x: imgX, y: imgY };
    },
    [imageSize]
  );

  // Map natural image coords to viewport client coords
  const imageToClientCoords = useCallback(
    (point: Point): Point => {
      if (!imageRef.current || imageSize.width <= 0 || imageSize.height <= 0) return { x: 0, y: 0 };
      const rect = imageRef.current.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
      const scaleX = rect.width / imageSize.width;
      const scaleY = rect.height / imageSize.height;

      return {
        x: rect.left + point.x * scaleX,
        y: rect.top + point.y * scaleY,
      };
    },
    [imageSize]
  );

  const handleCornerPointerDown = (corner: CornerKey, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    pushHistory(quad);
    // Snapshot the image bounds BEFORE capture so the rect never shifts mid-drag
    imageBoundsRef.current = imageRef.current?.getBoundingClientRect() ?? null;
    // Capture on the stable container, NOT the moving corner element (avoids coordinate jump)
    try { containerRef.current?.setPointerCapture(e.pointerId); } catch {}
    setActiveCorner(corner);
    setActiveEdge(null);
    setPointerPos({ x: e.clientX, y: e.clientY });
    triggerHaptic(15);
  };

  const handleEdgePointerDown = (edge: EdgeKey, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!quad) return;
    pushHistory(quad);
    // Snapshot the image bounds BEFORE capture so the rect never shifts mid-drag
    imageBoundsRef.current = imageRef.current?.getBoundingClientRect() ?? null;
    // Capture on the stable container, NOT the moving edge handle
    try { containerRef.current?.setPointerCapture(e.pointerId); } catch {}
    setActiveEdge(edge);
    setActiveCorner(null);
    setEdgeDragStart({ client: { x: e.clientX, y: e.clientY }, quad: { ...quad } });
    setPointerPos({ x: e.clientX, y: e.clientY });
    triggerHaptic(15);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!quad) return;

    // Corner dragging with magnetic edge snapping and strict crossover prevention
    if (activeCorner) {
      e.preventDefault();
      setPointerPos({ x: e.clientX, y: e.clientY });
      const imgCoord = clientToImageCoords(e.clientX, e.clientY);

      const rect = imageBoundsRef.current ?? imageRef.current?.getBoundingClientRect();
      const scaleX = rect && rect.width > 0 ? imageSize.width / rect.width : 1;
      const scaleY = rect && rect.height > 0 ? imageSize.height / rect.height : 1;
      const snapX = 16 * scaleX;
      const snapY = 16 * scaleY;

      if (Math.abs(imgCoord.x - 0) < snapX) {
        imgCoord.x = 0;
        triggerHaptic(8);
      } else if (Math.abs(imgCoord.x - imageSize.width) < snapX) {
        imgCoord.x = imageSize.width;
        triggerHaptic(8);
      }

      if (Math.abs(imgCoord.y - 0) < snapY) {
        imgCoord.y = 0;
        triggerHaptic(8);
      } else if (Math.abs(imgCoord.y - imageSize.height) < snapY) {
        imgCoord.y = imageSize.height;
        triggerHaptic(8);
      }

      // Minimum gap between adjacent and opposite corners so quad can NEVER cross or invert
      const minGapX = Math.max(24, Math.round(imageSize.width * 0.07));
      const minGapY = Math.max(24, Math.round(imageSize.height * 0.07));

      setQuad((prev) => {
        if (!prev) return prev;
        const nextCoord = { ...imgCoord };

        if (activeCorner === 'topLeft') {
          nextCoord.x = Math.max(0, Math.min(nextCoord.x, prev.topRight.x - minGapX));
          nextCoord.y = Math.max(0, Math.min(nextCoord.y, prev.bottomLeft.y - minGapY));
        } else if (activeCorner === 'topRight') {
          nextCoord.x = Math.min(imageSize.width, Math.max(nextCoord.x, prev.topLeft.x + minGapX));
          nextCoord.y = Math.max(0, Math.min(nextCoord.y, prev.bottomRight.y - minGapY));
        } else if (activeCorner === 'bottomRight') {
          nextCoord.x = Math.min(imageSize.width, Math.max(nextCoord.x, prev.bottomLeft.x + minGapX));
          nextCoord.y = Math.min(imageSize.height, Math.max(nextCoord.y, prev.topRight.y + minGapY));
        } else if (activeCorner === 'bottomLeft') {
          nextCoord.x = Math.max(0, Math.min(nextCoord.x, prev.bottomRight.x - minGapX));
          nextCoord.y = Math.min(imageSize.height, Math.max(nextCoord.y, prev.topLeft.y + minGapY));
        }

        return { ...prev, [activeCorner]: nextCoord };
      });
      return;
    }

    // Edge Midpoint dragging
    if (activeEdge && edgeDragStart && imageRef.current) {
      e.preventDefault();
      setPointerPos({ x: e.clientX, y: e.clientY });

      // Use cached rect if available so coords don't shift mid-gesture
      const rect = imageBoundsRef.current ?? imageRef.current.getBoundingClientRect();
      const scaleX = imageSize.width / rect.width;
      const scaleY = imageSize.height / rect.height;

      const dx = (e.clientX - edgeDragStart.client.x) * scaleX;
      const dy = (e.clientY - edgeDragStart.client.y) * scaleY;
      const orig = edgeDragStart.quad;

      const clampPt = (pt: Point, deltaX: number, deltaY: number): Point => ({
        x: Math.max(0, Math.min(imageSize.width, Math.round(pt.x + deltaX))),
        y: Math.max(0, Math.min(imageSize.height, Math.round(pt.y + deltaY))),
      });

      setQuad((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        if (activeEdge === 'top') {
          next.topLeft = clampPt(orig.topLeft, dx, dy);
          next.topRight = clampPt(orig.topRight, dx, dy);
        } else if (activeEdge === 'right') {
          next.topRight = clampPt(orig.topRight, dx, dy);
          next.bottomRight = clampPt(orig.bottomRight, dx, dy);
        } else if (activeEdge === 'bottom') {
          next.bottomLeft = clampPt(orig.bottomLeft, dx, dy);
          next.bottomRight = clampPt(orig.bottomRight, dx, dy);
        } else if (activeEdge === 'left') {
          next.topLeft = clampPt(orig.topLeft, dx, dy);
          next.bottomLeft = clampPt(orig.bottomLeft, dx, dy);
        }
        return next;
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeCorner || activeEdge) {
      try { containerRef.current?.releasePointerCapture(e.pointerId); } catch {}
      imageBoundsRef.current = null;
      setActiveCorner(null);
      setActiveEdge(null);
      setEdgeDragStart(null);
      setPointerPos(null);
      triggerHaptic(10);
    }
  };

  const handleRotateCw = () => {
    triggerHaptic(15);
    if (!imageRef.current || imageSize.width === 0 || imageSize.height === 0) return;

    // Create rotated canvas (90 deg clockwise)
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = imageSize.height;
    rotCanvas.height = imageSize.width;
    const ctx = rotCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, rotCanvas.width, rotCanvas.height);
    ctx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
    ctx.rotate((90 * Math.PI) / 180);
    ctx.drawImage(imageRef.current, -imageSize.width / 2, -imageSize.height / 2);

    const rotatedDataUrl = rotCanvas.toDataURL('image/jpeg', 0.95);

    const oldH = imageSize.height;
    const rotPt = (p: Point): Point => ({
      x: Math.round(oldH - p.y),
      y: Math.round(p.x),
    });

    if (quad) {
      setQuad({
        topLeft: rotPt(quad.bottomLeft),
        topRight: rotPt(quad.topLeft),
        bottomRight: rotPt(quad.topRight),
        bottomLeft: rotPt(quad.bottomRight),
      });
    }

    setImageSize({ width: imageSize.height, height: imageSize.width });
    setCurrentSrc(rotatedDataUrl);
  };

  const handleRotateCcw = () => {
    triggerHaptic(15);
    if (!imageRef.current || imageSize.width === 0 || imageSize.height === 0) return;

    // Create rotated canvas (90 deg counter-clockwise)
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = imageSize.height;
    rotCanvas.height = imageSize.width;
    const ctx = rotCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, rotCanvas.width, rotCanvas.height);
    ctx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
    ctx.rotate((-90 * Math.PI) / 180);
    ctx.drawImage(imageRef.current, -imageSize.width / 2, -imageSize.height / 2);

    const rotatedDataUrl = rotCanvas.toDataURL('image/jpeg', 0.95);

    const oldW = imageSize.width;
    const rotPt = (p: Point): Point => ({
      x: Math.round(p.y),
      y: Math.round(oldW - p.x),
    });

    if (quad) {
      setQuad({
        topLeft: rotPt(quad.topRight),
        topRight: rotPt(quad.bottomRight),
        bottomRight: rotPt(quad.bottomLeft),
        bottomLeft: rotPt(quad.topLeft),
      });
    }

    setImageSize({ width: imageSize.height, height: imageSize.width });
    setCurrentSrc(rotatedDataUrl);
  };

  const handleApply = () => {
    if (!imageRef.current || !quad) return;
    triggerHaptic(20);

    const warped = warpPerspective(imageRef.current, quad);
    onConfirm(warped, quad);
  };

  const renderPolyPoints = () => {
    if (!quad) return '';
    const tl = imageToClientCoords(quad.topLeft);
    const tr = imageToClientCoords(quad.topRight);
    const br = imageToClientCoords(quad.bottomRight);
    const bl = imageToClientCoords(quad.bottomLeft);
    return `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;
  };

  // Loupe target coordinates
  let loupeTargetPt: Point | null = null;
  if (quad) {
    if (activeCorner) {
      loupeTargetPt = quad[activeCorner];
    } else if (activeEdge) {
      if (activeEdge === 'top') {
        loupeTargetPt = { x: (quad.topLeft.x + quad.topRight.x) / 2, y: (quad.topLeft.y + quad.topRight.y) / 2 };
      } else if (activeEdge === 'right') {
        loupeTargetPt = { x: (quad.topRight.x + quad.bottomRight.x) / 2, y: (quad.topRight.y + quad.bottomRight.y) / 2 };
      } else if (activeEdge === 'bottom') {
        loupeTargetPt = { x: (quad.bottomLeft.x + quad.bottomRight.x) / 2, y: (quad.bottomLeft.y + quad.bottomRight.y) / 2 };
      } else if (activeEdge === 'left') {
        loupeTargetPt = { x: (quad.topLeft.x + quad.bottomLeft.x) / 2, y: (quad.topLeft.y + quad.bottomLeft.y) / 2 };
      }
    }
  }

  const edgeMidpoints = quad
    ? {
        top: {
          x: (imageToClientCoords(quad.topLeft).x + imageToClientCoords(quad.topRight).x) / 2,
          y: (imageToClientCoords(quad.topLeft).y + imageToClientCoords(quad.topRight).y) / 2,
        },
        right: {
          x: (imageToClientCoords(quad.topRight).x + imageToClientCoords(quad.bottomRight).x) / 2,
          y: (imageToClientCoords(quad.topRight).y + imageToClientCoords(quad.bottomRight).y) / 2,
        },
        bottom: {
          x: (imageToClientCoords(quad.bottomLeft).x + imageToClientCoords(quad.bottomRight).x) / 2,
          y: (imageToClientCoords(quad.bottomLeft).y + imageToClientCoords(quad.bottomRight).y) / 2,
        },
        left: {
          x: (imageToClientCoords(quad.topLeft).x + imageToClientCoords(quad.bottomLeft).x) / 2,
          y: (imageToClientCoords(quad.topLeft).y + imageToClientCoords(quad.bottomLeft).y) / 2,
        },
      }
    : null;

  const isValidQuad = quad ? isQuadConvex(quad) : false;

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="relative w-full h-full bg-[#07090e] flex flex-col justify-between overflow-hidden select-none font-sans"
    >
      {/* Top Action Bar with Safe Area Inset */}
      <div
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px) + 10px, 48px)',
        }}
        className="relative z-30 flex items-center justify-between px-4 pb-3 otium-chrome border-b border-white/[0.08]"
      >
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-button text-gray-300 active:text-white"
          title="إلغاء / Cancel"
        >
          <X className="w-4 h-4" />
          <span className="text-xs">إلغاء</span>
        </button>

        <span className="text-xs font-bold tracking-wide text-white font-arabic">
          تحديد أبعاد المستند
        </span>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className="p-2 rounded-full glass-button text-gray-300 disabled:opacity-30 hover:text-white active:scale-90"
            title="تراجع / Undo"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="p-2 rounded-full glass-button text-gray-300 disabled:opacity-30 hover:text-white active:scale-90"
            title="إعادة / Redo"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleSelectFullImage}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full glass-button text-accent active:scale-95 text-[11px] font-bold"
            title="تحديد كامل الصورة / Full Image"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>الكل</span>
          </button>
          <button
            onClick={handleAutoDetect}
            className="p-2 rounded-full glass-button text-accent active:scale-90"
            title="كشف ذكي / Auto Detect"
          >
            <Wand2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleRotateCcw}
            className="p-2 rounded-full glass-button text-gray-300 active:scale-90"
            title="تدوير يساراً 90° / Rotate Left"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={handleRotateCw}
            className="p-2 rounded-full glass-button text-gray-300 active:scale-90"
            title="تدوير يميناً 90° / Rotate Right"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetQuad}
            className="p-2 rounded-full glass-button text-gray-300 active:text-accent"
            title="إعادة ضبط كامل الإطار / Reset"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center p-3 overflow-hidden">
        <img
          ref={imageRef}
          src={currentSrc}
          alt="Scan target"
          onLoad={handleImageLoad}
          className="max-w-full max-h-[68vh] object-contain rounded-lg shadow-2xl pointer-events-none"
        />

        {/* SVG Quad Overlay with Theme Accent */}
        {quad && (
          <svg className="fixed inset-0 w-full h-full pointer-events-none z-20">
            <polygon
              points={renderPolyPoints()}
              fill={isValidQuad ? "color-mix(in srgb, var(--accent, #38bdf8) 18%, transparent)" : "rgba(239, 68, 68, 0.22)"}
              stroke={isValidQuad ? "var(--accent, #38bdf8)" : "#EF4444"}
              strokeWidth="2.5"
              strokeDasharray="6 4"
            />
          </svg>
        )}

        {/* 4 Corner Handles with Theme Accent */}
        {quad &&
          (['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as CornerKey[]).map((corner) => {
            const clientPt = imageToClientCoords(quad[corner]);
            const isTargeted = activeCorner === corner;
            return (
              <div
                key={corner}
                onPointerDown={(e) => handleCornerPointerDown(corner, e)}
                style={{
                  transform: `translate3d(${clientPt.x}px, ${clientPt.y}px, 0px) translate(-50%, -50%)`,
                }}
                className={`fixed z-30 w-12 h-12 flex items-center justify-center cursor-pointer touch-none transition-transform ${
                  isTargeted ? 'scale-125' : 'active:scale-125'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full ${
                    isValidQuad ? 'bg-accent ring-accent/30' : 'bg-red-500 ring-red-500/30'
                  } border-2 border-white shadow-xl flex items-center justify-center ring-4`}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-black" />
                </div>
              </div>
            );
          })}

        {/* 4 Edge Midpoint Handles with Theme Accent */}
        {edgeMidpoints &&
          (['top', 'right', 'bottom', 'left'] as EdgeKey[]).map((edge) => {
            const pt = edgeMidpoints[edge];
            const isTargeted = activeEdge === edge;
            return (
              <div
                key={edge}
                onPointerDown={(e) => handleEdgePointerDown(edge, e)}
                style={{
                  transform: `translate3d(${pt.x}px, ${pt.y}px, 0px) translate(-50%, -50%)`,
                }}
                className={`fixed z-30 w-10 h-10 flex items-center justify-center cursor-pointer touch-none transition-transform ${
                  isTargeted ? 'scale-125' : 'active:scale-115'
                }`}
                title={`Drag ${edge} edge`}
              >
                <div className="w-6 h-2.5 rounded-full bg-accent border border-white/90 shadow-md flex items-center justify-center">
                  <div className="w-2 h-0.5 bg-black/80 rounded-full" />
                </div>
              </div>
            );
          })}

        {/* Precision Magnifier Loupe with Theme Accent */}
        {pointerPos && loupeTargetPt && (
          <div
            style={{
              left: `${Math.max(68, Math.min(window.innerWidth - 68, pointerPos.x))}px`,
              top: `${Math.max(68, Math.min(window.innerHeight - 68, pointerPos.y < 170 ? pointerPos.y + 115 : pointerPos.y - 115))}px`,
              transform: 'translate(-50%, -50%)',
              borderColor: 'var(--accent, #38bdf8)'
            }}
            className="fixed z-50 w-28 h-28 rounded-full border-4 overflow-hidden shadow-2xl bg-black pointer-events-none ring-4 ring-black/70 animate-in fade-in zoom-in-95 duration-100"
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                backgroundImage: `url(${currentSrc})`,
                backgroundSize: `${imageSize.width * 2.5}px ${imageSize.height * 2.5}px`,
                backgroundPosition: `-${loupeTargetPt.x * 2.5 - 56}px -${loupeTargetPt.y * 2.5 - 56}px`,
                backgroundRepeat: 'no-repeat',
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-full h-[1.5px] bg-accent/80 shadow-sm" />
              <div className="absolute h-full w-[1.5px] bg-accent/80 shadow-sm" />
              <div className="absolute w-3 h-3 rounded-full border-2 border-accent bg-accent/20" />
            </div>
          </div>
        )}
      </div>

      {/* Aspect Ratio Snapping Bar */}
      <div className="relative z-30 flex items-center justify-center gap-1.5 px-4 py-2 bg-black/75 backdrop-blur-md border-t border-white/[0.08]">
        <span className="text-[10px] text-gray-400 font-bold ml-1 font-arabic">المقاس:</span>
        <button
          onClick={() => applyAspectRatio(1 / 1.414)}
          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-accent/20 text-gray-300 hover:text-accent text-[11px] font-bold border border-white/10 flex items-center gap-1 active:scale-95 transition-all"
          title="A4 Standard Document (1:1.414)"
        >
          <FileText className="w-3 h-3 text-accent" />
          <span>A4 قياسي</span>
        </button>
        <button
          onClick={() => applyAspectRatio(0.55)}
          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-accent/20 text-gray-300 hover:text-accent text-[11px] font-bold border border-white/10 flex items-center gap-1 active:scale-95 transition-all"
          title="Receipt / Invoice"
        >
          <Receipt className="w-3 h-3 text-accent" />
          <span>فاتورة</span>
        </button>
        <button
          onClick={() => applyAspectRatio(1.586)}
          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-accent/20 text-gray-300 hover:text-accent text-[11px] font-bold border border-white/10 flex items-center gap-1 active:scale-95 transition-all"
          title="ID Card / Business Card"
        >
          <CreditCard className="w-3 h-3 text-accent" />
          <span>هوية / كرت</span>
        </button>
        <button
          onClick={handleResetQuad}
          className="px-2.5 py-1 rounded-lg bg-white/5 text-gray-400 hover:text-white text-[11px] font-semibold border border-white/5 active:scale-95 transition-all"
          title="Free custom quad"
        >
          <span>حر</span>
        </button>
      </div>

      {/* Bottom Confirm Bar */}
      <div className="relative z-30 flex items-center justify-between px-5 pt-3 pb-8 glass-panel border-t-0">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSelectFullImage}
            className="px-3 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-gray-200 text-xs font-bold active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5 text-accent" />
            <span>كامل الصورة</span>
          </button>
          <button
            onClick={handleAutoDetect}
            className="px-3 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-gray-200 text-xs font-bold active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Wand2 className="w-3.5 h-3.5 text-accent" />
            <span>كشف ذكي</span>
          </button>
        </div>

        <button
          onClick={handleApply}
          disabled={!isValidQuad}
          className={`flex items-center gap-2 px-7 py-3 rounded-2xl font-black text-sm active:scale-95 transition-all shadow-xl cursor-pointer ${
            isValidQuad
              ? 'bg-accent text-on-accent shadow-accent/25'
              : 'bg-red-500/20 text-red-300 border border-red-500/30 opacity-70 cursor-not-allowed'
          }`}
        >
          <Check className="w-5 h-5 stroke-[3]" />
          <span>{isValidQuad ? 'تطبيق القص' : 'زوايا متقاطعة'}</span>
        </button>
      </div>
    </div>
  );
};
