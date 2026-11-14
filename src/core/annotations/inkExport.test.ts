import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
vi.mock('../../scanner/core/nativeBridge', () => ({ nativeSavePdf: vi.fn().mockResolvedValue(true) }));
import { nativeSavePdf } from '../../scanner/core/nativeBridge';
import { exportInkPdf, overlayPlacement, toPageCoordinates, parseHexColor } from './inkExport';

describe('PDF annotation placement and vector export', () => {
  it('parses hex colors correctly', () => {
    expect(parseHexColor('#ffffff')).toEqual({ r: 1, g: 1, b: 1 });
    expect(parseHexColor('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseHexColor('#f00')).toEqual({ r: 1, g: 0, b: 0 });
    expect(parseHexColor('invalid')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it.each([0, 90, 180, 270])('covers the crop box without shifting marks on a %i-degree page', rotation => {
    const box = { x: 20, y: 30, width: 600, height: 800 };
    const p = overlayPlacement(box, rotation);
    const angle = (p.rotation * Math.PI) / 180;
    const corners = [
      [0, 0],
      [p.width, 0],
      [0, p.height],
      [p.width, p.height],
    ].map(([x, y]) => ({
      x: p.x + x * Math.cos(angle) - y * Math.sin(angle),
      y: p.y + x * Math.sin(angle) + y * Math.cos(angle),
    }));
    expect(Math.min(...corners.map(c => c.x))).toBeCloseTo(box.x);
    expect(Math.min(...corners.map(c => c.y))).toBeCloseTo(box.y);
    expect(Math.max(...corners.map(c => c.x))).toBeCloseTo(box.x + box.width);
    expect(Math.max(...corners.map(c => c.y))).toBeCloseTo(box.y + box.height);
  });

  it('transforms normalized coordinates to PDF page coordinates accurately', () => {
    const box = { x: 0, y: 0, width: 600, height: 800 };
    const p0 = overlayPlacement(box, 0);
    expect(toPageCoordinates(0, 0, p0)).toEqual({ x: 0, y: 800 });
    expect(toPageCoordinates(1, 1, p0)).toEqual({ x: 600, y: 0 });
    expect(toPageCoordinates(0.5, 0.5, p0)).toEqual({ x: 300, y: 400 });
  });

  it('exports pure vector annotations without creating canvas when no notes exist', async () => {
    const original = await PDFDocument.create();
    original.addPage([600, 800]).drawText('Original page 1 text');
    const source = await original.save();

    const createElement = vi.fn();
    vi.stubGlobal('document', { fonts: { ready: Promise.resolve(), load: async () => [] }, createElement });

    try {
      await exportInkPdf(
        { getData: async () => source } as any,
        [
          {
            id: 'pen-1',
            page: 1,
            type: 'pen',
            color: '#e11d48',
            width: 0.005,
            points: [
              { x: 0.1, y: 0.2 },
              { x: 0.5, y: 0.6 },
            ],
          },
          {
            id: 'dot-1',
            page: 1,
            type: 'pen',
            color: '#10b981',
            width: 0.01,
            points: [{ x: 0.8, y: 0.8 }],
          },
        ],
        'VectorLecture',
        () => {},
        [
          {
            id: 'hl-1',
            pageNumber: 1,
            type: 'highlight',
            color: '#fde047',
            rects: [{ xPct: 0.2, yPct: 0.3, widthPct: 0.4, heightPct: 0.05 }],
            text: 'Important',
            createdAt: 1,
          },
          {
            id: 'ul-1',
            pageNumber: 1,
            type: 'underline',
            color: '#3b82f6',
            rects: [{ xPct: 0.2, yPct: 0.4, widthPct: 0.4, heightPct: 0.02 }],
            text: 'Underlined',
            createdAt: 2,
          },
        ]
      );

      // Verify NO canvas was created!
      expect(createElement).not.toHaveBeenCalled();

      const call = vi.mocked(nativeSavePdf).mock.calls.at(-1);
      expect(call).toBeDefined();
      expect(call![1]).toBe('VectorLecture-annotated.pdf');
      const exported = await PDFDocument.load(await (call![0] as Blob).arrayBuffer());
      expect(exported.getPageCount()).toBe(1);

      // The exported page has drawn content
      const contents = exported.getPages()[0].node.Contents();
      expect(contents).toBeDefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('exports a separate PDF retaining original pages, crop boxes, rotations and note overlays', async () => {
    const original = await PDFDocument.create();
    original.addPage([600, 800]).drawText('Original text remains in the PDF');
    const rotated = original.addPage([600, 800]);
    rotated.setRotation(degrees(90));
    rotated.setCropBox(20, 30, 500, 700);
    const source = await original.save();
    const before = source.slice();

    const png = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='),
      c => c.charCodeAt(0)
    );
    const context = {
      save() {},
      restore() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      arc() {},
      fill() {},
      fillText: vi.fn(),
      fillRect: vi.fn(),
    };
    vi.stubGlobal('document', {
      fonts: { ready: Promise.resolve(), load: async () => [] },
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => context,
        toBlob: (callback: (blob: Blob) => void) => callback(new Blob([png], { type: 'image/png' })),
      }),
    });

    try {
      await exportInkPdf(
        { getData: async () => source } as any,
        [
          {
            id: 'note',
            page: 2,
            type: 'note',
            color: '#000000',
            width: 0.03,
            points: [{ x: 0.2, y: 0.3 }],
            text: 'شرح',
          },
        ],
        'Lecture',
        () => {},
        [
          {
            id: 'highlight',
            pageNumber: 2,
            type: 'highlight',
            color: '#fde047',
            rects: [{ xPct: 0.1, yPct: 0.2, widthPct: 0.4, heightPct: 0.03 }],
            text: 'Text',
            createdAt: 1,
          },
        ]
      );

      // Verify the note text was painted to canvas
      expect(context.fillText).toHaveBeenCalled();

      const call = vi.mocked(nativeSavePdf).mock.calls.at(-1);
      expect(call).toBeDefined();
      expect(call![1]).toBe('Lecture-annotated.pdf');
      const exported = await PDFDocument.load(await (call![0] as Blob).arrayBuffer());
      expect(exported.getPageCount()).toBe(2);
      expect(exported.getPages()[1].getRotation().angle).toBe(90);
      expect(exported.getPages()[1].getCropBox()).toEqual({ x: 20, y: 30, width: 500, height: 700 });
      expect(exported.getPages()[0].node.Contents()?.toString()).toBe(
        original.getPages()[0].node.Contents()?.toString()
      );
      expect(source).toEqual(before);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
