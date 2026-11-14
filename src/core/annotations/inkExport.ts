import type { PDFDocumentProxy } from 'pdfjs-dist';
import { paintInk, type InkMark } from './ink';
import { nativeSavePdf } from '../../scanner/core/nativeBridge';
import type { TextAnnotation } from '../types';

export function overlayPlacement(box: { x: number; y: number; width: number; height: number }, angle: number) {
  const rotation = ((angle % 360) + 360) % 360;
  return {
    x: box.x + (rotation === 180 || rotation === 270 ? box.width : 0),
    y: box.y + (rotation === 90 || rotation === 180 ? box.height : 0),
    width: rotation % 180 ? box.height : box.width,
    height: rotation % 180 ? box.width : box.height,
    rotation: -rotation
  };
}

export function toPageCoordinates(
  u: number,
  v: number,
  placement: ReturnType<typeof overlayPlacement>
): { x: number; y: number } {
  const rad = (placement.rotation * Math.PI) / 180;
  const localX = u * placement.width;
  const localY = (1 - v) * placement.height;
  return {
    x: placement.x + localX * Math.cos(rad) - localY * Math.sin(rad),
    y: placement.y + localX * Math.sin(rad) + localY * Math.cos(rad)
  };
}

export function parseHexColor(hex: string): { r: number; g: number; b: number } {
  let cleaned = hex.replace(/^#/, '');
  if (cleaned.length === 3) {
    cleaned = cleaned.split('').map(c => c + c).join('');
  }
  const match = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(cleaned);
  const rHex = match?.[1];
  const gHex = match?.[2];
  const bHex = match?.[3];
  if (!rHex || !gHex || !bHex) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(rHex, 16) / 255,
    g: parseInt(gHex, 16) / 255,
    b: parseInt(bHex, 16) / 255
  };
}

export async function exportInkPdf(
  doc: PDFDocumentProxy,
  marks: InkMark[],
  title: string,
  progress: (page: number) => void,
  annotations: TextAnnotation[] = []
): Promise<void> {
  const { PDFDocument, rgb, degrees, LineCapStyle } = await import('pdf-lib');
  const pdf = await PDFDocument.load(await doc.getData());

  const hasNotes = marks.some(mark => mark.type === 'note');
  if (hasNotes && typeof document !== 'undefined' && document.fonts) {
    await document.fonts.ready;
    await document.fonts.load('16px Tajawal', 'شرح Notes').catch(() => []);
  }

  const pages = pdf.getPages();
  for (let index = 0; index < pages.length; index++) {
    const ink = marks.filter(mark => mark.page === index + 1);
    const textAnnotations = annotations.filter(annotation => annotation.pageNumber === index + 1);
    if (!ink.length && !textAnnotations.length) continue;
    progress(index + 1);
    const page = pages[index];
    if (!page) continue;

    const placement = overlayPlacement(page.getCropBox(), page.getRotation().angle);

    // 1. Text annotations (vector highlights and underlines)
    for (const annotation of textAnnotations) {
      const c = parseHexColor(annotation.color);
      const pdfColor = rgb(c.r, c.g, c.b);
      const isHighlight = annotation.type === 'highlight';
      for (const rect of annotation.rects) {
        const height = isHighlight ? rect.heightPct * placement.height : Math.max(1.5, placement.width * 0.002);
        const yPctBottom = isHighlight ? rect.yPct + rect.heightPct : (rect.yPct + rect.heightPct);
        const bl = toPageCoordinates(rect.xPct, yPctBottom, placement);
        page.drawRectangle({
          x: bl.x,
          y: bl.y,
          width: rect.widthPct * placement.width,
          height,
          rotate: degrees(placement.rotation),
          color: pdfColor,
          opacity: isHighlight ? 0.3 : 1
        });
      }
    }

    // 2. Vector ink marks (pen and freehand highlighter)
    const vectorMarks = ink.filter(mark => mark.type !== 'note');
    for (const mark of vectorMarks) {
      if (!mark.points.length) continue;
      const c = parseHexColor(mark.color);
      const pdfColor = rgb(c.r, c.g, c.b);
      const opacity = mark.type === 'highlighter' ? 0.3 : 1;
      const thickness = mark.width * placement.width;

      const firstPoint = mark.points[0];
      if (mark.points.length === 1 && firstPoint) {
        const pt = toPageCoordinates(firstPoint.x, firstPoint.y, placement);
        page.drawCircle({
          x: pt.x,
          y: pt.y,
          size: thickness / 2,
          color: pdfColor,
          opacity
        });
      } else {
        for (let i = 1; i < mark.points.length; i++) {
          const ptPrev = mark.points[i - 1];
          const ptCurr = mark.points[i];
          if (!ptPrev || !ptCurr) continue;
          const p1 = toPageCoordinates(ptPrev.x, ptPrev.y, placement);
          const p2 = toPageCoordinates(ptCurr.x, ptCurr.y, placement);
          page.drawLine({
            start: p1,
            end: p2,
            thickness,
            color: pdfColor,
            opacity,
            lineCap: LineCapStyle.Round
          });
        }
      }
    }

    // 3. Typed note annotations (rendered via canvas overlay only when notes exist)
    const noteMarks = ink.filter(mark => mark.type === 'note');
    if (noteMarks.length > 0 && typeof document !== 'undefined') {
      const ratio = Math.min(2.5, 2200 / Math.max(placement.width, placement.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(placement.width * ratio));
      canvas.height = Math.max(1, Math.round(placement.height * ratio));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        paintInk(ctx, noteMarks, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(value => (value ? resolve(value) : reject(new Error('Unable to export annotations'))), 'image/png')
        );
        const image = await pdf.embedPng(await blob.arrayBuffer());
        page.drawImage(image, { ...placement, rotate: degrees(placement.rotation) });
      }
      canvas.width = canvas.height = 1;
    }
  }

  const output = await pdf.save();
  const saved = await nativeSavePdf(
    new Blob([output as BlobPart], { type: 'application/pdf' }),
    `${title.replace(/\.pdf$/i, '')}-annotated.pdf`
  );
  if (!saved) throw new Error('Unable to save the annotated PDF');
}
