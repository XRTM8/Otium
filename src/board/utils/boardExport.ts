import type { BoardBackground, BoardSnippet, BoardStroke } from '../types';
import { buildPdfFromJpegPages, type PdfImagePage } from './pdfWriter';

export interface ExportableBoardPage {
  id: string;
  strokes: BoardStroke[];
  background: BoardBackground;
}

/**
 * Render a single whiteboard page onto a canvas context at the specified resolution.
 */
export function renderBoardPageToContext(
  ctx: CanvasRenderingContext2D,
  page: ExportableBoardPage,
  width: number,
  height: number,
  snippets: BoardSnippet[] = []
): void {
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  // 1. Draw Background
  if (page.background === 'dark') {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);
  } else if (page.background === 'grid') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#cbd5e1';
    const spacing = 24;
    for (let x = spacing; x < width; x += spacing) {
      for (let y = spacing; y < height; y += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (page.background === 'ruled') {
    ctx.fillStyle = '#fcfbf9';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    const lineSpacing = 32;
    for (let y = lineSpacing; y < height; y += lineSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  } else {
    // Plain white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }

  // 2. Draw Vector Strokes with Bézier Curves
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of page.strokes) {
    if (!stroke.points || stroke.points.length === 0) continue;

    ctx.beginPath();
    const isDark = page.background === 'dark';
    if (stroke.tool === 'highlighter') {
      ctx.globalCompositeOperation = isDark ? 'screen' : 'multiply';
      ctx.strokeStyle = stroke.color || (isDark ? 'rgba(250, 204, 21, 0.45)' : 'rgba(250, 204, 21, 0.65)');
      ctx.lineWidth = stroke.width || 24;
      ctx.globalAlpha = isDark ? 0.45 : 0.65;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.globalAlpha = 1.0;
    }

    const pts = stroke.points;
    if (pts.length === 1) {
      ctx.arc(pts[0].x, pts[0].y, stroke.width / 2, 0, Math.PI * 2);
      ctx.fillStyle = stroke.color;
      ctx.fill();
      continue;
    }

    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i + 1].x) / 2;
      const yc = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
  }

  ctx.globalAlpha = 1.0;

  // 3. Draw snippets (text quotes or image cards)
  for (const snip of snippets) {
    if (snip.type === 'text') {
      ctx.fillStyle = page.background === 'dark' ? '#1e293b' : '#f8fafc';
      ctx.strokeStyle = page.background === 'dark' ? '#334155' : '#e2e8f0';
      ctx.lineWidth = 1;

      // Rounded rectangle for card
      roundRect(ctx, snip.x, snip.y, snip.width, snip.height || 90, 8);
      ctx.fill();
      ctx.stroke();

      // Text inside snippet
      ctx.fillStyle = page.background === 'dark' ? '#f8fafc' : '#0f172a';
      ctx.font = '13px Cairo, sans-serif';
      ctx.fillText(snip.content.slice(0, 60) + (snip.content.length > 60 ? '…' : ''), snip.x + 12, snip.y + 36);
    }
  }

  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Trigger browser file download from Blob.
 */
export function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Export current page as crisp PNG image.
 */
export async function exportPageToPng(
  page: ExportableBoardPage,
  width: number,
  height: number,
  snippets: BoardSnippet[],
  pageNumber: number
): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1280, width);
  canvas.height = Math.max(720, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  renderBoardPageToContext(ctx, page, canvas.width, canvas.height, snippets);

  return new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        const dateStr = new Date().toISOString().slice(0, 10);
        triggerFileDownload(blob, `Otium_Board_Page_${pageNumber}_${dateStr}.png`);
      }
      resolve();
    }, 'image/png');
  });
}

/**
 * Export all whiteboard pages as a single consolidated PDF document.
 */
export async function exportAllPagesToPdf(
  pages: ExportableBoardPage[],
  width: number,
  height: number,
  snippets: BoardSnippet[]
): Promise<void> {
  const targetWidth = Math.max(1280, width);
  const targetHeight = Math.max(720, height);
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const pdfPages: PdfImagePage[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    renderBoardPageToContext(ctx, page, targetWidth, targetHeight, snippets);

    const jpegBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92);
    });

    if (jpegBlob) {
      const buffer = await jpegBlob.arrayBuffer();
      pdfPages.push({
        width: targetWidth,
        height: targetHeight,
        jpegBytes: new Uint8Array(buffer)
      });
    }
  }

  if (pdfPages.length === 0) return;

  const pdfBytes = buildPdfFromJpegPages(pdfPages);
  const pdfBlob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerFileDownload(pdfBlob, `Otium_Lecture_Notes_${dateStr}.pdf`);
}
