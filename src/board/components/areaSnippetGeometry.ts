export interface CanvasCropRegion {
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
}

export function computeCanvasCropRegion(
  screenLeft: number,
  screenTop: number,
  screenWidth: number,
  screenHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  canvasRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
): CanvasCropRegion | null {
  if (canvasWidth <= 0 || canvasHeight <= 0 || canvasRect.width <= 0 || canvasRect.height <= 0) {
    return null;
  }
  const scaleX = canvasWidth / canvasRect.width;
  const scaleY = canvasHeight / canvasRect.height;
  const cropX = Math.max(0, (screenLeft - canvasRect.left) * scaleX);
  const cropY = Math.max(0, (screenTop - canvasRect.top) * scaleY);
  const cropRight = Math.min(canvasWidth, (screenLeft - canvasRect.left + screenWidth) * scaleX);
  const cropBottom = Math.min(canvasHeight, (screenTop - canvasRect.top + screenHeight) * scaleY);
  const cropW = cropRight - cropX;
  const cropH = cropBottom - cropY;
  if (cropW <= 0 || cropH <= 0) return null;
  return { cropX, cropY, cropW, cropH };
}
