import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFArray } from 'pdf-lib';
import {
  attachStandardPdfAnnotations,
  extractExistingPdfAnnotations,
  overlayPlacement,
} from './standardPdfAnnotations';

describe('Standard ISO 32000-1 PDF Annotations', () => {
  it('attaches standard Highlight, Ink, and Note annotations to PDF pages', async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([600, 800]);
    const placement = overlayPlacement(page.getCropBox(), 0);

    await attachStandardPdfAnnotations(
      pdf,
      page,
      [
        {
          id: 'hl-test-1',
          pageNumber: 1,
          type: 'highlight',
          color: '#fde047',
          rects: [{ xPct: 0.1, yPct: 0.1, widthPct: 0.5, heightPct: 0.05 }],
          text: 'Standard Highlight Text',
          createdAt: Date.now(),
        },
        {
          id: 'ul-test-1',
          pageNumber: 1,
          type: 'underline',
          color: '#3b82f6',
          rects: [{ xPct: 0.1, yPct: 0.2, widthPct: 0.5, heightPct: 0.02 }],
          text: 'Underlined Reference',
          createdAt: Date.now(),
        },
      ],
      [
        {
          id: 'ink-test-1',
          page: 1,
          type: 'pen',
          color: '#e11d48',
          width: 0.005,
          points: [
            { x: 0.2, y: 0.3 },
            { x: 0.4, y: 0.5 },
          ],
        },
        {
          id: 'note-test-1',
          page: 1,
          type: 'note',
          color: '#f59e0b',
          width: 0.01,
          points: [{ x: 0.7, y: 0.2 }],
          text: 'This is a reviewer sticky note',
        },
      ],
      placement
    );

    const saved = await pdf.save();
    const loaded = await PDFDocument.load(saved);
    const loadedPage = loaded.getPages()[0];

    const annots = loadedPage.node.get(PDFName.of('Annots'));
    expect(annots).toBeInstanceOf(PDFArray);
    // 2 text annotations (1 highlight + 1 underline) + 1 ink + 1 text note = 4 annotations
    expect((annots as PDFArray).size()).toBe(4);
  });

  it('extracts existing native annotations from a PDF document proxy', async () => {
    const mockAnnotations = [
      {
        id: 'external-hl-1',
        subtype: 'Highlight',
        rect: [50, 700, 250, 720],
        color: [1, 0.9, 0],
        contents: 'Native Acrobat Highlight',
      },
      {
        id: 'external-ul-1',
        subtype: 'Underline',
        rect: [50, 650, 200, 660],
        color: [0, 0, 1],
        contents: 'Native Underline',
      },
    ];

    const mockDoc = {
      numPages: 1,
      getPage: async () => ({
        getAnnotations: async () => mockAnnotations,
        getViewport: () => ({ width: 600, height: 800 }),
      }),
    } as any;

    const extracted = await extractExistingPdfAnnotations(mockDoc);
    expect(extracted.length).toBe(2);
    expect(extracted[0].type).toBe('highlight');
    expect(extracted[0].text).toBe('Native Acrobat Highlight');
    expect(extracted[0].rects[0].widthPct).toBeCloseTo(200 / 600);
    expect(extracted[1].type).toBe('underline');
    expect(extracted[1].text).toBe('Native Underline');
  });
});
