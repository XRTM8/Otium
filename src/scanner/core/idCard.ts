import { canvasToPngBytes, drawPngBytesOnCanvas, stitchIdCardWithRust } from '../../platform/rustEngine';

export async function mergeIdCardSidesToA4(
  frontCanvas: HTMLCanvasElement,
  backCanvas: HTMLCanvasElement
): Promise<HTMLCanvasElement> {
  const a4Width = 2480;
  const a4Height = 3508;
  const canvas = document.createElement('canvas');
  canvas.width = a4Width;
  canvas.height = a4Height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare the ID card page');

  // Prefer native multi-threaded Rust compositor when running under Tauri Desktop/Android.
  try {
    const [frontPng, backPng] = await Promise.all([
      canvasToPngBytes(frontCanvas),
      canvasToPngBytes(backCanvas),
    ]);
    if (frontPng && backPng) {
      const nativeA4 = await stitchIdCardWithRust(frontPng, backPng);
      if (nativeA4 && nativeA4.byteLength > 0 && (await drawPngBytesOnCanvas(nativeA4, canvas, ctx, true))) {
        return canvas;
      }
    }
  } catch {
    // Fall back transparently to Canvas 2D compositor.
  }

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, a4Width, a4Height);
  ctx.imageSmoothingQuality = 'high';
  const drawSide = (side: HTMLCanvasElement, centerY: number) => {
    const scale = Math.min(1010 / side.width, 640 / side.height);
    const width = side.width * scale;
    const height = side.height * scale;
    ctx.drawImage(side, (a4Width - width) / 2, centerY - height / 2, width, height);
  };
  drawSide(frontCanvas, a4Height / 3);
  drawSide(backCanvas, a4Height * 2 / 3);
  return canvas;
}
