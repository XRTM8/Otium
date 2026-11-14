import type { Point, Quad } from '../core/types';

export type CornerKey = 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft';
export type EdgeKey = 'top' | 'right' | 'bottom' | 'left';

export function triggerCropHaptic(duration = 10): void {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(duration);
    } catch (err) {
      console.debug('[Crop] Haptic vibrate skipped:', err);
    }
  }
}

export function clampDraggedCorner(
  prev: Quad,
  corner: CornerKey,
  imgCoord: Point,
  imageWidth: number,
  imageHeight: number,
  snapX: number,
  snapY: number
): Quad {
  const snapped = { ...imgCoord };
  if (Math.abs(snapped.x) < snapX) {
    snapped.x = 0;
    triggerCropHaptic(8);
  } else if (Math.abs(snapped.x - imageWidth) < snapX) {
    snapped.x = imageWidth;
    triggerCropHaptic(8);
  }
  if (Math.abs(snapped.y) < snapY) {
    snapped.y = 0;
    triggerCropHaptic(8);
  } else if (Math.abs(snapped.y - imageHeight) < snapY) {
    snapped.y = imageHeight;
    triggerCropHaptic(8);
  }

  const minGapX = Math.max(24, Math.round(imageWidth * 0.07));
  const minGapY = Math.max(24, Math.round(imageHeight * 0.07));
  const nextCoord = { ...snapped };

  if (corner === 'topLeft') {
    nextCoord.x = Math.max(0, Math.min(nextCoord.x, prev.topRight.x - minGapX));
    nextCoord.y = Math.max(0, Math.min(nextCoord.y, prev.bottomLeft.y - minGapY));
  } else if (corner === 'topRight') {
    nextCoord.x = Math.min(imageWidth, Math.max(nextCoord.x, prev.topLeft.x + minGapX));
    nextCoord.y = Math.max(0, Math.min(nextCoord.y, prev.bottomRight.y - minGapY));
  } else if (corner === 'bottomRight') {
    nextCoord.x = Math.min(imageWidth, Math.max(nextCoord.x, prev.bottomLeft.x + minGapX));
    nextCoord.y = Math.min(imageHeight, Math.max(nextCoord.y, prev.topRight.y + minGapY));
  } else if (corner === 'bottomLeft') {
    nextCoord.x = Math.max(0, Math.min(nextCoord.x, prev.bottomRight.x - minGapX));
    nextCoord.y = Math.min(imageHeight, Math.max(nextCoord.y, prev.topLeft.y + minGapY));
  }

  return { ...prev, [corner]: nextCoord };
}

export function clampDraggedEdge(
  orig: Quad,
  edge: EdgeKey,
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number
): Quad {
  const clampPt = (pt: Point): Point => ({
    x: Math.max(0, Math.min(imageWidth, Math.round(pt.x + dx))),
    y: Math.max(0, Math.min(imageHeight, Math.round(pt.y + dy))),
  });
  const next = { ...orig };
  if (edge === 'top') {
    next.topLeft = clampPt(orig.topLeft);
    next.topRight = clampPt(orig.topRight);
  } else if (edge === 'right') {
    next.topRight = clampPt(orig.topRight);
    next.bottomRight = clampPt(orig.bottomRight);
  } else if (edge === 'bottom') {
    next.bottomLeft = clampPt(orig.bottomLeft);
    next.bottomRight = clampPt(orig.bottomRight);
  } else if (edge === 'left') {
    next.topLeft = clampPt(orig.topLeft);
    next.bottomLeft = clampPt(orig.bottomLeft);
  }
  return next;
}

export function rotateImageAndQuad90(
  image: HTMLImageElement,
  width: number,
  height: number,
  quad: Quad | null,
  clockwise: boolean
): { dataUrl: string; nextQuad: Quad | null; nextSize: { width: number; height: number } } | null {
  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = height;
  rotCanvas.height = width;
  const ctx = rotCanvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, rotCanvas.width, rotCanvas.height);
  ctx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
  ctx.rotate(((clockwise ? 90 : -90) * Math.PI) / 180);
  ctx.drawImage(image, -width / 2, -height / 2);

  const rotPt = (p: Point): Point =>
    clockwise ? { x: Math.round(height - p.y), y: Math.round(p.x) } : { x: Math.round(p.y), y: Math.round(width - p.x) };

  const nextQuad = quad
    ? clockwise
      ? {
          topLeft: rotPt(quad.bottomLeft),
          topRight: rotPt(quad.topLeft),
          bottomRight: rotPt(quad.topRight),
          bottomLeft: rotPt(quad.bottomRight),
        }
      : {
          topLeft: rotPt(quad.topRight),
          topRight: rotPt(quad.bottomRight),
          bottomRight: rotPt(quad.bottomLeft),
          bottomLeft: rotPt(quad.topLeft),
        }
    : null;

  return {
    dataUrl: rotCanvas.toDataURL('image/jpeg', 0.95),
    nextQuad,
    nextSize: { width: height, height: width },
  };
}
