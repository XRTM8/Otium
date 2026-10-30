import type { BoardBackground, BoardSnippet, BoardStroke } from '../types';
import { buildPdfFromJpegPages, type PdfImagePage } from './pdfWriter';
import { drawBoardInk } from './boardInk';
import { boardAppearance } from './boardAppearance';

export interface ExportableBoardPage {
  id: string;
  strokes: BoardStroke[];
  background: BoardBackground;
  backgroundColor?: string;
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

  const appearance = boardAppearance('white', 'paper', false, page.backgroundColor || (page.background === 'dark' ? '#000000' : '#ffffff'));
  const isDark = appearance.dark;
  ctx.fillStyle = appearance.color;
  ctx.fillRect(0, 0, width, height);
  ctx.scale(width / 1920, height / 1080);
  if (page.background === 'grid') {
    ctx.fillStyle = appearance.pattern;
    for (let x = 20; x < 1920; x += 20) for (let y = 20; y < 1080; y += 20) {
      ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
    }
  } else if (page.background === 'ruled') {
    ctx.strokeStyle = appearance.pattern;
    ctx.lineWidth = 1;
    for (let y = 28; y < 1080; y += 28) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1920, y); ctx.stroke();
    }
  }
  drawBoardInk(ctx, page.strokes, isDark);

  // 3. Draw snippets (text quotes or image cards)
  for (const snip of snippets) {
    if (snip.type === 'text') {
      ctx.fillStyle = isDark ? '#1e293b' : '#f8fafc';
      ctx.strokeStyle = isDark ? '#334155' : '#e2e8f0';
      ctx.lineWidth = 1;

      // Rounded rectangle for card
      roundRect(ctx, snip.x, snip.y, snip.width, snip.height || 90, 8);
      ctx.fill();
      ctx.stroke();

      // Text inside snippet
      ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
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
  canvas.width = Math.max(2560, width * 2);
  canvas.height = Math.max(1440, height * 2);
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
  const targetWidth = Math.max(2560, width * 2);
  const targetHeight = Math.max(1440, height * 2);
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
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.98);
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
