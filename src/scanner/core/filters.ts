import type { FilterType } from './types';
import { canvasToPngBytes, cleanDocumentWithRust, drawPngBytesOnCanvas } from '../../platform/rustEngine';
import { runWasmFilter } from './wasmEngine';
import {
  applyAdaptiveBwFilter,
  applyAdaptiveCleanFilter,
  applyAdaptiveGrayscaleFilter,
  applyAdaptiveMagicFilter,
  applyAdaptiveVibrantFilter,
  applyAdaptiveVintageFilter,
  applyUnsharpMask,
} from './filterPresets';

async function tryNativeCleanFilter(
  destCanvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D
): Promise<boolean> {
  const pngBytes = await canvasToPngBytes(destCanvas);
  if (!pngBytes) return false;
  const cleaned = await cleanDocumentWithRust(pngBytes, 1.2);
  if (!cleaned || cleaned.byteLength === 0) return false;
  return drawPngBytesOnCanvas(cleaned, destCanvas, ctx, false);
}

/**
 * Asynchronous Document Enhancement Engine.
 * Dispatches pixel math to the Rust WebAssembly Web Worker (`otium_wasm.wasm`)
 * with transferable RGBA buffers and falls back to native Rust Tauri IPC (`clean`)
 * or pure JS if Workers/WASM are unavailable in the current environment.
 */
export async function applyFilterAsync(
  sourceCanvas: HTMLCanvasElement,
  filter: FilterType
): Promise<HTMLCanvasElement> {
  if (filter === 'original') return sourceCanvas;

  try {
    const maxDim = 3600;
    const currentMax = Math.max(sourceCanvas.width, sourceCanvas.height);
    const scale = currentMax > maxDim ? maxDim / currentMax : 1;
    const width = Math.max(1, Math.round(sourceCanvas.width * scale));
    const height = Math.max(1, Math.round(sourceCanvas.height * scale));

    const destCanvas = document.createElement('canvas');
    destCanvas.width = width;
    destCanvas.height = height;
    const ctx = destCanvas.getContext('2d', { willReadFrequently: true });

    if (ctx) {
      ctx.drawImage(sourceCanvas, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const wasmFiltered = await runWasmFilter(imageData.data, width, height, filter);
      if (wasmFiltered && wasmFiltered.length === width * height * 4) {
        const outImg = ctx.createImageData(width, height);
        outImg.data.set(wasmFiltered);
        ctx.putImageData(outImg, 0, 0);
        return destCanvas;
      }
      if (filter === 'clean' && (await tryNativeCleanFilter(destCanvas, ctx))) {
        return destCanvas;
      }
    }
  } catch (err) {
    console.warn('WASM filter failed, falling back to JS filter:', err);
  }

  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        resolve(applyFilter(sourceCanvas, filter));
      } catch (err) {
        console.warn('Filter processing error, returning source:', err);
        resolve(sourceCanvas);
      }
    }, 0);
  });
}

const SYNC_FILTER_RUNNERS: Record<Exclude<FilterType, 'original'>, (data: Uint8ClampedArray, w: number, h: number) => void> = {
  magic: (data, w, h) => {
    applyAdaptiveMagicFilter(data, w, h);
    applyUnsharpMask(data, w, h, 0.45);
  },
  clean: (data, w, h) => {
    applyAdaptiveCleanFilter(data, w, h);
    applyUnsharpMask(data, w, h, 0.55);
  },
  vibrant: (data, w, h) => {
    applyAdaptiveVibrantFilter(data, w, h);
    applyUnsharpMask(data, w, h, 0.35);
  },
  bw: (data, w, h) => {
    applyAdaptiveBwFilter(data, w, h);
  },
  grayscale: (data, w, h) => {
    applyAdaptiveGrayscaleFilter(data, w, h);
    applyUnsharpMask(data, w, h, 0.45);
  },
  vintage: (data, w, h) => {
    applyAdaptiveVintageFilter(data, w, h);
    applyUnsharpMask(data, w, h, 0.40);
  },
};

function applyFilter(sourceCanvas: HTMLCanvasElement, filter: FilterType): HTMLCanvasElement {
  const maxDim = 3600;
  const currentMax = Math.max(sourceCanvas.width, sourceCanvas.height);
  const scale = currentMax > maxDim ? maxDim / currentMax : 1;
  const width = Math.round(sourceCanvas.width * scale);
  const height = Math.round(sourceCanvas.height * scale);

  const destCanvas = document.createElement('canvas');
  destCanvas.width = width;
  destCanvas.height = height;

  const ctx = destCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return sourceCanvas;

  ctx.drawImage(sourceCanvas, 0, 0, width, height);
  if (filter === 'original') return destCanvas;

  const imageData = ctx.getImageData(0, 0, width, height);
  SYNC_FILTER_RUNNERS[filter](imageData.data, width, height);
  ctx.putImageData(imageData, 0, 0);
  return destCanvas;
}
