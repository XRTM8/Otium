import type { PDFDocumentProxy } from 'pdfjs-dist';
import { paintInk, type InkMark } from './ink';
import { nativeSavePdf } from '../../scanner/core/nativeBridge';

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

export async function exportInkPdf(doc: PDFDocumentProxy, marks: InkMark[], title: string, progress: (page: number) => void): Promise<void> {
  const { PDFDocument, degrees } = await import('pdf-lib');
  const pdf = await PDFDocument.load(await doc.getData());
  await document.fonts.ready;
  await document.fonts.load('16px Tajawal', 'شرح Notes').catch(() => []);
  const pages = pdf.getPages();
  for (let index = 0; index < pages.length; index++) {
    const ink = marks.filter(mark => mark.page === index + 1);
    if (!ink.length) continue;
    progress(index + 1);
    const page = pages[index];
    const placement = overlayPlacement(page.getCropBox(), page.getRotation().angle);
    const ratio = Math.min(2.5, 2200 / Math.max(placement.width, placement.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(placement.width * ratio));
    canvas.height = Math.max(1, Math.round(placement.height * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Unable to prepare the annotations for export');
    paintInk(ctx, ink, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Unable to export annotations')), 'image/png'));
    const image = await pdf.embedPng(await blob.arrayBuffer());
    page.drawImage(image, { ...placement, rotate: degrees(placement.rotation) });
    canvas.width = canvas.height = 1;
  }
  const output = await pdf.save();
  const saved = await nativeSavePdf(new Blob([output as BlobPart], { type: 'application/pdf' }), `${title.replace(/\.pdf$/i, '')}-annotated.pdf`);
  if (!saved) throw new Error('Unable to save the annotated PDF');
}
