import { createScannedPdf } from './pdf';
import type {
  OcrWordToken,
  PdfCompressionPreset,
  PdfPageFormat,
  PdfPageInput,
  PdfWatermarkStyle,
} from './pdf';
import {
  loadPageCanvasFromDisk,
  storePageToDisk,
} from './storage/pageStore';
import { saveDocumentToLibrary } from './storage/documentLibrary';
import { dewarpBookCurvatureAsync } from './geometry';
import { extractPageTextAndMetadata } from './ocr/ocrEngine';
import type { ScannedPage } from './types';

export interface SignaturePlacement {
  dataUrl: string;
  x: number;
  y: number;
}

export async function burnRedactionOnPageCanvas({
  page,
  strokes,
  previewRect,
  onThumbnailUpdated,
}: {
  page: ScannedPage;
  strokes: { x: number; y: number }[][];
  previewRect: DOMRect;
  onThumbnailUpdated?: (pageId: string, thumbnailDataUrl: string, updates?: Partial<ScannedPage>) => void;
}): Promise<string> {
  const rawCanvas = await loadPageCanvasFromDisk(page.id);
  const ctx = rawCanvas.getContext('2d');
  if (!ctx || previewRect.width <= 0 || previewRect.height <= 0) throw new Error('Could not apply the redaction');

  const scaleX = rawCanvas.width / previewRect.width;

  ctx.strokeStyle = '#000000';
  ctx.fillStyle = '#000000';
  ctx.lineWidth = 18 * scaleX;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of strokes) {
    const firstPt = stroke[0];
    if (!firstPt) continue;
    ctx.beginPath();
    ctx.moveTo(firstPt.x * rawCanvas.width, firstPt.y * rawCanvas.height);
    for (let i = 1; i < stroke.length; i++) {
      const pt = stroke[i];
      if (!pt) continue;
      ctx.lineTo(pt.x * rawCanvas.width, pt.y * rawCanvas.height);
    }
    if (stroke.length === 1) {
      ctx.arc(firstPt.x * rawCanvas.width, firstPt.y * rawCanvas.height, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }

  const redacted = await new Promise<Blob>((resolve, reject) => {
    rawCanvas.toBlob((blob) => blob?.size ? resolve(blob) : reject(new Error('Could not save the redaction')), 'image/png');
  });
  const newThumb = await storePageToDisk(page.id, redacted, null, null, 'original', rawCanvas, true);
  onThumbnailUpdated?.(page.id, newThumb, { redacted: true, needsCropReview: false, filter: 'original' });
  return rawCanvas.toDataURL('image/jpeg', 0.9);
}

export async function compileScannedPdfDocument({
  pages,
  curvature,
  spinePos,
  signatures,
  enableOcr,
  compressionPreset,
  pageFormat,
  watermarkText,
  watermarkStyle,
  onOcrProgress,
  onOcrPageFailed,
}: {
  pages: ScannedPage[];
  curvature: number;
  spinePos: number;
  signatures: Record<string, SignaturePlacement>;
  enableOcr: boolean;
  compressionPreset: PdfCompressionPreset;
  pageFormat: PdfPageFormat;
  watermarkText: string;
  watermarkStyle: PdfWatermarkStyle;
  onOcrProgress: (page: number | null, count: number) => void;
  onOcrPageFailed?: () => void;
}): Promise<Blob> {
  async function* loadPages(): AsyncGenerator<PdfPageInput> {
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (!page) continue;
      const rawCanvas = await loadPageCanvasFromDisk(page.id);
      let processed = rawCanvas;
      try {
        if (curvature > 0) processed = await dewarpBookCurvatureAsync(rawCanvas, curvature, spinePos);

        const sig = signatures[page.id];
        if (sig) {
          const sigImg = new Image();
          await new Promise<void>((resolve, reject) => {
            sigImg.onload = () => resolve();
            sigImg.onerror = () => reject(new Error('Could not load the signature'));
            sigImg.src = sig.dataUrl;
          });
          const ctx = processed.getContext('2d');
          if (ctx) {
            const sigW = Math.round(processed.width * 0.32);
            const sigH = Math.round((sigImg.naturalHeight / sigImg.naturalWidth) * sigW);
            const posX = Math.round(sig.x * processed.width);
            const posY = Math.round(sig.y * processed.height);
            ctx.drawImage(sigImg, posX, posY, sigW, sigH);
          }
        }

        let words: OcrWordToken[] = [];
        if (enableOcr) {
          onOcrProgress(i + 1, pages.length);
          try {
            words = (await extractPageTextAndMetadata(processed, 'ara+eng')).words;
          } catch (error) {
            console.warn('Could not add OCR for scan page:', error);
            onOcrPageFailed?.();
          }
        }

        yield { canvas: processed, words };
      } finally {
        rawCanvas.width = rawCanvas.height = 1;
        if (processed !== rawCanvas) processed.width = processed.height = 1;
      }
    }
  }
  try {
    return await createScannedPdf(loadPages(), pages.length, compressionPreset, pageFormat, watermarkText, watermarkStyle);
  } finally {
    onOcrProgress(null, pages.length);
  }
}

export async function cacheCompiledPdfInLibrary(
  docTitle: string,
  pages: ScannedPage[],
  pdfBlob: Blob
): Promise<void> {
  try {
    await saveDocumentToLibrary({
      id: `doc_${Date.now()}`,
      title:
        docTitle.trim() ||
        `Scan — ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      pageCount: pages.length,
      thumbnail: pages[0]?.thumbnailDataUrl ?? '',
      pdfBlob,
    });
  } catch (e) {
    console.warn('Could not cache document to library:', e);
  }
}
