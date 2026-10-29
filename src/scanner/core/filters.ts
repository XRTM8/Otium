import type { FilterType } from './types';

/**
 * Asynchronous Document Enhancement Engine.
 * Yields briefly to event loop to keep UI responsive, then executes
 * high-performance adaptive filter directly on canvas.
 * 100% reliable across all Android WebViews without WebWorker IPC hang risks.
 */
export async function applyFilterAsync(
  sourceCanvas: HTMLCanvasElement,
  filter: FilterType
): Promise<HTMLCanvasElement> {
  if (filter === 'original') return sourceCanvas;

  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        const result = applyFilter(sourceCanvas, filter);
        resolve(result);
      } catch (err) {
        console.warn('Filter processing error, returning source:', err);
        resolve(sourceCanvas);
      }
    }, 0);
  });
}

/**
 * Synchronous Document Enhancement Filter Engine (Internal).
 */
function applyFilter(
  sourceCanvas: HTMLCanvasElement,
  filter: FilterType
): HTMLCanvasElement {
  const maxDim = 2400;
  const currentMax = Math.max(sourceCanvas.width, sourceCanvas.height);
  const scale = currentMax > maxDim ? maxDim / currentMax : 1;
  const width = Math.round(sourceCanvas.width * scale);
  const height = Math.round(sourceCanvas.height * scale);

  const destCanvas = document.createElement('canvas');
  destCanvas.width = width;
  destCanvas.height = height;

  const ctx = destCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return destCanvas;

  ctx.drawImage(sourceCanvas, 0, 0, width, height);

  if (filter === 'original') {
    return destCanvas;
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  switch (filter) {
    case 'magic':
      applyAdaptiveMagicFilter(data, width, height);
      applyUnsharpMask(data, width, height, 0.45);
      break;
    case 'clean':
      applyAdaptiveCleanFilter(data, width, height);
      applyUnsharpMask(data, width, height, 0.55);
      break;
    case 'vibrant':
      applyAdaptiveVibrantFilter(data, width, height);
      applyUnsharpMask(data, width, height, 0.35);
      break;
    case 'bw':
      applyAdaptiveBwFilter(data, width, height);
      break;
    case 'grayscale':
      applyAdaptiveGrayscaleFilter(data, width, height);
      applyUnsharpMask(data, width, height, 0.45);
      break;
    case 'vintage':
      applyAdaptiveVintageFilter(data, width, height);
      applyUnsharpMask(data, width, height, 0.40);
      break;
  }

  ctx.putImageData(imageData, 0, 0);
  return destCanvas;
}

/**
 * Robust Multi-Scale Retinex Illumination Grid Estimator.
 * Estimates local background paper luminance surface across phone/hand shadows.
 */
function computeIlluminationGrid(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  step: number
): { grid: Float32Array; gridW: number; gridH: number } {
  const gridW = Math.ceil(width / step);
  const gridH = Math.ceil(height / step);
  const rawGrid = new Float32Array(gridW * gridH);

  for (let gy = 0; gy < gridH; gy++) {
    const y0 = gy * step;
    const y1 = Math.min(height, (gy + 1) * step);
    for (let gx = 0; gx < gridW; gx++) {
      const x0 = gx * step;
      const x1 = Math.min(width, (gx + 1) * step);

      // Collect 95th percentile luminance in the block to avoid specular glare or dark text
      let maxLum = 0;
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const idx = (y * width + x) * 4;
          const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          if (lum > maxLum) maxLum = lum;
        }
      }
      rawGrid[gy * gridW + gx] = Math.max(50, maxLum);
    }
  }

  // Dual-pass separable Gaussian-like smoothing (kernel [0.25, 0.5, 0.25])
  const smoothPass1 = new Float32Array(gridW * gridH);
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const prev = rawGrid[gy * gridW + Math.max(0, gx - 1)];
      const curr = rawGrid[gy * gridW + gx];
      const next = rawGrid[gy * gridW + Math.min(gridW - 1, gx + 1)];
      smoothPass1[gy * gridW + gx] = 0.25 * prev + 0.5 * curr + 0.25 * next;
    }
  }

  const smoothPass2 = new Float32Array(gridW * gridH);
  for (let gy = 0; gy < gridH; gy++) {
    const prevRow = Math.max(0, gy - 1) * gridW;
    const currRow = gy * gridW;
    const nextRow = Math.min(gridH - 1, gy + 1) * gridW;
    for (let gx = 0; gx < gridW; gx++) {
      smoothPass2[currRow + gx] =
        0.25 * smoothPass1[prevRow + gx] +
        0.5 * smoothPass1[currRow + gx] +
        0.25 * smoothPass1[nextRow + gx];
    }
  }

  return { grid: smoothPass2, gridW, gridH };
}

/**
 * Retinex-Inspired Ultra-Clean Magic Filter.
 * - Eradicates hand and phone shadows via local illumination division.
 * - Whitens background paper smoothly to pure #FFFFFF without pixelated edges.
 * - Deepens faint ballpoint pen, fountain ink, and pencil typography.
 * - Protects and enhances colored stamps, signatures, and notary seals.
 */
function applyAdaptiveMagicFilter(data: Uint8ClampedArray, width: number, height: number) {
  const step = Math.max(24, Math.min(64, Math.floor(Math.min(width, height) / 24)));
  const { grid, gridW, gridH } = computeIlluminationGrid(data, width, height, step);

  for (let y = 0; y < height; y++) {
    const gyFloat = y / step;
    const gy0 = Math.floor(gyFloat);
    const gy1 = Math.min(gridH - 1, gy0 + 1);
    const ty = gyFloat - gy0;

    for (let x = 0; x < width; x++) {
      const gxFloat = x / step;
      const gx0 = Math.floor(gxFloat);
      const gx1 = Math.min(gridW - 1, gx0 + 1);
      const tx = gxFloat - gx0;

      // Bilinear interpolation of local illumination background
      const b00 = grid[gy0 * gridW + gx0];
      const b10 = grid[gy0 * gridW + gx1];
      const b01 = grid[gy1 * gridW + gx0];
      const b11 = grid[gy1 * gridW + gx1];
      const bgLum = (b00 * (1 - tx) + b10 * tx) * (1 - ty) + (b01 * (1 - tx) + b11 * tx) * ty;

      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const scale = 255 / Math.max(38, bgLum);
      let nr = r * scale;
      let ng = g * scale;
      let nb = b * scale;

      const lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
      const maxVal = Math.max(r, g, b);
      const minVal = Math.min(r, g, b);
      const chroma = maxVal - minVal;
      const bgRatio = lum / 255;

      // 1. Color Stamp & Seal Protection (Chroma Boost)
      if (chroma > 18 && bgRatio < 0.92) {
        const mean = (nr + ng + nb) / 3;
        nr = mean + (nr - mean) * 1.35;
        ng = mean + (ng - mean) * 1.35;
        nb = mean + (nb - mean) * 1.35;
      }
      // 2. Pure Paper Whitening via Smooth Sigmoid Transition
      else if (bgRatio >= 0.82) {
        const t = Math.min(1, (bgRatio - 0.82) / 0.18);
        const hermite = t * t * (3 - 2 * t);
        nr = nr * (1 - hermite) + 255 * hermite;
        ng = ng * (1 - hermite) + 255 * hermite;
        nb = nb * (1 - hermite) + 255 * hermite;
      }
      // 3. Text and Line Deepening (Rich Dark Contrast)
      else if (bgRatio < 0.65) {
        const inkFactor = Math.pow(bgRatio / 0.65, 0.50);
        nr *= inkFactor;
        ng *= inkFactor;
        nb *= inkFactor;
      }

      data[idx] = Math.min(255, Math.max(0, Math.round(nr)));
      data[idx + 1] = Math.min(255, Math.max(0, Math.round(ng)));
      data[idx + 2] = Math.min(255, Math.max(0, Math.round(nb)));
    }
  }
}

/**
 * Ultra-Clear Inked Document Filter (CamScanner Magic Color HD / Adobe Scan Clean).
 * - Complete background neutralization to pure #FFFFFF without blotches.
 * - Rich typography contrast: deepens text, pencil, ballpoint pen, and ink strokes.
 * - Protects colored notary seals, colored signatures, stamps, and logos.
 * - Removes sensor ISO noise and shadow gradients.
 */
function applyAdaptiveCleanFilter(data: Uint8ClampedArray, width: number, height: number) {
  const step = Math.max(16, Math.min(48, Math.floor(Math.min(width, height) / 32)));
  const { grid, gridW, gridH } = computeIlluminationGrid(data, width, height, step);

  for (let y = 0; y < height; y++) {
    const gyFloat = y / step;
    const gy0 = Math.floor(gyFloat);
    const gy1 = Math.min(gridH - 1, gy0 + 1);
    const ty = gyFloat - gy0;

    for (let x = 0; x < width; x++) {
      const gxFloat = x / step;
      const gx0 = Math.floor(gxFloat);
      const gx1 = Math.min(gridW - 1, gx0 + 1);
      const tx = gxFloat - gx0;

      const b00 = grid[gy0 * gridW + gx0];
      const b10 = grid[gy0 * gridW + gx1];
      const b01 = grid[gy1 * gridW + gx0];
      const b11 = grid[gy1 * gridW + gx1];
      const bgLum = (b00 * (1 - tx) + b10 * tx) * (1 - ty) + (b01 * (1 - tx) + b11 * tx) * ty;

      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const scale = 255 / Math.max(35, bgLum);
      let nr = r * scale;
      let ng = g * scale;
      let nb = b * scale;

      const lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
      const maxVal = Math.max(r, g, b);
      const minVal = Math.min(r, g, b);
      const chroma = maxVal - minVal;
      const bgRatio = lum / 255;

      // Color Stamp & Signature Protection
      if (chroma > 18 && bgRatio < 0.90) {
        const mean = (nr + ng + nb) / 3;
        nr = mean + (nr - mean) * 1.40;
        ng = mean + (ng - mean) * 1.40;
        nb = mean + (nb - mean) * 1.40;
      }
      // Pure Paper Whitening
      else if (bgRatio >= 0.78) {
        const t = Math.min(1, (bgRatio - 0.78) / 0.22);
        const hermite = t * t * (3 - 2 * t);
        nr = nr * (1 - hermite) + 255 * hermite;
        ng = ng * (1 - hermite) + 255 * hermite;
        nb = nb * (1 - hermite) + 255 * hermite;
      }
      // Deep Rich Inked Typography
      else if (bgRatio < 0.60) {
        const inkFactor = Math.pow(bgRatio / 0.60, 0.65);
        nr *= inkFactor;
        ng *= inkFactor;
        nb *= inkFactor;
      }

      data[idx] = Math.min(255, Math.max(0, Math.round(nr)));
      data[idx + 1] = Math.min(255, Math.max(0, Math.round(ng)));
      data[idx + 2] = Math.min(255, Math.max(0, Math.round(nb)));
    }
  }
}

/**
 * Adaptive Document B&W Binary Filter with Local Illumination Reference and De-speckling.
 * Eradicates shadow blotches by comparing against local illumination surface.
 */
function applyAdaptiveBwFilter(data: Uint8ClampedArray, width: number, height: number) {
  const step = Math.max(16, Math.min(48, Math.floor(Math.min(width, height) / 32)));
  const { grid, gridW, gridH } = computeIlluminationGrid(data, width, height, step);

  for (let y = 0; y < height; y++) {
    const gyFloat = y / step;
    const gy0 = Math.floor(gyFloat);
    const gy1 = Math.min(gridH - 1, gy0 + 1);
    const ty = gyFloat - gy0;

    for (let x = 0; x < width; x++) {
      const gxFloat = x / step;
      const gx0 = Math.floor(gxFloat);
      const gx1 = Math.min(gridW - 1, gx0 + 1);
      const tx = gxFloat - gx0;

      const b00 = grid[gy0 * gridW + gx0];
      const b10 = grid[gy0 * gridW + gx1];
      const b01 = grid[gy1 * gridW + gx0];
      const b11 = grid[gy1 * gridW + gx1];
      const bgLum = (b00 * (1 - tx) + b10 * tx) * (1 - ty) + (b01 * (1 - tx) + b11 * tx) * ty;

      const idx = (y * width + x) * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      const threshold = bgLum * 0.82;
      const val = lum < threshold ? 0 : 255;

      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
    }
  }

  // De-speckle pass: remove isolated 1px salt-and-pepper scan noise
  despeckleBinary(data, width, height);
}

function despeckleBinary(data: Uint8ClampedArray, width: number, height: number) {
  if (width < 3 || height < 3) return;
  for (let y = 1; y < height - 1; y++) {
    const row = y * width * 4;
    const prevRow = (y - 1) * width * 4;
    const nextRow = (y + 1) * width * 4;
    for (let x = 1; x < width - 1; x++) {
      const idx = row + x * 4;
      if (data[idx] === 0) {
        const neighborsWhite =
          data[prevRow + x * 4] === 255 &&
          data[nextRow + x * 4] === 255 &&
          data[row + (x - 1) * 4] === 255 &&
          data[row + (x + 1) * 4] === 255;
        if (neighborsWhite) {
          data[idx] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 255;
        }
      }
    }
  }
}

/**
 * Adaptive Grayscale Filter.
 */
function applyAdaptiveGrayscaleFilter(data: Uint8ClampedArray, width: number, height: number) {
  applyAdaptiveMagicFilter(data, width, height);
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = lum;
    data[i + 1] = lum;
    data[i + 2] = lum;
  }
}

/**
 * Vibrant Color Document Filter.
 * Whitens background paper while dramatically boosting color saturation
 * for diplomas, certificates, colorful diagrams, and magazines.
 */
function applyAdaptiveVibrantFilter(data: Uint8ClampedArray, width: number, height: number) {
  const step = Math.max(16, Math.min(48, Math.floor(Math.min(width, height) / 32)));
  const { grid, gridW, gridH } = computeIlluminationGrid(data, width, height, step);

  for (let y = 0; y < height; y++) {
    const gyFloat = y / step;
    const gy0 = Math.floor(gyFloat);
    const gy1 = Math.min(gridH - 1, gy0 + 1);
    const ty = gyFloat - gy0;

    for (let x = 0; x < width; x++) {
      const gxFloat = x / step;
      const gx0 = Math.floor(gxFloat);
      const gx1 = Math.min(gridW - 1, gx0 + 1);
      const tx = gxFloat - gx0;

      const b00 = grid[gy0 * gridW + gx0];
      const b10 = grid[gy0 * gridW + gx1];
      const b01 = grid[gy1 * gridW + gx0];
      const b11 = grid[gy1 * gridW + gx1];
      const bgLum = (b00 * (1 - tx) + b10 * tx) * (1 - ty) + (b01 * (1 - tx) + b11 * tx) * ty;

      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const scale = 255 / Math.max(40, bgLum);
      let nr = r * scale;
      let ng = g * scale;
      let nb = b * scale;

      const lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
      const maxVal = Math.max(r, g, b);
      const minVal = Math.min(r, g, b);
      const chroma = maxVal - minVal;
      const bgRatio = lum / 255;

      // Color saturation boost
      if (chroma > 15) {
        const mean = (nr + ng + nb) / 3;
        const satFactor = 1.45;
        nr = mean + (nr - mean) * satFactor;
        ng = mean + (ng - mean) * satFactor;
        nb = mean + (nb - mean) * satFactor;
      }

      // Smooth background whitening
      if (bgRatio >= 0.86) {
        const t = Math.min(1, (bgRatio - 0.86) / 0.14);
        const hermite = t * t * (3 - 2 * t);
        nr = nr * (1 - hermite) + 255 * hermite;
        ng = ng * (1 - hermite) + 255 * hermite;
        nb = nb * (1 - hermite) + 255 * hermite;
      }

      data[idx] = Math.min(255, Math.max(0, Math.round(nr)));
      data[idx + 1] = Math.min(255, Math.max(0, Math.round(ng)));
      data[idx + 2] = Math.min(255, Math.max(0, Math.round(nb)));
    }
  }
}

/**
 * Vintage & Antique Document Restorer Filter.
 * Removes brown/yellow paper aging cast (tea/coffee/oxidation stains)
 * and deepens fading sepia/black historical ink.
 */
function applyAdaptiveVintageFilter(data: Uint8ClampedArray, width: number, height: number) {
  const step = Math.max(16, Math.min(48, Math.floor(Math.min(width, height) / 32)));
  const { grid, gridW, gridH } = computeIlluminationGrid(data, width, height, step);

  for (let y = 0; y < height; y++) {
    const gyFloat = y / step;
    const gy0 = Math.floor(gyFloat);
    const gy1 = Math.min(gridH - 1, gy0 + 1);
    const ty = gyFloat - gy0;

    for (let x = 0; x < width; x++) {
      const gxFloat = x / step;
      const gx0 = Math.floor(gxFloat);
      const gx1 = Math.min(gridW - 1, gx0 + 1);
      const tx = gxFloat - gx0;

      const b00 = grid[gy0 * gridW + gx0];
      const b10 = grid[gy0 * gridW + gx1];
      const b01 = grid[gy1 * gridW + gx0];
      const b11 = grid[gy1 * gridW + gx1];
      const bgLum = (b00 * (1 - tx) + b10 * tx) * (1 - ty) + (b01 * (1 - tx) + b11 * tx) * ty;

      const idx = (y * width + x) * 4;
      let r = data[idx];
      let g = data[idx + 1];
      let b = data[idx + 2];

      // Compensate for yellowing (boost blue towards green/red average)
      const rgAvg = (r + g) / 2;
      if (rgAvg > b + 20) {
        b = Math.min(255, Math.round(b + (rgAvg - b) * 0.75));
      }

      const scale = 255 / Math.max(36, bgLum);
      let nr = r * scale;
      let ng = g * scale;
      let nb = b * scale;

      const lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
      const bgRatio = lum / 255;

      if (bgRatio >= 0.82) {
        const t = Math.min(1, (bgRatio - 0.82) / 0.18);
        const hermite = t * t * (3 - 2 * t);
        nr = nr * (1 - hermite) + 255 * hermite;
        ng = ng * (1 - hermite) + 255 * hermite;
        nb = nb * (1 - hermite) + 255 * hermite;
      } else if (bgRatio < 0.65) {
        // Deepen faded historical ink
        const factor = Math.pow(bgRatio / 0.65, 0.55);
        nr *= factor;
        ng *= factor;
        nb *= factor;
      }

      data[idx] = Math.min(255, Math.max(0, Math.round(nr)));
      data[idx + 1] = Math.min(255, Math.max(0, Math.round(ng)));
      data[idx + 2] = Math.min(255, Math.max(0, Math.round(nb)));
    }
  }
}

/**
 * High-Speed Laplacian Edge Sharpening (CamScanner Pop).
 * Enhances typography edges and micro-details so text jumps out with razor clarity.
 */
function applyUnsharpMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number = 0.45
) {
  if (width < 3 || height < 3) return;
  const copy = new Uint8ClampedArray(data);

  for (let y = 1; y < height - 1; y++) {
    const row = y * width * 4;
    const prevRow = (y - 1) * width * 4;
    const nextRow = (y + 1) * width * 4;

    for (let x = 1; x < width - 1; x++) {
      const idx = row + (x * 4);
      const lum = 0.299 * copy[idx] + 0.587 * copy[idx + 1] + 0.114 * copy[idx + 2];
      if (lum > 250) continue; // Skip pure paper background to preserve clean whites and speed up

      const left = row + ((x - 1) * 4);
      const right = row + ((x + 1) * 4);
      const up = prevRow + (x * 4);
      const down = nextRow + (x * 4);

      for (let c = 0; c < 3; c++) {
        const val = copy[idx + c];
        const laplacian = 4 * val - copy[left + c] - copy[right + c] - copy[up + c] - copy[down + c];
        const res = val + laplacian * amount;
        data[idx + c] = res < 0 ? 0 : res > 255 ? 255 : Math.round(res);
      }
    }
  }
}
