import { useRef, useState, useCallback, useEffect } from 'react';
import type React from 'react';
import type { Point, Quad } from '../core/types';
import { getFullFrameQuad, warpPerspectiveAsync, isQuadConvex } from '../core/geometry';
import { detectDocumentCornersWithConfidence } from '../core/edgeDetection';
import {
  clampDraggedCorner,
  clampDraggedEdge,
  rotateImageAndQuad90,
  triggerCropHaptic,
  type CornerKey,
  type EdgeKey,
} from './cropGeometryHelpers';

export type { CornerKey, EdgeKey };
export { triggerCropHaptic };

interface UseCropInteractionOptions {
  imageSrc: string;
  initialQuad?: Quad;
  onConfirm: (warpedCanvas: HTMLCanvasElement, quad: Quad, source: string) => void | Promise<void>;
}

export function useCropInteraction({ imageSrc, initialQuad, onConfirm }: UseCropInteractionOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const imageBoundsRef = useRef<DOMRect | null>(null);
  const hasInitializedRef = useRef(false);

  const [currentSrc, setCurrentSrc] = useState<string>(imageSrc);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [activeCorner, setActiveCorner] = useState<CornerKey | null>(null);
  const [activeEdge, setActiveEdge] = useState<EdgeKey | null>(null);
  const [edgeDragStart, setEdgeDragStart] = useState<{ client: Point; quad: Quad } | null>(null);
  const [pointerPos, setPointerPos] = useState<Point | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [imageRect, setImageRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState(false);
  const [undoStack, setUndoStack] = useState<Quad[]>([]);
  const [redoStack, setRedoStack] = useState<Quad[]>([]);

  const syncImageRect = useCallback(() => {
    const img = imageRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setImageRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    }
  }, []);

  useEffect(() => {
    const img = imageRef.current;
    if (!currentSrc) return;
    const onResize = () => syncImageRect();
    window.addEventListener('resize', onResize);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && img) {
      observer = new ResizeObserver(onResize);
      observer.observe(img);
    }
    return () => {
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    };
  }, [syncImageRect, currentSrc]);

  const pushHistory = useCallback((currentQuad: Quad | null) => {
    if (!currentQuad) return;
    setUndoStack((prev) => [...prev.slice(-12), { ...currentQuad }]);
    setRedoStack([]);
  }, []);

  const handleUndo = () => {
    const prev = undoStack[undoStack.length - 1];
    if (!prev || !quad) return;
    triggerCropHaptic(10);
    setRedoStack((r) => [...r, { ...quad }]);
    setUndoStack((u) => u.slice(0, -1));
    setQuad(prev);
  };

  const handleRedo = () => {
    const next = redoStack[redoStack.length - 1];
    if (!next || !quad) return;
    triggerCropHaptic(10);
    setUndoStack((u) => [...u, { ...quad }]);
    setRedoStack((r) => r.slice(0, -1));
    setQuad(next);
  };

  const handleImageLoad = () => {
    if (!imageRef.current) return;
    const { naturalWidth, naturalHeight } = imageRef.current;
    setImageSize({ width: naturalWidth, height: naturalHeight });
    syncImageRect();
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      setQuad(
        initialQuad && isQuadConvex(initialQuad)
          ? initialQuad
          : getFullFrameQuad(naturalWidth, naturalHeight, 0)
      );
    }
  };

  const handleAutoDetect = () => {
    if (!imageRef.current || !quad) return;
    triggerCropHaptic(15);
    const result = detectDocumentCornersWithConfidence(imageRef.current);
    if (!result.isDocumentPresent) return false;
    pushHistory(quad);
    setQuad(result.quad);
    return true;
  };

  const handleSelectFullImage = () => {
    if (imageSize.width === 0 || imageSize.height === 0 || !quad) return;
    triggerCropHaptic(15);
    pushHistory(quad);
    setQuad({
      topLeft: { x: 0, y: 0 },
      topRight: { x: imageSize.width, y: 0 },
      bottomRight: { x: imageSize.width, y: imageSize.height },
      bottomLeft: { x: 0, y: imageSize.height },
    });
  };

  const clientToImageCoords = useCallback(
    (clientX: number, clientY: number): Point => {
      if (!imageRef.current || imageSize.width <= 0 || imageSize.height <= 0) return { x: 0, y: 0 };
      const rect = imageBoundsRef.current ?? imageRef.current.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
      return {
        x: Math.max(0, Math.min(imageSize.width, (clientX - rect.left) * (imageSize.width / rect.width))),
        y: Math.max(0, Math.min(imageSize.height, (clientY - rect.top) * (imageSize.height / rect.height))),
      };
    },
    [imageSize]
  );

  const imageToClientCoords = useCallback(
    (point: Point): Point => {
      if (!imageRect || imageSize.width <= 0 || imageSize.height <= 0 || imageRect.width <= 0 || imageRect.height <= 0) {
        return { x: 0, y: 0 };
      }
      return {
        x: imageRect.left + point.x * (imageRect.width / imageSize.width),
        y: imageRect.top + point.y * (imageRect.height / imageSize.height),
      };
    },
    [imageRect, imageSize]
  );

  const handleCornerPointerDown = (corner: CornerKey, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    pushHistory(quad);
    imageBoundsRef.current = imageRef.current?.getBoundingClientRect() ?? null;
    try { containerRef.current?.setPointerCapture(e.pointerId); } catch (err) {
      console.debug('[Crop] Corner setPointerCapture skipped:', err);
    }
    setActiveCorner(corner);
    setActiveEdge(null);
    setPointerPos({ x: e.clientX, y: e.clientY });
    triggerCropHaptic(15);
  };

  const handleEdgePointerDown = (edge: EdgeKey, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!quad) return;
    pushHistory(quad);
    imageBoundsRef.current = imageRef.current?.getBoundingClientRect() ?? null;
    try { containerRef.current?.setPointerCapture(e.pointerId); } catch (err) {
      console.debug('[Crop] Edge setPointerCapture skipped:', err);
    }
    setActiveEdge(edge);
    setActiveCorner(null);
    setEdgeDragStart({ client: { x: e.clientX, y: e.clientY }, quad: { ...quad } });
    setPointerPos({ x: e.clientX, y: e.clientY });
    triggerCropHaptic(15);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!quad) return;
    if (activeCorner) {
      e.preventDefault();
      setPointerPos({ x: e.clientX, y: e.clientY });
      const imgCoord = clientToImageCoords(e.clientX, e.clientY);
      const rect = imageBoundsRef.current ?? imageRef.current?.getBoundingClientRect();
      const snapX = 16 * (rect && rect.width > 0 ? imageSize.width / rect.width : 1);
      const snapY = 16 * (rect && rect.height > 0 ? imageSize.height / rect.height : 1);
      setQuad((prev) =>
        prev ? clampDraggedCorner(prev, activeCorner, imgCoord, imageSize.width, imageSize.height, snapX, snapY) : prev
      );
      return;
    }

    if (activeEdge && edgeDragStart && imageRef.current) {
      e.preventDefault();
      setPointerPos({ x: e.clientX, y: e.clientY });
      const rect = imageBoundsRef.current ?? imageRef.current.getBoundingClientRect();
      const dx = (e.clientX - edgeDragStart.client.x) * (imageSize.width / rect.width);
      const dy = (e.clientY - edgeDragStart.client.y) * (imageSize.height / rect.height);
      setQuad((prev) =>
        prev ? clampDraggedEdge(edgeDragStart.quad, activeEdge, dx, dy, imageSize.width, imageSize.height) : prev
      );
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!activeCorner && !activeEdge) return;
    try { containerRef.current?.releasePointerCapture(e.pointerId); } catch (err) {
      console.debug('[Crop] releasePointerCapture skipped:', err);
    }
    imageBoundsRef.current = null;
    setActiveCorner(null);
    setActiveEdge(null);
    setEdgeDragStart(null);
    setPointerPos(null);
    triggerCropHaptic(10);
  };

  const rotateImageAndQuad = (clockwise: boolean) => {
    triggerCropHaptic(15);
    if (!imageRef.current || imageSize.width === 0 || imageSize.height === 0) return;
    const rotated = rotateImageAndQuad90(imageRef.current, imageSize.width, imageSize.height, quad, clockwise);
    if (!rotated) return;
    if (rotated.nextQuad) setQuad(rotated.nextQuad);
    setImageSize(rotated.nextSize);
    setCurrentSrc(rotated.dataUrl);
  };

  const handleApply = async () => {
    if (!imageRef.current || !quad || isApplying) return;
    setIsApplying(true);
    setApplyError(false);
    triggerCropHaptic(20);
    try {
      const warped = await warpPerspectiveAsync(imageRef.current, quad);
      try {
        await onConfirm(warped, quad, currentSrc);
      } finally {
        warped.width = warped.height = 1;
      }
    } catch (error) {
      console.warn('Could not apply and save the crop:', error);
      setApplyError(true);
    } finally {
      setIsApplying(false);
    }
  };

  return {
    containerRef, imageRef, currentSrc, quad, activeCorner, activeEdge, pointerPos, imageSize,
    isApplying, applyError, undoStack, redoStack, handleUndo, handleRedo,
    handleImageLoad, handleAutoDetect, handleSelectFullImage,
    imageToClientCoords, handleCornerPointerDown, handleEdgePointerDown, handlePointerMove, handlePointerUp,
    handleRotateCw: () => rotateImageAndQuad(true),
    handleRotateCcw: () => rotateImageAndQuad(false),
    handleApply,
  };
}
