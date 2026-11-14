import type { Point, Quad, DocumentAnalysisResult } from './types';
import { computeQuadArea, expandQuadSafetyMargin, getFullFrameQuad, isQuadConvex } from './geometry';
import { findLineQuads, refineQuad } from './edgeLines';
import { calculateLaplacianSharpness } from './edgeMath';

export { calculateLaplacianSharpness, getFullFrameQuad };

// Below this score keep the original and let the user confirm the proposed crop.
export const automaticCropConfidence = 92;

export function detectDocumentCornersWithConfidence(
  source: HTMLImageElement | HTMLCanvasElement,
): DocumentAnalysisResult {
  const width = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const height = 'naturalHeight' in source ? source.naturalHeight : source.height;
  const fallback: DocumentAnalysisResult = {
    quad: getFullFrameQuad(width, height, 0),
    confidence: 0,
    isDocumentPresent: false,
  };
  if (!width || !height) return fallback;

  const scale = Math.min(1, 640 / Math.max(width, height));
  const workWidth = Math.round(width * scale);
  const workHeight = Math.round(height * scale);
  if (Math.min(workWidth, workHeight) < 12) return fallback;

  const canvas = document.createElement('canvas');
  canvas.width = workWidth;
  canvas.height = workHeight;
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fallback;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, workWidth, workHeight);
    ctx.drawImage(source, 0, 0, workWidth, workHeight);
    const { data } = ctx.getImageData(0, 0, workWidth, workHeight);
    const result = detectDocumentPixels(data, workWidth, workHeight);
    if (!result.isDocumentPresent) return fallback;
    const scaleX = width / workWidth;
    const scaleY = height / workHeight;
    const toOriginal = ({ x, y }: Point): Point => ({ x: x * scaleX, y: y * scaleY });
    const quad = {
      topLeft: toOriginal(result.quad.topLeft),
      topRight: toOriginal(result.quad.topRight),
      bottomRight: toOriginal(result.quad.bottomRight),
      bottomLeft: toOriginal(result.quad.bottomLeft),
    };
    let refined = quad;
    if (scale <= 0.66) {
      try {
        refined = refinePhotoEdges(source, ctx, quad, Math.min(16, Math.ceil(3 / scale)));
      } catch {
        // The downscaled candidate remains usable if high-resolution patches cannot be read.
      }
    }
    return { ...result, quad: expandQuadSafetyMargin(refined, width, height, 0.016) };
  } catch (error) {
    console.warn('Document detection failed:', error);
    return fallback;
  } finally {
    canvas.width = canvas.height = 1;
  }
}

// Input is an already oriented and downscaled RGBA image, also used by the benchmark.
export function detectDocumentPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  useLineFallback = true,
): DocumentAnalysisResult {
  const fallback = { quad: getFullFrameQuad(width, height, 0), confidence: 0, isDocumentPresent: false };
  if (Math.min(width, height) < 12 || data.length !== width * height * 4) return fallback;
  const luminance = new Uint8Array(width * height);
  const histogram = new Uint32Array(256);
  for (let i = 0; i < luminance.length; i++) {
    const value = rgbLuma(data, i * 4);
    luminance[i] = value;
    histogram[value]!++;
  }
  const threshold = splitHistogram(histogram, luminance.length);
  if (threshold === null && !useLineFallback) return fallback;
  const mask = new Uint8Array(luminance.length);
  const queue = new Int32Array(luminance.length);
  let best: { quad: Quad; score: number; area: number } | undefined;
  const consider = (quad: Quad, bright?: boolean) => {
    const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
    const inset = bright === undefined ? Math.max(5, Math.round(Math.min(width, height) * 0.025)) : 2;
    if (points.some(({ x, y }) => x < inset || y < inset || x > width - inset - 1 || y > height - inset - 1)) return;
    if (useLineFallback && !plausiblePerspective(quad)) return;
    const area = computeQuadArea(quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft);
    if (area < mask.length * 0.055 || area > mask.length * 0.98 || !isQuadConvex(quad)) return;
    const score = scoreBorders(quad, luminance, width, height, bright);
    if (!score) return;
    const weightedScore = score * 0.88 + Math.sqrt(area / mask.length) * 0.12;
    if (!best || weightedScore > best.score || (bright === undefined && area > best.area * 1.30 && weightedScore >= best.score - 0.20)) {
      best = { quad, score: weightedScore, area };
    }
  };
  for (const level of threshold === null ? [] : [threshold, threshold - 22, threshold + 22]) {
    if (level < 0 || level > 254) continue;
    for (const bright of [true, false]) {
      for (let i = 0; i < mask.length; i++) mask[i] = (luminance[i]! > level) === bright ? 1 : 0;
      for (const boundary of componentBoundaries(mask, queue, width, height)) {
        const quad = fitQuad(boundary);
        if (quad) consider(quad, bright);
      }
    }
  }
  if (threshold !== null && useLineFallback && (!best || best.score < 0.91 || best.area < mask.length * 0.48)) {
    for (const quad of findLineQuads(luminance, width, height)) consider(quad);
  }
  if (useLineFallback && (!best || best.score < 0.92)) {
    const blue = new Uint8Array(luminance.length);
    const blueHistogram = new Uint32Array(256);
    let totalChroma = 0;
    for (let i = 0; i < blue.length; i++) {
      blue[i] = data[i * 4 + 2]!;
      totalChroma += Math.abs(blue[i]! - luminance[i]!);
      blueHistogram[blue[i]!]!++;
    }
    if (totalChroma / blue.length > 5) {
      const blueThreshold = splitHistogram(blueHistogram, blue.length);
      if (blueThreshold !== null) {
        const level = blueThreshold + 10;
        for (let i = 0; i < blue.length; i++) mask[i] = blue[i]! > level ? 1 : 0;
        let colorBest: { quad: Quad; score: number } | undefined;
        const colorCandidate = (quad: Quad) => {
          const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
          const inset = Math.max(5, Math.round(Math.min(width, height) * 0.025));
          if (points.some(({ x, y }) => x < inset || y < inset || x >= width - inset || y >= height - inset)) return;
          if (!isQuadConvex(quad) || !plausiblePerspective(quad)) return;
          const area = computeQuadArea(quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft);
          if (area < mask.length * 0.055 || area > mask.length * 0.75) return;
          const borders = scoreBorders(quad, blue, width, height, true);
          if (!borders) return;
          const score = borders * 0.88 + Math.sqrt(area / mask.length) * 0.12;
          if (!colorBest || score > colorBest.score) colorBest = { quad, score };
        };
        for (const boundary of componentBoundaries(mask, queue, width, height)) {
          const quad = fitQuad(boundary);
          if (quad) colorCandidate(quad);
        }
        for (const quad of findLineQuads(blue, width, height)) colorCandidate(quad);
        const color = colorBest as { quad: Quad; score: number } | undefined;
        if (color && (!best || color.score > best.score + 0.045)) {
          const confidence = Math.min(95, Math.round(color.score * 100));
          return { quad: color.quad, confidence, isDocumentPresent: true };
        }
      }
    }
  }
  if (!best) return fallback;
  return { quad: best.quad, confidence: Math.round(best.score * 100), isDocumentPresent: true };
}

function plausiblePerspective(quad: Quad): boolean {
  const { topLeft: a, topRight: b, bottomRight: c, bottomLeft: d } = quad;
  const widthRatio = Math.hypot(b.x - a.x, b.y - a.y) / Math.hypot(c.x - d.x, c.y - d.y);
  const heightRatio = Math.hypot(d.x - a.x, d.y - a.y) / Math.hypot(c.x - b.x, c.y - b.y);
  return widthRatio >= 0.42 && widthRatio <= 1 / 0.42 && heightRatio >= 0.42 && heightRatio <= 1 / 0.42;
}

function rgbLuma(data: Uint8ClampedArray, i: number): number {
  return Math.round(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!);
}

function refinePhotoEdges(
  source: HTMLImageElement | HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  quad: Quad,
  radius: number,
): Quad {
  const patchSize = radius * 2 + 7;
  const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  // Refine each side using small source-resolution patches. Canvas only reads back these patches.
  const patches = points.flatMap((point, index) => {
    const next = points[(index + 1) % 4]!;
    return Array.from({ length: 13 }, (_, sample) => {
      const t = (sample + 2) / 16;
      const x = Math.round(point.x + (next.x - point.x) * t) - radius - 3;
      const y = Math.round(point.y + (next.y - point.y) * t) - radius - 3;
      ctx.clearRect(0, 0, patchSize, patchSize);
      ctx.drawImage(source, x, y, patchSize, patchSize, 0, 0, patchSize, patchSize);
      return { x, y, pixels: ctx.getImageData(0, 0, patchSize, patchSize).data };
    });
  });
  const refined = refineQuad(quad, (x, y) => {
    const ix = Math.round(x), iy = Math.round(y);
    const patch = patches.find((item) => ix >= item.x && ix < item.x + patchSize && iy >= item.y && iy < item.y + patchSize);
    return patch ? rgbLuma(patch.pixels, ((iy - patch.y) * patchSize + ix - patch.x) * 4) : NaN;
  }, radius);
  return isQuadConvex(refined) ? refined : quad;
}

function splitHistogram(histogram: Uint32Array, size: number): number | null {
  const total = histogram.reduce((sum, count, value) => sum + count * value, 0);
  let lowerCount = 0;
  let lowerSum = 0;
  let bestVariance = 0;
  let first = 0;
  let last = 0;
  for (let value = 0; value < 255; value++) {
    lowerCount += histogram[value]!;
    lowerSum += histogram[value]! * value;
    const upperCount = size - lowerCount;
    if (!lowerCount || !upperCount) continue;
    const difference = lowerSum / lowerCount - (total - lowerSum) / upperCount;
    const variance = lowerCount * upperCount * difference ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      first = last = value;
    } else if (variance === bestVariance) {
      last = value;
    }
  }
  return bestVariance > 0 ? Math.round((first + last) / 2) : null;
}

function* componentBoundaries(mask: Uint8Array, queue: Int32Array, width: number, height: number) {
  const rowMin = new Int32Array(height);
  const rowMax = new Int32Array(height);
  const visitedRows = new Int32Array(height);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    let head = 0;
    let tail = 1;
    let minY = height;
    let maxY = 0;
    const component = i + 1;
    mask[i] = 0;
    queue[0] = i;
    while (head < tail) {
      const index = queue[head++]!;
      const x = index % width;
      const y = (index - x) / width;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      if (visitedRows[y] !== component) {
        visitedRows[y] = component;
        rowMin[y] = rowMax[y] = x;
      } else {
        rowMin[y] = Math.min(rowMin[y]!, x);
        rowMax[y] = Math.max(rowMax[y]!, x);
      }
      if (x > 0 && mask[index - 1]) { mask[index - 1] = 0; queue[tail++] = index - 1; }
      if (x < width - 1 && mask[index + 1]) { mask[index + 1] = 0; queue[tail++] = index + 1; }
      if (y > 0 && mask[index - width]) { mask[index - width] = 0; queue[tail++] = index - width; }
      if (y < height - 1 && mask[index + width]) { mask[index + width] = 0; queue[tail++] = index + width; }
    }
    if (tail < mask.length * 0.035 || tail > mask.length * 0.98) continue;
    const boundary: Point[] = [];
    for (let y = minY; y <= maxY; y++) {
      boundary.push({ x: rowMin[y]!, y });
      if (rowMin[y] !== rowMax[y]) boundary.push({ x: rowMax[y]!, y });
    }
    yield boundary;
  }
}

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function hullHalf(points: Point[]): Point[] {
  const half: Point[] = [];
  for (const point of points) {
    while (half.length >= 2 && cross(half.at(-2)!, half.at(-1)!, point) <= 0) half.pop();
    half.push(point);
  }
  half.pop();
  return half;
}

function fitQuad(points: Point[]): Quad | null {
  points.sort((a, b) => a.x - b.x || a.y - b.y);
  const hull = [...hullHalf(points), ...hullHalf(points.reverse())];
  if (hull.length < 4) return null;
  while (hull.length > 4) {
    let smallest = Infinity;
    let index = 0;
    for (let i = 0; i < hull.length; i++) {
      const area = cross(hull.at(i - 1)!, hull[i]!, hull[(i + 1) % hull.length]!);
      if (area < smallest) {
        smallest = area;
        index = i;
      }
    }
    hull.splice(index, 1);
  }
  const start = hull.reduce((best, p, i) => p.x + p.y < hull[best]!.x + hull[best]!.y ? i : best, 0);
  return {
    topLeft: hull[start]!,
    topRight: hull[(start + 1) % 4]!,
    bottomRight: hull[(start + 2) % 4]!,
    bottomLeft: hull[(start + 3) % 4]!,
  };
}

function scoreBorders(quad: Quad, lum: Uint8Array, width: number, height: number, bright?: boolean): number {
  const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  const sampleDistance = Math.max(2, Math.round(Math.min(width, height) * 0.014));
  let minSupport = 1;
  let totalSupport = 0;
  let totalContrast = 0;
  for (let i = 0; i < 4; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % 4]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < sampleDistance * 5) return 0;
    const nx = (a.y - b.y) * sampleDistance / length;
    const ny = (b.x - a.x) * sampleDistance / length;
    let supported = 0;
    let contrast = 0;
    let signedSupport = 0;
    for (let j = 1; j <= 18; j++) {
      const fraction = 0.07 + 0.86 * j / 19;
      const x = a.x + (b.x - a.x) * fraction;
      const y = a.y + (b.y - a.y) * fraction;
      const ix = Math.round(x + nx);
      const iy = Math.round(y + ny);
      const ox = Math.round(x - nx);
      const oy = Math.round(y - ny);
      if (ix < 0 || ix >= width || ox < 0 || ox >= width || iy < 0 || iy >= height || oy < 0 || oy >= height) continue;
      const delta = lum[iy * width + ix]! - lum[oy * width + ox]!;
      const difference = bright === undefined ? Math.abs(delta) : delta * (bright ? 1 : -1);
      if (difference >= (bright === undefined ? 8 : 10)) {
        supported++;
        signedSupport += Math.sign(delta);
        contrast += Math.min(1, difference / 45);
      }
    }
    if (bright === undefined && Math.abs(signedSupport) < supported * 0.35) return 0;
    minSupport = Math.min(minSupport, supported / 18);
    totalSupport += supported / 72;
    totalContrast += contrast / 72;
  }
  return minSupport >= 0.66 ? minSupport * 0.55 + totalSupport * 0.30 + totalContrast * 0.15 : 0;
}
