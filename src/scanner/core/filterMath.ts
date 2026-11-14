/**
 * Illumination estimation and pixel clamping helpers shared across document enhancement filters.
 */

export function computeIlluminationGrid(
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

      let maxLum = 0;
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const idx = (y * width + x) * 4;
          const lum = 0.299 * (data[idx] ?? 0) + 0.587 * (data[idx + 1] ?? 0) + 0.114 * (data[idx + 2] ?? 0);
          if (lum > maxLum) maxLum = lum;
        }
      }
      rawGrid[gy * gridW + gx] = Math.max(50, maxLum);
    }
  }

  const smoothPass1 = new Float32Array(gridW * gridH);
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const prev = rawGrid[gy * gridW + Math.max(0, gx - 1)] ?? 0;
      const curr = rawGrid[gy * gridW + gx] ?? 0;
      const next = rawGrid[gy * gridW + Math.min(gridW - 1, gx + 1)] ?? 0;
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
        0.25 * (smoothPass1[prevRow + gx] ?? 0) +
        0.5 * (smoothPass1[currRow + gx] ?? 0) +
        0.25 * (smoothPass1[nextRow + gx] ?? 0);
    }
  }

  return { grid: smoothPass2, gridW, gridH };
}

export function sampleIllumination(
  grid: Float32Array,
  gridW: number,
  gridH: number,
  x: number,
  y: number,
  step: number
): number {
  const gyFloat = y / step;
  const gy0 = Math.floor(gyFloat);
  const gy1 = Math.min(gridH - 1, gy0 + 1);
  const ty = gyFloat - gy0;
  const gxFloat = x / step;
  const gx0 = Math.floor(gxFloat);
  const gx1 = Math.min(gridW - 1, gx0 + 1);
  const tx = gxFloat - gx0;
  const b00 = grid[gy0 * gridW + gx0] ?? 128;
  const b10 = grid[gy0 * gridW + gx1] ?? 128;
  const b01 = grid[gy1 * gridW + gx0] ?? 128;
  const b11 = grid[gy1 * gridW + gx1] ?? 128;
  return (b00 * (1 - tx) + b10 * tx) * (1 - ty) + (b01 * (1 - tx) + b11 * tx) * ty;
}

export function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}
