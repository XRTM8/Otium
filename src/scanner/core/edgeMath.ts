/** Calculates focus sharpness of an image using Laplacian operator variance. */
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
  const data = ctx.getImageData(0, 0, workW, workH).data;
  canvas.width = 1;
  canvas.height = 1;

  const total = workW * workH;
  const gray = new Uint8Array(total);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0));
  }

  let sum = 0;
  let count = 0;
  const lapScores = new Float32Array(total);
  for (let y = 1; y < workH - 1; y++) {
    const row = y * workW;
    for (let x = 1; x < workW - 1; x++) {
      const idx = row + x;
      const val =
        (gray[idx - workW] ?? 0) +
        (gray[idx + workW] ?? 0) +
        (gray[idx - 1] ?? 0) +
        (gray[idx + 1] ?? 0) -
        4 * (gray[idx] ?? 0);
      lapScores[count] = val;
      sum += val;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  let variance = 0;
  for (let i = 0; i < count; i++) {
    const diff = (lapScores[i] ?? 0) - mean;
    variance += diff * diff;
  }
  return Math.round(variance / count);
}
