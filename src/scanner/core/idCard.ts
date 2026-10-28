/**
 * Enterprise ID Card & Passport 2-in-1 Merger Engine.
 * Aligns Front & Back sides of national IDs, driver licenses, or passports
 * onto a single standardized ISO A4 page ready for official submission.
 */

export async function mergeIdCardSidesToA4(
  frontCanvas: HTMLCanvasElement,
  backCanvas: HTMLCanvasElement
): Promise<HTMLCanvasElement> {
  const a4Width = 1800;
  const a4Height = 2545; // Standard ISO A4 1:1.414 ratio at 220 DPI

  const canvas = document.createElement('canvas');
  canvas.width = a4Width;
  canvas.height = a4Height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return frontCanvas;

  // 1. Crisp white background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, a4Width, a4Height);

  // 2. Compute standardized ID-1 card dimensions (85.6mm x 53.98mm -> 1.586 ratio)
  const cardW = Math.round(a4Width * 0.65); // 1170px
  const cardH = Math.round(cardW / 1.586); // ~738px
  const cardX = Math.round((a4Width - cardW) / 2);

  const frontY = Math.round(a4Height * 0.12);
  const backY = Math.round(a4Height * 0.54);
  const borderRadius = 28;

  function pathRoundRect(c: CanvasRenderingContext2D, rx: number, ry: number, rw: number, rh: number, r: number) {
    if (typeof c.roundRect === 'function') {
      c.roundRect(rx, ry, rw, rh, r);
    } else {
      c.moveTo(rx + r, ry);
      c.lineTo(rx + rw - r, ry);
      c.arcTo(rx + rw, ry, rx + rw, ry + r, r);
      c.lineTo(rx + rw, ry + rh - r);
      c.arcTo(rx + rw, ry + rh, rx + rw - r, ry + rh, r);
      c.lineTo(rx + r, ry + rh);
      c.arcTo(rx, ry + rh, rx, ry + rh - r, r);
      c.lineTo(rx, ry + r);
      c.arcTo(rx, ry, rx + r, ry, r);
    }
  }

  function drawRoundedCard(source: HTMLCanvasElement, x: number, y: number, label: string) {
    if (!ctx) return;

    ctx.save();
    // Subtle drop shadow for realistic card effect
    ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;

    // Rounded rectangle path
    ctx.beginPath();
    pathRoundRect(ctx, x, y, cardW, cardH, borderRadius);
    ctx.clip();

    // Object-fit: cover inside rounded card boundary to avoid any stretching distortion
    const srcRatio = source.width / Math.max(1, source.height);
    const targetRatio = cardW / cardH;
    let sx = 0;
    let sy = 0;
    let sw = source.width;
    let sh = source.height;
    if (srcRatio > targetRatio) {
      sw = Math.round(source.height * targetRatio);
      sx = Math.round((source.width - sw) / 2);
    } else {
      sh = Math.round(source.width / targetRatio);
      sy = Math.round((source.height - sh) / 2);
    }

    ctx.drawImage(source, sx, sy, sw, sh, x, y, cardW, cardH);
    ctx.restore();

    // 1px subtle card border
    ctx.save();
    ctx.strokeStyle = '#D1D5DB';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    pathRoundRect(ctx, x, y, cardW, cardH, borderRadius);
    ctx.stroke();
    ctx.restore();

    // Side Label
    ctx.save();
    ctx.fillStyle = '#6B7280';
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, a4Width / 2, y + cardH + 34);
    ctx.restore();
  }

  // Draw Front & Back cards
  drawRoundedCard(frontCanvas, cardX, frontY, 'FRONT SIDE');
  drawRoundedCard(backCanvas, cardX, backY, 'BACK SIDE');

  // Subtle header & security watermark
  ctx.save();
  ctx.fillStyle = '#9CA3AF';
  ctx.font = '500 18px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('STANDARDIZED IDENTITY DOCUMENT (ISO/IEC 7810 ID-1)', a4Width / 2, 70);

  // Center dashed dividing line between cards
  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  const midY = Math.round((frontY + cardH + backY) / 2);
  ctx.moveTo(cardX - 40, midY);
  ctx.lineTo(cardX + cardW + 40, midY);
  ctx.stroke();
  ctx.restore();

  return canvas;
}
