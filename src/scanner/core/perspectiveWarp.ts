import type { Point, Quad } from './types';
import { runWasmDewarpSpine, runWasmWarpPerspective } from './wasmEngine';

function distance(p1: Point, p2: Point): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

function outputSize(quad: Quad, targetWidth?: number, targetHeight?: number) {
  const { topLeft, topRight, bottomRight, bottomLeft } = quad;
  const width = targetWidth ?? Math.max(distance(topLeft, topRight), distance(bottomLeft, bottomRight));
  const height = targetHeight ?? Math.max(distance(topLeft, bottomLeft), distance(topRight, bottomRight));
  const scale = Math.min(1, 4200 / Math.max(width, height), Math.sqrt(12_000_000 / (width * height)));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function isAxisAligned({ topLeft, topRight, bottomRight, bottomLeft }: Quad): boolean {
  return Math.abs(topLeft.y - topRight.y) <= 1 &&
    Math.abs(bottomLeft.y - bottomRight.y) <= 1 &&
    Math.abs(topLeft.x - bottomLeft.x) <= 1 &&
    Math.abs(topRight.x - bottomRight.x) <= 1;
}

export function warpPerspective(
  source: HTMLImageElement | HTMLCanvasElement,
  quad: Quad,
  targetWidth?: number,
  targetHeight?: number
): HTMLCanvasElement {
  const { topLeft, topRight, bottomRight, bottomLeft } = quad;

  const { width, height } = outputSize(quad, targetWidth, targetHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not prepare the cropped image');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (isAxisAligned(quad)) {
    const sx = Math.max(0, Math.min(topLeft.x, bottomLeft.x));
    const sy = Math.max(0, Math.min(topLeft.y, topRight.y));
    const sw = Math.max(1, Math.max(topRight.x, bottomRight.x) - sx);
    const sh = Math.max(1, Math.max(bottomLeft.y, bottomRight.y) - sy);
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  renderQuadSubdivision(ctx, source, quad, width, height);
  return canvas;
}

/**
 * Asynchronous Rust WASM Perspective Rectification Engine.
 * Uses projective homography + bilinear interpolation inside the WASM Web Worker
 * with transparent fallback to the Canvas 2D fast path or triangle subdivision.
 */
export async function warpPerspectiveAsync(
  source: HTMLImageElement | HTMLCanvasElement,
  quad: Quad,
  targetWidth?: number,
  targetHeight?: number
): Promise<HTMLCanvasElement> {
  if (isAxisAligned(quad)) {
    return warpPerspective(source, quad, targetWidth, targetHeight);
  }
  const { width: outW, height: outH } = outputSize(quad, targetWidth, targetHeight);

  const srcW = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const srcH = 'naturalHeight' in source ? source.naturalHeight : source.height;

  if (srcW >= 2 && srcH >= 2 && srcW * srcH <= 16_000_000) {
    try {
      let srcCanvas: HTMLCanvasElement;
      if (source instanceof HTMLCanvasElement) {
        srcCanvas = source;
      } else {
        srcCanvas = document.createElement('canvas');
        srcCanvas.width = srcW;
        srcCanvas.height = srcH;
        const sCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
        sCtx?.drawImage(source, 0, 0, srcW, srcH);
      }

      const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
      if (srcCtx) {
        const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;
        const warpedRgba = await runWasmWarpPerspective(srcData, srcW, srcH, outW, outH, quad);
        if (warpedRgba && warpedRgba.length === outW * outH * 4) {
          const outCanvas = document.createElement('canvas');
          outCanvas.width = outW;
          outCanvas.height = outH;
          const outCtx = outCanvas.getContext('2d');
          if (outCtx) {
            const outImg = outCtx.createImageData(outW, outH);
            outImg.data.set(warpedRgba);
            outCtx.putImageData(outImg, 0, 0);
            return outCanvas;
          }
        }
      }
    } catch {
      // Fall back to synchronous Canvas warp below.
    }
  }

  return warpPerspective(source, quad, targetWidth, targetHeight);
}

/**
 * 3D Book Spine Curvature Dewarping Engine (Canvas strip fallback).
 */
export function dewarpBookCurvature(
  sourceCanvas: HTMLCanvasElement,
  curvature: number = 0.25,
  spinePosition: number = 0.5
): HTMLCanvasElement {
  if (curvature <= 0.02) return sourceCanvas;

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;

  const destCanvas = document.createElement('canvas');
  destCanvas.width = w;
  destCanvas.height = h;
  const ctx = destCanvas.getContext('2d');
  if (!ctx) return sourceCanvas;

  const strips = 64;
  const stripW = w / strips;
  const maxLift = h * 0.1 * curvature;
  const sigma = 0.35;

  for (let i = 0; i < strips; i++) {
    const normX = i / strips;
    const distFromSpine = normX - spinePosition;
    const deflection = Math.exp(-(distFromSpine * distFromSpine) / (2 * sigma * sigma)) * maxLift;
    const sx = i * stripW;
    ctx.drawImage(sourceCanvas, sx, 0, stripW, h, sx, -deflection / 2, stripW, h + deflection);
  }

  return destCanvas;
}

/**
 * Asynchronous Rust WASM Spine Curvature Dewarping Engine.
 */
export async function dewarpBookCurvatureAsync(
  sourceCanvas: HTMLCanvasElement,
  curvature: number = 0.25,
  spinePosition: number = 0.5
): Promise<HTMLCanvasElement> {
  if (curvature <= 0.02) return sourceCanvas;

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  if (w <= 0 || h < 2 || w * h > 16_000_000) {
    return dewarpBookCurvature(sourceCanvas, curvature, spinePosition);
  }

  try {
    const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (srcCtx) {
      const srcData = srcCtx.getImageData(0, 0, w, h).data;
      const dewarpedRgba = await runWasmDewarpSpine(srcData, w, h, curvature, spinePosition);
      if (dewarpedRgba && dewarpedRgba.length === w * h * 4) {
        const destCanvas = document.createElement('canvas');
        destCanvas.width = w;
        destCanvas.height = h;
        const outCtx = destCanvas.getContext('2d');
        if (outCtx) {
          const outImg = outCtx.createImageData(w, h);
          outImg.data.set(dewarpedRgba);
          outCtx.putImageData(outImg, 0, 0);
          return destCanvas;
        }
      }
    }
  } catch {
    // Fall back to synchronous Canvas strips below.
  }

  return dewarpBookCurvature(sourceCanvas, curvature, spinePosition);
}

function renderQuadSubdivision(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | HTMLCanvasElement,
  quad: Quad,
  w: number,
  h: number
) {
  const { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl } = quad;
  const steps = 6;

  for (let y = 0; y < steps; y++) {
    for (let x = 0; x < steps; x++) {
      const u0 = x / steps;
      const v0 = y / steps;
      const u1 = (x + 1) / steps;
      const v1 = (y + 1) / steps;

      const p00 = bilinearInterpolate(tl, tr, bl, br, u0, v0);
      const p10 = bilinearInterpolate(tl, tr, bl, br, u1, v0);
      const p01 = bilinearInterpolate(tl, tr, bl, br, u0, v1);
      const p11 = bilinearInterpolate(tl, tr, bl, br, u1, v1);

      renderTriangle(ctx, image, p00, p10, p01, u0 * w, v0 * h, u1 * w, v0 * h, u0 * w, v1 * h);
      renderTriangle(ctx, image, p10, p11, p01, u1 * w, v0 * h, u1 * w, v0 * h, u0 * w, v1 * h);
    }
  }
}

function bilinearInterpolate(tl: Point, tr: Point, bl: Point, br: Point, u: number, v: number): Point {
  const topX = tl.x + (tr.x - tl.x) * u;
  const topY = tl.y + (tr.y - tl.y) * u;
  const botX = bl.x + (br.x - bl.x) * u;
  const botY = bl.y + (br.y - bl.y) * u;
  return {
    x: topX + (botX - topX) * v,
    y: topY + (botY - topY) * v,
  };
}

function renderTriangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  s0: Point, s1: Point, s2: Point,
  d0x: number, d0y: number,
  d1x: number, d1y: number,
  d2x: number, d2y: number
) {
  const cx = (d0x + d1x + d2x) / 3;
  const cy = (d0y + d1y + d2y) / 3;
  const ex = (x: number, y: number) => ({
    x: x + Math.sign(x - cx || 1) * 0.5,
    y: y + Math.sign(y - cy || 1) * 0.5,
  });
  const e0 = ex(d0x, d0y);
  const e1 = ex(d1x, d1y);
  const e2 = ex(d2x, d2y);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(e0.x, e0.y);
  ctx.lineTo(e1.x, e1.y);
  ctx.lineTo(e2.x, e2.y);
  ctx.closePath();
  ctx.clip();

  const det = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(det) < 1e-5) {
    ctx.restore();
    return;
  }

  const a = (d0x * (s1.y - s2.y) + d1x * (s2.y - s0.y) + d2x * (s0.y - s1.y)) / det;
  const c = (d0x * (s2.x - s1.x) + d1x * (s0.x - s2.x) + d2x * (s1.x - s0.x)) / det;
  const e = (d0x * (s1.x * s2.y - s2.x * s1.y) + d1x * (s2.x * s0.y - s0.x * s2.y) + d2x * (s0.x * s1.y - s1.x * s0.y)) / det;
  const b = (d0y * (s1.y - s2.y) + d1y * (s2.y - s0.y) + d2y * (s0.y - s1.y)) / det;
  const d = (d0y * (s2.x - s1.x) + d1y * (s0.x - s2.x) + d2y * (s1.x - s0.x)) / det;
  const f = (d0y * (s1.x * s2.y - s2.x * s1.y) + d1y * (s2.x * s0.y - s0.x * s2.y) + d2y * (s0.x * s1.y - s1.x * s0.y)) / det;

  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}
