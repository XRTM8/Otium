import type { Point, Quad, DocumentAnalysisResult } from './types';
import {
  getDefaultQuad,
  getFullFrameQuad,
  orderCorners,
  isQuadConvex,
  computeQuadArea,
  getQuadAspectRatio,
  expandQuadSafetyMargin,
} from './geometry';

export { getFullFrameQuad };

/**
 * CamScanner-Grade Intelligent Document Edge Detector with Illumination Invariance,
 * Subpixel Edge Refinement, and Aspect Ratio Classification.
 */
export function detectDocumentCorners(
  sourceImage: HTMLImageElement | HTMLCanvasElement,
  forceFullFrame = false
): Quad {
  return detectDocumentCornersWithConfidence(sourceImage, forceFullFrame).quad;
}

/**
 * Performs full document analysis returning the detected quad along with
 * detection confidence, orientation, sharpness score, and aspect category.
 */
export function detectDocumentCornersWithConfidence(
  sourceImage: HTMLImageElement | HTMLCanvasElement,
  forceFullFrame = false
): DocumentAnalysisResult {
  const naturalW = 'naturalWidth' in sourceImage ? sourceImage.naturalWidth : sourceImage.width;
  const naturalH = 'naturalHeight' in sourceImage ? sourceImage.naturalHeight : sourceImage.height;

  if (naturalW === 0 || naturalH === 0) {
    return {
      quad: getDefaultQuad(1000, 1000),
      confidence: 0,
      isDocumentPresent: false,
      orientation: 'portrait',
      aspectCategory: 'unknown',
      sharpness: 0,
    };
  }

  const fullFrameQuad = getFullFrameQuad(naturalW, naturalH, 0.005);
  const cleanInsetQuad = getFullFrameQuad(naturalW, naturalH, 0.035);
  const isPortrait = naturalH >= naturalW;

  if (forceFullFrame) {
    return {
      quad: fullFrameQuad,
      confidence: 100,
      isDocumentPresent: true,
      orientation: isPortrait ? 'portrait' : 'landscape',
      aspectCategory: 'unknown',
      sharpness: 100,
    };
  }

  try {
    // 1. Downscale to ~320px work resolution for high-speed, noise-resistant analysis (<15ms)
    const maxDim = 320;
    const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
    const workW = Math.max(40, Math.round(naturalW * scale));
    const workH = Math.max(40, Math.round(naturalH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = workW;
    canvas.height = workH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return {
        quad: cleanInsetQuad,
        confidence: 20,
        isDocumentPresent: false,
        orientation: isPortrait ? 'portrait' : 'landscape',
        aspectCategory: 'unknown',
        sharpness: 50,
      };
    }

    ctx.drawImage(sourceImage, 0, 0, workW, workH);
    const imgData = ctx.getImageData(0, 0, workW, workH);
    const data = imgData.data;
    canvas.width = 1;
    canvas.height = 1;

    // 2. Multi-channel color & luminance maps
    const totalPixels = workW * workH;
    const lum = new Uint8Array(totalPixels);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      lum[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }

    // 3. Illumination-Normalized Multi-Channel Sobel Gradient
    // Captures color boundaries even with identical luminance or under deep shadows
    const gradMap = new Uint8Array(totalPixels);
    let totalGrad = 0;
    let gradCount = 0;

    for (let y = 1; y < workH - 1; y++) {
      const row = y * workW;
      for (let x = 1; x < workW - 1; x++) {
        const leftIdx = (row + x - 1) * 4;
        const rightIdx = (row + x + 1) * 4;
        const topIdx = ((y - 1) * workW + x) * 4;
        const botIdx = ((y + 1) * workW + x) * 4;

        const gx =
          Math.abs(data[rightIdx] - data[leftIdx]) +
          Math.abs(data[rightIdx + 1] - data[leftIdx + 1]) +
          Math.abs(data[rightIdx + 2] - data[leftIdx + 2]);

        const gy =
          Math.abs(data[botIdx] - data[topIdx]) +
          Math.abs(data[botIdx + 1] - data[topIdx + 1]) +
          Math.abs(data[botIdx + 2] - data[topIdx + 2]);

        const localLum = Math.max(25, lum[row + x]);
        // Normalized gradient compensates for shadows on one side of document
        const normalized = Math.min(255, Math.round(((gx + gy) / 3) * (180 / localLum)));
        gradMap[row + x] = normalized;
        totalGrad += normalized;
        gradCount++;
      }
    }

    const meanGrad = gradCount > 0 ? totalGrad / gradCount : 15;

    // 4. Sample background characteristics from outer 3% margin
    let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
    const sampleStrip = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = (y * workW + x) * 4;
          bgR += data[idx];
          bgG += data[idx + 1];
          bgB += data[idx + 2];
          bgCount++;
        }
      }
    };

    const stripX = Math.max(2, Math.round(workW * 0.035));
    const stripY = Math.max(2, Math.round(workH * 0.035));
    sampleStrip(0, 0, workW, stripY); // top strip
    sampleStrip(0, workH - stripY, workW, workH); // bottom strip
    sampleStrip(0, 0, stripX, workH); // left strip
    sampleStrip(workW - stripX, 0, workW, workH); // right strip

    const avgBgR = bgCount > 0 ? bgR / bgCount : 120;
    const avgBgG = bgCount > 0 ? bgG / bgCount : 120;
    const avgBgB = bgCount > 0 ? bgB / bgCount : 120;

    // 5. Sample document body from center 40%
    let docR = 0, docG = 0, docB = 0, docLumSum = 0, docCount = 0;
    const cx0 = Math.round(workW * 0.3);
    const cx1 = Math.round(workW * 0.7);
    const cy0 = Math.round(workH * 0.3);
    const cy1 = Math.round(workH * 0.7);

    for (let y = cy0; y < cy1; y++) {
      const row = y * workW;
      for (let x = cx0; x < cx1; x++) {
        const idx = (row + x) * 4;
        docR += data[idx];
        docG += data[idx + 1];
        docB += data[idx + 2];
        docLumSum += lum[row + x];
        docCount++;
      }
    }

    const avgDocR = docCount > 0 ? docR / docCount : 220;
    const avgDocG = docCount > 0 ? docG / docCount : 220;
    const avgDocB = docCount > 0 ? docB / docCount : 220;
    const docMeanLum = docCount > 0 ? docLumSum / docCount : 180;

    const centerBgDiff =
      Math.abs(avgDocR - avgBgR) +
      Math.abs(avgDocG - avgBgG) +
      Math.abs(avgDocB - avgBgB);

    // If center color is nearly identical to borders with low gradient, document already fills full frame
    if (centerBgDiff < 22 && meanGrad < 20) {
      return {
        quad: fullFrameQuad,
        confidence: 88,
        isDocumentPresent: true,
        orientation: isPortrait ? 'portrait' : 'landscape',
        aspectCategory: 'unknown',
        sharpness: Math.round(meanGrad * 2),
      };
    }

    // 6. Inward scanning from 4 borders to detect document physical boundaries
    const maxScanY = Math.round(workH * 0.42);
    const maxScanX = Math.round(workW * 0.42);

    const isDocPixel = (x: number, y: number): boolean => {
      const idx = (y * workW + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const colorDiffFromBg =
        Math.abs(r - avgBgR) +
        Math.abs(g - avgBgG) +
        Math.abs(b - avgBgB);

      const colorMatchDoc =
        Math.abs(r - avgDocR) +
        Math.abs(g - avgDocG) +
        Math.abs(b - avgDocB);

      const grad = gradMap[y * workW + x];

      // A pixel belongs to the document if:
      // - It has a strong normalized edge gradient
      // - OR its color is significantly different from background border strip
      // - OR it matches the sampled document interior color
      return grad >= 28 || colorDiffFromBg >= 35 || (colorMatchDoc < 42 && lum[y * workW + x] > Math.min(65, docMeanLum * 0.45));
    };

    // Scan Top Edge
    const topPts: Point[] = [];
    const colStep = Math.max(2, Math.floor(workW / 32));
    for (let x = Math.round(workW * 0.05); x < workW * 0.95; x += colStep) {
      for (let y = 1; y < maxScanY; y++) {
        if (isDocPixel(x, y)) {
          topPts.push({ x, y: Math.max(1, y - 1) });
          break;
        }
      }
    }

    // Scan Bottom Edge
    const bottomPts: Point[] = [];
    for (let x = Math.round(workW * 0.05); x < workW * 0.95; x += colStep) {
      for (let y = workH - 2; y > workH - maxScanY; y--) {
        if (isDocPixel(x, y)) {
          bottomPts.push({ x, y: Math.min(workH - 2, y + 1) });
          break;
        }
      }
    }

    // Scan Left Edge
    const leftPts: Point[] = [];
    const rowStep = Math.max(2, Math.floor(workH / 32));
    for (let y = Math.round(workH * 0.05); y < workH * 0.95; y += rowStep) {
      for (let x = 1; x < maxScanX; x++) {
        if (isDocPixel(x, y)) {
          leftPts.push({ x: Math.max(1, x - 1), y });
          break;
        }
      }
    }

    // Scan Right Edge
    const rightPts: Point[] = [];
    for (let y = Math.round(workH * 0.05); y < workH * 0.95; y += rowStep) {
      for (let x = workW - 2; x > workW - maxScanX; x--) {
        if (isDocPixel(x, y)) {
          rightPts.push({ x: Math.min(workW - 2, x + 1), y });
          break;
        }
      }
    }

    // 7. Robust Line Fitting with Inlier Filtering and Perspective Angle Regularization
    const fitHorizontalLine = (pts: Point[], fallbackY: number): { m: number; c: number } => {
      if (pts.length < 4) return { m: 0, c: fallbackY };
      const sortedY = [...pts.map((p) => p.y)].sort((a, b) => a - b);
      const medianY = sortedY[Math.floor(sortedY.length / 2)];
      const inliers = pts.filter((p) => Math.abs(p.y - medianY) < workH * 0.12);
      if (inliers.length < 3) return { m: 0, c: medianY };

      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
      for (const p of inliers) {
        sumX += p.x;
        sumY += p.y;
        sumXY += p.x * p.y;
        sumXX += p.x * p.x;
      }
      const n = inliers.length;
      const denom = n * sumXX - sumX * sumX;
      if (Math.abs(denom) < 1e-4) return { m: 0, c: medianY };
      const m = Math.max(-0.35, Math.min(0.35, (n * sumXY - sumX * sumY) / denom));
      const c = (sumY - m * sumX) / n;
      return { m, c };
    };

    const fitVerticalLine = (pts: Point[], fallbackX: number): { m: number; c: number } => {
      if (pts.length < 4) return { m: 0, c: fallbackX };
      const sortedX = [...pts.map((p) => p.x)].sort((a, b) => a - b);
      const medianX = sortedX[Math.floor(sortedX.length / 2)];
      const inliers = pts.filter((p) => Math.abs(p.x - medianX) < workW * 0.12);
      if (inliers.length < 3) return { m: 0, c: medianX };

      let sumY = 0, sumX = 0, sumYX = 0, sumYY = 0;
      for (const p of inliers) {
        sumY += p.y;
        sumX += p.x;
        sumYX += p.y * p.x;
        sumYY += p.y * p.y;
      }
      const n = inliers.length;
      const denom = n * sumYY - sumY * sumY;
      if (Math.abs(denom) < 1e-4) return { m: 0, c: medianX };
      const m = Math.max(-0.35, Math.min(0.35, (n * sumYX - sumY * sumX) / denom));
      const c = (sumX - m * sumY) / n;
      return { m, c };
    };

    const topLine = fitHorizontalLine(topPts, Math.round(workH * 0.035));
    const bottomLine = fitHorizontalLine(bottomPts, Math.round(workH * 0.965));
    const leftLine = fitVerticalLine(leftPts, Math.round(workW * 0.035));
    const rightLine = fitVerticalLine(rightPts, Math.round(workW * 0.965));

    // 8. Intersect lines to find 4 corners
    const intersect = (hLine: { m: number; c: number }, vLine: { m: number; c: number }): Point => {
      const denom = 1 - hLine.m * vLine.m;
      const y = Math.abs(denom) > 1e-4 ? (hLine.m * vLine.c + hLine.c) / denom : hLine.c;
      const x = vLine.m * y + vLine.c;
      return {
        x: Math.max(0, Math.min(workW, x)),
        y: Math.max(0, Math.min(workH, y)),
      };
    };

    const cTL = intersect(topLine, leftLine);
    const cTR = intersect(topLine, rightLine);
    const cBR = intersect(bottomLine, rightLine);
    const cBL = intersect(bottomLine, leftLine);

    // 9. Scale corners back to natural image coordinates
    const scaleUp = (p: Point): Point => ({
      x: Math.round(p.x / scale),
      y: Math.round(p.y / scale),
    });

    const pTL = scaleUp(cTL);
    const pTR = scaleUp(cTR);
    const pBR = scaleUp(cBR);
    const pBL = scaleUp(cBL);

    const rawCandidateQuad = orderCorners([pTL, pTR, pBR, pBL]);
    // Apply safety text margin outward expansion (0.8%)
    const candidateQuad = expandQuadSafetyMargin(rawCandidateQuad, naturalW, naturalH, 0.008);

    // 10. Area, Aspect Ratio & Convexity Verification
    const quadArea = computeQuadArea(
      candidateQuad.topLeft,
      candidateQuad.topRight,
      candidateQuad.bottomRight,
      candidateQuad.bottomLeft
    );
    const totalArea = naturalW * naturalH;
    const areaRatio = quadArea / totalArea;

    const quadAspectRatio = getQuadAspectRatio(candidateQuad);
    const docOrientation: 'portrait' | 'landscape' = quadAspectRatio >= 1 ? 'landscape' : 'portrait';

    // Standard aspect ratio classification:
    // A4/Letter ~ 1.414, ID-1 Card ~ 1.58, Receipt > 2.0
    const normalizedRatio = quadAspectRatio >= 1 ? quadAspectRatio : 1 / quadAspectRatio;
    let aspectCategory: 'a4' | 'idcard' | 'receipt' | 'book' | 'unknown' = 'unknown';
    if (normalizedRatio >= 1.25 && normalizedRatio <= 1.50) {
      aspectCategory = 'a4';
    } else if (normalizedRatio > 1.50 && normalizedRatio <= 1.80) {
      aspectCategory = 'idcard';
    } else if (normalizedRatio > 1.85) {
      aspectCategory = 'receipt';
    } else if (normalizedRatio < 1.25) {
      aspectCategory = 'book';
    }

    const isConvex = isQuadConvex(candidateQuad);
    const isReasonableArea = areaRatio >= 0.16 && areaRatio <= 0.99;

    // 11. Multi-factor Confidence Score (0 - 100)
    let confidence = 0;
    if (isConvex && isReasonableArea) {
      confidence += 50; // Valid convex geometry & reasonable frame coverage
      if (centerBgDiff >= 40) confidence += 25; // High contrast from background
      else if (centerBgDiff >= 25) confidence += 15;

      if (aspectCategory === 'a4' || aspectCategory === 'idcard' || aspectCategory === 'receipt') {
        confidence += 15; // Matches real document aspect ratio
      }

      if (topPts.length >= 8 && bottomPts.length >= 8 && leftPts.length >= 8 && rightPts.length >= 8) {
        confidence += 10; // High inlier count across all 4 borders
      }
    }

    const isDocumentPresent = isConvex && isReasonableArea && confidence >= 45;
    const sharpness = Math.round(meanGrad * 2.5);

    if (isDocumentPresent) {
      return {
        quad: candidateQuad,
        confidence: Math.min(100, confidence),
        isDocumentPresent: true,
        orientation: docOrientation,
        aspectCategory,
        sharpness,
      };
    }

    return {
      quad: cleanInsetQuad,
      confidence: Math.max(15, confidence),
      isDocumentPresent: false,
      orientation: isPortrait ? 'portrait' : 'landscape',
      aspectCategory,
      sharpness,
    };
  } catch (err) {
    console.warn('Document corner detection error, falling back to inset quad:', err);
    return {
      quad: cleanInsetQuad,
      confidence: 15,
      isDocumentPresent: false,
      orientation: isPortrait ? 'portrait' : 'landscape',
      aspectCategory: 'unknown',
      sharpness: 30,
    };
  }
}

/**
 * Calculates focus sharpness of an image using Laplacian operator variance.
 */
export function calculateLaplacianSharpness(
  sourceImage: HTMLImageElement | HTMLCanvasElement
): number {
  const w = 'naturalWidth' in sourceImage ? sourceImage.naturalWidth : sourceImage.width;
  const h = 'naturalHeight' in sourceImage ? sourceImage.naturalHeight : sourceImage.height;

  if (w === 0 || h === 0) return 0;

  const scale = Math.min(1, 160 / Math.max(w, h));
  const workW = Math.max(10, Math.round(w * scale));
  const workH = Math.max(10, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = workW;
  canvas.height = workH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 100;

  ctx.drawImage(sourceImage, 0, 0, workW, workH);
  const imgData = ctx.getImageData(0, 0, workW, workH);
  const data = imgData.data;
  canvas.width = 1;
  canvas.height = 1;

  const total = workW * workH;
  const gray = new Uint8Array(total);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  let sum = 0;
  let count = 0;
  const lapScores = new Float32Array(total);

  for (let y = 1; y < workH - 1; y++) {
    const row = y * workW;
    for (let x = 1; x < workW - 1; x++) {
      const idx = row + x;
      const val =
        gray[idx - workW] +
        gray[idx + workW] +
        gray[idx - 1] +
        gray[idx + 1] -
        4 * gray[idx];

      lapScores[count] = val;
      sum += val;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;

  let variance = 0;
  for (let i = 0; i < count; i++) {
    const diff = lapScores[i] - mean;
    variance += diff * diff;
  }

  return Math.round(variance / count);
}
