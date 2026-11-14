import type { BoardSnippet, StrokePoint } from '../types';
import { boardRasterSize } from './boardAppearance';
import { drawLaserTrailFrame, type LaserPoint } from './laserTrail';

export type CoalescedPointerLike = Omit<PointerEvent, 'getCoalescedEvents'> & {
  getCoalescedEvents?: () => PointerEvent[];
};

export function sampleCoalescedBoardPoints(
  nativeEvent: CoalescedPointerLike,
  canvas: HTMLCanvasElement,
  cachedRect: DOMRect | null
): StrokePoint[] {
  const samples = nativeEvent.getCoalescedEvents ? nativeEvent.getCoalescedEvents() : [nativeEvent];
  const rect = cachedRect && cachedRect.width > 0 && cachedRect.height > 0 ? cachedRect : canvas.getBoundingClientRect();
  const coalesced = samples.length ? samples : [nativeEvent];
  return coalesced.map((pe) => ({
    x: ((pe.clientX - rect.left) * 1920) / rect.width,
    y: ((pe.clientY - rect.top) * 1080) / rect.height,
    pressure: pe.pressure || 0.5,
  }));
}

export function observeBoardStageResize(container: HTMLDivElement, onResize: () => void): () => void {
  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => onResize());
    resizeObserver.observe(container);
  }
  window.addEventListener('resize', onResize);
  return () => {
    window.removeEventListener('resize', onResize);
    resizeObserver?.disconnect();
  };
}

export function startBoardLaserLoop(
  laserCanvas: HTMLCanvasElement | null,
  active: boolean,
  trailRef: { current: LaserPoint[] }
): () => void {
  if (!laserCanvas) return () => {};
  const ctx = laserCanvas.getContext('2d');
  if (!ctx) return () => {};

  if (!active) {
    ctx.clearRect(0, 0, laserCanvas.width, laserCanvas.height);
    return () => {};
  }

  let frameId: number | null = null;
  const renderLaser = () => {
    drawLaserTrailFrame(ctx, laserCanvas.width, laserCanvas.height, trailRef.current, performance.now());
    frameId = requestAnimationFrame(renderLaser);
  };
  frameId = requestAnimationFrame(renderLaser);
  return () => {
    if (frameId !== null) cancelAnimationFrame(frameId);
  };
}

export function syncBoardCanvasDimensions({
  canvas,
  liveCanvas,
  laserCanvas,
  container,
  dpr,
  onClearRectCache,
  onRepaintAll,
}: {
  canvas: HTMLCanvasElement | null;
  liveCanvas: HTMLCanvasElement | null;
  laserCanvas: HTMLCanvasElement | null;
  container: HTMLDivElement | null;
  dpr: number;
  onClearRectCache: () => void;
  onRepaintAll: () => void;
}): void {
  if (!canvas || !laserCanvas || !container) return;

  onClearRectCache();
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const raster = boardRasterSize(rect.width, rect.height, dpr);

  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  if (liveCanvas) {
    liveCanvas.style.width = `${rect.width}px`;
    liveCanvas.style.height = `${rect.height}px`;
  }
  laserCanvas.style.width = `${rect.width}px`;
  laserCanvas.style.height = `${rect.height}px`;
  if (canvas.width === raster.width && canvas.height === raster.height) return;
  canvas.width = raster.width;
  canvas.height = raster.height;
  if (liveCanvas) {
    liveCanvas.width = raster.width;
    liveCanvas.height = raster.height;
  }
  laserCanvas.width = raster.width;
  laserCanvas.height = raster.height;

  onRepaintAll();
}

export function computeDraggedSnippetCoords({
  stageRect,
  clientX,
  clientY,
  offset,
  snippet,
}: {
  stageRect: DOMRect;
  clientX: number;
  clientY: number;
  offset: { x: number; y: number };
  snippet: BoardSnippet | undefined;
}): { x: number; y: number } {
  const newX = Math.max(
    10,
    Math.min(1920 - (snippet?.width || 300), ((clientX - stageRect.left) * 1920) / stageRect.width - offset.x)
  );
  const newY = Math.max(
    10,
    Math.min(1000, ((clientY - stageRect.top) * 1080) / stageRect.height - offset.y)
  );
  return { x: newX, y: newY };
}
