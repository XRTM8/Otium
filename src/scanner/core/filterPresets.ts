import { clampByte, computeIlluminationGrid, sampleIllumination } from './filterMath';

function boostChromaAndWhiten(
  nr: number,
  ng: number,
  nb: number,
  r: number,
  g: number,
  b: number,
  lum: number,
  chromaThreshold: number,
  maxChromaRatio: number,
  chromaBoost: number,
  whiteStart: number,
  inkStart: number,
  inkPower: number
): [number, number, number] {
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const bgRatio = lum / 255;

  if (chroma > chromaThreshold && bgRatio < maxChromaRatio) {
    const mean = (nr + ng + nb) / 3;
    return [
      mean + (nr - mean) * chromaBoost,
      mean + (ng - mean) * chromaBoost,
      mean + (nb - mean) * chromaBoost,
    ];
  }

  if (bgRatio >= whiteStart) {
    const t = Math.min(1, (bgRatio - whiteStart) / (1 - whiteStart));
    const hermite = t * t * (3 - 2 * t);
    return [
      nr * (1 - hermite) + 255 * hermite,
      ng * (1 - hermite) + 255 * hermite,
      nb * (1 - hermite) + 255 * hermite,
    ];
  }

  if (inkStart > 0 && bgRatio < inkStart) {
    const inkFactor = Math.pow(bgRatio / inkStart, inkPower);
    return [nr * inkFactor, ng * inkFactor, nb * inkFactor];
  }

  return [nr, ng, nb];
}

export function applyAdaptiveMagicFilter(data: Uint8ClampedArray, width: number, height: number): void {
  const step = Math.max(24, Math.min(64, Math.floor(Math.min(width, height) / 24)));
  const { grid, gridW, gridH } = computeIlluminationGrid(data, width, height, step);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bgLum = sampleIllumination(grid, gridW, gridH, x, y, step);
      const idx = (y * width + x) * 4;
      const r = data[idx] ?? 0;
      const g = data[idx + 1] ?? 0;
      const b = data[idx + 2] ?? 0;
      const scale = 255 / Math.max(38, bgLum);
      const sr = r * scale;
      const sg = g * scale;
      const sb = b * scale;
      const lum = 0.299 * sr + 0.587 * sg + 0.114 * sb;
      const [nr, ng, nb] = boostChromaAndWhiten(sr, sg, sb, r, g, b, lum, 18, 0.92, 1.35, 0.82, 0.65, 0.50);
      data[idx] = clampByte(nr);
      data[idx + 1] = clampByte(ng);
      data[idx + 2] = clampByte(nb);
    }
  }
}

export function applyAdaptiveCleanFilter(data: Uint8ClampedArray, width: number, height: number): void {
  const step = Math.max(16, Math.min(48, Math.floor(Math.min(width, height) / 32)));
  const { grid, gridW, gridH } = computeIlluminationGrid(data, width, height, step);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bgLum = sampleIllumination(grid, gridW, gridH, x, y, step);
      const idx = (y * width + x) * 4;
      const r = data[idx] ?? 0;
      const g = data[idx + 1] ?? 0;
      const b = data[idx + 2] ?? 0;
      const scale = 255 / Math.max(35, bgLum);
      const sr = r * scale;
      const sg = g * scale;
      const sb = b * scale;
      const lum = 0.299 * sr + 0.587 * sg + 0.114 * sb;
      const [nr, ng, nb] = boostChromaAndWhiten(sr, sg, sb, r, g, b, lum, 18, 0.90, 1.40, 0.78, 0.60, 0.65);
      data[idx] = clampByte(nr);
      data[idx + 1] = clampByte(ng);
      data[idx + 2] = clampByte(nb);
    }
  }
}

export function applyAdaptiveBwFilter(data: Uint8ClampedArray, width: number, height: number): void {
  const step = Math.max(16, Math.min(48, Math.floor(Math.min(width, height) / 32)));
  const { grid, gridW, gridH } = computeIlluminationGrid(data, width, height, step);
  const luminance = new Uint8Array(width * height);
  for (let i = 0; i < luminance.length; i++) {
    luminance[i] = Math.round(0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!);
  }
  const radius = Math.max(2, Math.min(10, Math.round(Math.min(width, height) / 240)));
  for (let y = 0; y < height; y++) {
    const above = Math.max(0, y - radius) * width;
    const below = Math.min(height - 1, y + radius) * width;
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const background = sampleIllumination(grid, gridW, gridH, x, y, step);
      const left = Math.max(0, x - radius);
      const right = Math.min(width - 1, x + radius);
      // An ink stroke has lighter paper on both sides along at least one axis.
      const paper = Math.max(
        Math.min(luminance[above + x]!, luminance[below + x]!),
        Math.min(luminance[row + left]!, luminance[row + right]!),
        Math.min(luminance[above + left]!, luminance[below + right]!),
        Math.min(luminance[above + right]!, luminance[below + left]!),
      );
      const lum = luminance[row + x]!;
      const deficit = paper - lum;
      const darkInk = lum < background * 0.55;
      const localInk = deficit >= Math.max(12, paper * 0.068) || (lum < background * 0.77 && deficit > 5);
      const val = darkInk || localInk ? 0 : 255;
      const idx = (row + x) * 4;
      data[idx] = data[idx + 1] = data[idx + 2] = val;
    }
  }
}

export function applyAdaptiveGrayscaleFilter(data: Uint8ClampedArray, width: number, height: number): void {
  applyAdaptiveMagicFilter(data, width, height);
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const lum = 0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0);
    data[i] = lum;
    data[i + 1] = lum;
    data[i + 2] = lum;
  }
}

export function applyAdaptiveVibrantFilter(data: Uint8ClampedArray, width: number, height: number): void {
  const step = Math.max(16, Math.min(48, Math.floor(Math.min(width, height) / 32)));
  const { grid, gridW, gridH } = computeIlluminationGrid(data, width, height, step);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bgLum = sampleIllumination(grid, gridW, gridH, x, y, step);
      const idx = (y * width + x) * 4;
      const r = data[idx] ?? 0;
      const g = data[idx + 1] ?? 0;
      const b = data[idx + 2] ?? 0;
      const scale = 255 / Math.max(40, bgLum);
      let nr = r * scale;
      let ng = g * scale;
      let nb = b * scale;
      const lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      const bgRatio = lum / 255;

      if (chroma > 15) {
        const mean = (nr + ng + nb) / 3;
        nr = mean + (nr - mean) * 1.45;
        ng = mean + (ng - mean) * 1.45;
        nb = mean + (nb - mean) * 1.45;
      }

      if (bgRatio >= 0.86) {
        const t = Math.min(1, (bgRatio - 0.86) / 0.14);
        const hermite = t * t * (3 - 2 * t);
        nr = nr * (1 - hermite) + 255 * hermite;
        ng = ng * (1 - hermite) + 255 * hermite;
        nb = nb * (1 - hermite) + 255 * hermite;
      }

      data[idx] = clampByte(nr);
      data[idx + 1] = clampByte(ng);
      data[idx + 2] = clampByte(nb);
    }
  }
}

export function applyAdaptiveVintageFilter(data: Uint8ClampedArray, width: number, height: number): void {
  const step = Math.max(16, Math.min(48, Math.floor(Math.min(width, height) / 32)));
  const { grid, gridW, gridH } = computeIlluminationGrid(data, width, height, step);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bgLum = sampleIllumination(grid, gridW, gridH, x, y, step);
      const idx = (y * width + x) * 4;
      const r = data[idx] ?? 0;
      const g = data[idx + 1] ?? 0;
      let b = data[idx + 2] ?? 0;

      const rgAvg = (r + g) / 2;
      if (rgAvg > b + 20) {
        b = Math.min(255, Math.round(b + (rgAvg - b) * 0.75));
      }

      const scale = 255 / Math.max(36, bgLum);
      let nr = r * scale;
      let ng = g * scale;
      let nb = b * scale;
      const bgRatio = (0.299 * nr + 0.587 * ng + 0.114 * nb) / 255;

      if (bgRatio >= 0.82) {
        const t = Math.min(1, (bgRatio - 0.82) / 0.18);
        const hermite = t * t * (3 - 2 * t);
        nr = nr * (1 - hermite) + 255 * hermite;
        ng = ng * (1 - hermite) + 255 * hermite;
        nb = nb * (1 - hermite) + 255 * hermite;
      } else if (bgRatio < 0.65) {
        const factor = Math.pow(bgRatio / 0.65, 0.55);
        nr *= factor;
        ng *= factor;
        nb *= factor;
      }

      data[idx] = clampByte(nr);
      data[idx + 1] = clampByte(ng);
      data[idx + 2] = clampByte(nb);
    }
  }
}

export function applyUnsharpMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number = 0.45
): void {
  if (width < 3 || height < 3) return;
  const copy = new Uint8ClampedArray(data);

  for (let y = 1; y < height - 1; y++) {
    const row = y * width * 4;
    const prevRow = (y - 1) * width * 4;
    const nextRow = (y + 1) * width * 4;

    for (let x = 1; x < width - 1; x++) {
      const idx = row + x * 4;
      const lum = 0.299 * (copy[idx] ?? 0) + 0.587 * (copy[idx + 1] ?? 0) + 0.114 * (copy[idx + 2] ?? 0);
      if (lum > 250) continue;

      const left = row + (x - 1) * 4;
      const right = row + (x + 1) * 4;
      const up = prevRow + x * 4;
      const down = nextRow + x * 4;

      for (let c = 0; c < 3; c++) {
        const val = copy[idx + c] ?? 0;
        const laplacian = 4 * val - (copy[left + c] ?? 0) - (copy[right + c] ?? 0) - (copy[up + c] ?? 0) - (copy[down + c] ?? 0);
        data[idx + c] = clampByte(val + laplacian * amount);
      }
    }
  }
}
