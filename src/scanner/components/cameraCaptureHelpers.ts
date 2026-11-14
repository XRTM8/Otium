import {
  automaticCropConfidence,
  calculateLaplacianSharpness,
  detectDocumentCornersWithConfidence,
  detectDocumentPixels,
} from '../core/edgeDetection';
import { mergeIdCardSidesToA4 } from '../core/idCard';
import { createImageFromBlob } from '../core/storage/pageImageOps';
import { getQuadAspectRatio, warpPerspectiveAsync } from '../core/geometry';
import type { Quad } from '../core/types';
import { runWasmMotionAndSharpness } from '../core/wasmEngine';

function encodeJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.96));
}

export function checkCanvasNonBlack(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  try {
    const pts = [
      { x: Math.floor(w * 0.5), y: Math.floor(h * 0.5) },
      { x: Math.floor(w * 0.25), y: Math.floor(h * 0.25) },
      { x: Math.floor(w * 0.75), y: Math.floor(h * 0.25) },
      { x: Math.floor(w * 0.25), y: Math.floor(h * 0.75) },
      { x: Math.floor(w * 0.75), y: Math.floor(h * 0.75) },
      { x: Math.floor(w * 0.5), y: Math.floor(h * 0.3) },
      { x: Math.floor(w * 0.5), y: Math.floor(h * 0.7) },
    ];
    let total = 0;
    let nonZeroCount = 0;
    for (const p of pts) {
      const pixel = ctx.getImageData(p.x, p.y, 1, 1).data;
      const r = pixel[0] ?? 0;
      const g = pixel[1] ?? 0;
      const b = pixel[2] ?? 0;
      const a = pixel[3] ?? 0;
      total += r + g + b;
      if (a > 0 && (r > 0 || g > 0 || b > 0)) {
        nonZeroCount++;
      }
    }
    return total / (pts.length * 3) >= 5 && nonZeroCount >= 3;
  } catch {
    return true;
  }
}

export async function tryTakeCameraPhoto(stream: MediaStream | null): Promise<Blob | null> {
  const track = stream?.getVideoTracks()[0];
  if (!track || track.readyState !== 'live' || typeof window.ImageCapture !== 'function') return null;
  let timer: number | undefined;
  try {
    const capture = new window.ImageCapture(track);
    const photo = capture.takePhoto?.();
    if (!photo) return null;
    const timeout = new Promise<null>((resolve) => { timer = window.setTimeout(() => resolve(null), 2000); });
    const blob = await Promise.race([photo, timeout]);
    if (!blob?.size) return null;
    await createImageFromBlob(blob);
    return blob;
  } catch (error) {
    console.warn('Still capture failed:', error);
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function tryCaptureVideoCanvas(video: HTMLVideoElement | null): Promise<Blob | null> {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (!checkCanvasNonBlack(ctx, canvas.width, canvas.height)) return null;
    return await encodeJpeg(canvas);
  } finally {
    canvas.width = canvas.height = 1;
  }
}

export async function cropIdCardSide(blob: Blob): Promise<HTMLCanvasElement | null> {
  const image = await createImageFromBlob(blob);
  const result = detectDocumentCornersWithConfidence(image);
  const ratio = getQuadAspectRatio(result.quad);
  if (result.confidence < automaticCropConfidence || ratio < 1.22 || ratio > 2.15) return null;
  return warpPerspectiveAsync(image, result.quad);
}

export async function mergeIdCardSides(front: HTMLCanvasElement, back: HTMLCanvasElement): Promise<Blob | null> {
  const page = await mergeIdCardSidesToA4(front, back);
  try {
    return await encodeJpeg(page);
  } finally {
    page.width = page.height = 1;
  }
}

export async function analyzeLiveVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  prevFrameLum: Uint8Array | null,
  resetWasmPrev: boolean
): Promise<{
  quad: Quad | null;
  reliableCrop: boolean;
  motionScore: number;
  sharpness: number;
  nextLum: Uint8Array | null;
  pageSignature: Int8Array | null;
} | null> {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const analysis = detectDocumentPixels(data, canvas.width, canvas.height);
  const quad = analysis.isDocumentPresent ? analysis.quad : null;
  const reliableCrop = analysis.confidence >= automaticCropConfidence;
  const pageSignature = quad ? samplePageContent(data, canvas.width, canvas.height, quad) : null;
  const wasmMetrics = await runWasmMotionAndSharpness(data, canvas.width, canvas.height, resetWasmPrev);

  if (wasmMetrics) {
    return {
      quad,
      reliableCrop,
      pageSignature,
      motionScore: wasmMetrics.motion,
      sharpness: wasmMetrics.sharpness,
      nextLum: prevFrameLum,
    };
  }

  const pixels = data.byteLength ? data : ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let motionScore = 0;
  let nextLum = prevFrameLum;
  if (pixels.byteLength > 0) {
    const totalPixels = canvas.width * canvas.height;
    const currLum = new Uint8Array(totalPixels);
    for (let i = 0, j = 0; i < pixels.length; i += 4, j++) {
      currLum[j] = Math.round(0.299 * (pixels[i] ?? 0) + 0.587 * (pixels[i + 1] ?? 0) + 0.114 * (pixels[i + 2] ?? 0));
    }
    if (prevFrameLum && prevFrameLum.length === totalPixels) {
      let diffSum = 0;
      let count = 0;
      for (let i = 0; i < totalPixels; i += 4) {
        diffSum += Math.abs((currLum[i] ?? 0) - (prevFrameLum[i] ?? 0));
        count++;
      }
      motionScore = count > 0 ? diffSum / count : 0;
    }
    nextLum = currLum;
  }

  return {
    quad,
    reliableCrop,
    pageSignature,
    motionScore,
    sharpness: calculateLaplacianSharpness(canvas),
    nextLum,
  };
}

// Compare local ink contrast inside the page. A shift in exposure across the
// entire frame contributes little to the signature.
export function samplePageContent(data: Uint8ClampedArray, width: number, height: number, quad: Quad): Int8Array {
  const size = 16;
  const values = new Uint8Array(size * size);
  for (let row = 0; row < size; row++) {
    const v = 0.09 + row * 0.82 / (size - 1);
    for (let col = 0; col < size; col++) {
      const u = 0.09 + col * 0.82 / (size - 1);
      const tx = quad.topLeft.x + (quad.topRight.x - quad.topLeft.x) * u;
      const ty = quad.topLeft.y + (quad.topRight.y - quad.topLeft.y) * u;
      const bx = quad.bottomLeft.x + (quad.bottomRight.x - quad.bottomLeft.x) * u;
      const by = quad.bottomLeft.y + (quad.bottomRight.y - quad.bottomLeft.y) * u;
      const x = Math.round(tx + (bx - tx) * v);
      const y = Math.round(ty + (by - ty) * v);
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const pixel = (Math.max(0, Math.min(height - 1, y + dy)) * width + Math.max(0, Math.min(width - 1, x + dx))) * 4;
          sum += 0.299 * data[pixel]! + 0.587 * data[pixel + 1]! + 0.114 * data[pixel + 2]!;
        }
      }
      values[row * size + col] = Math.round(sum / 9);
    }
  }
  const signature = new Int8Array((size - 2) ** 2);
  for (let row = 1; row < size - 1; row++) {
    for (let col = 1; col < size - 1; col++) {
      const i = row * size + col;
      const difference = values[i]! * 4 - values[i - 1]! - values[i + 1]! - values[i - size]! - values[i + size]!;
      signature[(row - 1) * (size - 2) + col - 1] = difference < -48 ? -1 : difference > 48 ? 1 : 0;
    }
  }
  return signature;
}

export function pageContentChanged(before: Int8Array, after: Int8Array): boolean {
  if (!before.length || before.length !== after.length) return false;
  let changed = 0;
  let marked = 0;
  for (let i = 0; i < before.length; i++) {
    if (before[i] || after[i]) marked++;
    if (before[i] !== after[i]) changed++;
  }
  return changed >= 20 && changed >= marked * 0.40;
}
