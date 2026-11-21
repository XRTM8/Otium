import type { PDFDocument, PDFPage, PDFArray } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { TextAnnotation } from '../types';
import type { InkMark } from './ink';

/**
 * ISO 32000-1 PDF Annotation Support.
 * Connects Otium's local annotations with standard PDF viewer ecosystems
 * (Adobe Acrobat, Apple Books, GoodNotes, Xodo, etc.).
 */

export function overlayPlacement(box: { x: number; y: number; width: number; height: number }, angle: number) {
  const rotation = ((angle % 360) + 360) % 360;
  return {
    x: box.x + (rotation === 180 || rotation === 270 ? box.width : 0),
    y: box.y + (rotation === 90 || rotation === 180 ? box.height : 0),
    width: rotation % 180 ? box.height : box.width,
    height: rotation % 180 ? box.width : box.height,
    rotation: -rotation,
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
    y: placement.y + localX * Math.sin(rad) + localY * Math.cos(rad),
  };
}

export function parseHexColor(hex: string): { r: number; g: number; b: number } {
  let cleaned = hex.replace(/^#/, '');
  if (cleaned.length === 3) {
    cleaned = cleaned.split('').map((c) => c + c).join('');
  }
  const match = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(cleaned);
  const rHex = match?.[1];
  const gHex = match?.[2];
  const bHex = match?.[3];
  if (!rHex || !gHex || !bHex) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(rHex, 16) / 255,
    g: parseInt(gHex, 16) / 255,
    b: parseInt(bHex, 16) / 255,
  };
}

export type OverlayPlacementResult = ReturnType<typeof overlayPlacement>;

/**
 * Appends standard ISO 32000-1 PDF annotation dictionaries to a pdf-lib PDFPage.
 */
export async function attachStandardPdfAnnotations(
  pdf: PDFDocument,
  page: PDFPage,
  textAnnotations: TextAnnotation[],
  inkMarks: InkMark[],
  placement: OverlayPlacementResult
): Promise<void> {
  const { PDFName, PDFArray: PDFArrayClass, PDFHexString } = await import('pdf-lib');

  const annots = page.node.get(PDFName.of('Annots'));
  let annotsArray: PDFArray;
  if (annots instanceof PDFArrayClass) {
    annotsArray = annots;
  } else {
    annotsArray = pdf.context.obj([]);
    page.node.set(PDFName.of('Annots'), annotsArray);
  }

  // 1. Highlight and Underline annotations (ISO 32000-1 Section 12.5.6.10)
  for (const annotation of textAnnotations) {
    const c = parseHexColor(annotation.color);
    const isHighlight = annotation.type === 'highlight';

    for (const rect of annotation.rects) {
      const bl = toPageCoordinates(rect.xPct, rect.yPct + rect.heightPct, placement);
      const tr = toPageCoordinates(rect.xPct + rect.widthPct, rect.yPct, placement);

      const minX = Math.min(bl.x, tr.x);
      const maxX = Math.max(bl.x, tr.x);
      const minY = Math.min(bl.y, tr.y);
      const maxY = Math.max(bl.y, tr.y);

      // QuadPoints: 8 numbers per quad (x1, y1, x2, y2, x3, y3, x4, y4)
      // Top-left, Top-right, Bottom-left, Bottom-right in user space
      const quadPoints = [minX, maxY, maxX, maxY, minX, minY, maxX, minY];

      const annotDict = pdf.context.obj({
        Type: 'Annot',
        Subtype: isHighlight ? 'Highlight' : 'Underline',
        Rect: [minX, minY, maxX, maxY],
        QuadPoints: quadPoints,
        C: [c.r, c.g, c.b],
        CA: isHighlight ? 0.35 : 1.0,
        F: 4, // Print flag: annotation will print if document is printed
        Contents: PDFHexString.fromText(annotation.text || annotation.note || ''),
      });

      const annotRef = pdf.context.register(annotDict);
      annotsArray.push(annotRef);
    }
  }

  // 2. Vector Ink annotations (ISO 32000-1 Section 12.5.6.14)
  const vectorMarks = inkMarks.filter((m) => m.type !== 'note');
  for (const mark of vectorMarks) {
    if (!mark.points.length) continue;
    const c = parseHexColor(mark.color);
    const opacity = mark.type === 'highlighter' ? 0.35 : 1.0;
    const thickness = mark.width * placement.width;

    const coords: number[] = [];
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const p of mark.points) {
      const pt = toPageCoordinates(p.x, p.y, placement);
      coords.push(pt.x, pt.y);
      minX = Math.min(minX, pt.x);
      maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y);
      maxY = Math.max(maxY, pt.y);
    }

    const padding = Math.max(thickness, 2);
    const annotDict = pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Ink',
      Rect: [minX - padding, minY - padding, maxX + padding, maxY + padding],
      InkList: [coords],
      C: [c.r, c.g, c.b],
      CA: opacity,
      BS: pdf.context.obj({
        Type: 'Border',
        W: Math.max(1, thickness),
      }),
      F: 4,
    });

    const annotRef = pdf.context.register(annotDict);
    annotsArray.push(annotRef);
  }

  // 3. Text Sticky Notes (ISO 32000-1 Section 12.5.6.4)
  const noteMarks = inkMarks.filter((m) => m.type === 'note');
  for (const note of noteMarks) {
    const pt = note.points[0] ? toPageCoordinates(note.points[0].x, note.points[0].y, placement) : { x: 50, y: 50 };
    const c = parseHexColor(note.color);

    const annotDict = pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [pt.x, pt.y, pt.x + 24, pt.y + 24],
      Contents: PDFHexString.fromText(note.text || ''),
      C: [c.r, c.g, c.b],
      Name: 'Comment',
      F: 4,
    });

    const annotRef = pdf.context.register(annotDict);
    annotsArray.push(annotRef);
  }
}

/**
 * Reads existing native PDF annotations from a pdfjs-dist PDFDocumentProxy
 * (e.g. highlights created in Acrobat or Apple Books) and maps them to Otium annotations.
 */
export async function extractExistingPdfAnnotations(doc: PDFDocumentProxy): Promise<TextAnnotation[]> {
  const result: TextAnnotation[] = [];
  const numPages = doc.numPages;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    try {
      const page = await doc.getPage(pageNum);
      const annots = await page.getAnnotations();
      const viewport = page.getViewport({ scale: 1 });

      for (const a of annots) {
        if (!a || !a.subtype) continue;

        if (a.subtype === 'Highlight' || a.subtype === 'Underline') {
          const rect = a.rect;
          if (Array.isArray(rect) && rect.length >= 4) {
            const x1 = Math.min(rect[0], rect[2]);
            const x2 = Math.max(rect[0], rect[2]);
            const y1 = Math.min(rect[1], rect[3]);
            const y2 = Math.max(rect[1], rect[3]);

            const widthPct = Math.max(0.005, (x2 - x1) / viewport.width);
            const heightPct = Math.max(0.005, (y2 - y1) / viewport.height);
            const xPct = Math.max(0, Math.min(1, x1 / viewport.width));
            const yPct = Math.max(0, Math.min(1, (viewport.height - y2) / viewport.height));

            let colorHex = '#fde047';
            if (Array.isArray(a.color) && a.color.length >= 3) {
              const r = Math.round(a.color[0] <= 1 ? a.color[0] * 255 : a.color[0]);
              const g = Math.round(a.color[1] <= 1 ? a.color[1] * 255 : a.color[1]);
              const b = Math.round(a.color[2] <= 1 ? a.color[2] * 255 : a.color[2]);
              colorHex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
            }

            result.push({
              id: a.id ? `imported-${a.id}` : `imported-${pageNum}-${result.length}`,
              pageNumber: pageNum,
              type: a.subtype === 'Highlight' ? 'highlight' : 'underline',
              color: colorHex,
              rects: [{ xPct, yPct, widthPct, heightPct }],
              text: (a.contentsObj?.str || a.contents || '').trim(),
              createdAt: a.modificationDate ? new Date(a.modificationDate).getTime() : Date.now(),
            });
          }
        }
      }
    } catch {
      // Continue inspecting subsequent pages on transient parse failure
    }
  }

  return result;
}
