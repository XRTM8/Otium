import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
vi.mock('../../scanner/core/nativeBridge', () => ({ nativeSavePdf: vi.fn().mockResolvedValue(true) }));
import { nativeSavePdf } from '../../scanner/core/nativeBridge';
import { exportInkPdf, overlayPlacement } from './inkExport';

describe('PDF annotation placement', () => {
  it('exports a separate PDF retaining original pages, crop boxes and rotations', async () => {
    const original = await PDFDocument.create();
    original.addPage([600, 800]).drawText('Original text remains in the PDF');
    const rotated = original.addPage([600, 800]);
    rotated.setRotation(degrees(90)); rotated.setCropBox(20, 30, 500, 700);
    const source = await original.save();
    const before = source.slice();
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='), c => c.charCodeAt(0));
    const context = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {}, fillText() {} };
    vi.stubGlobal('document', { fonts: { ready: Promise.resolve(), load: async () => [] }, createElement: () => ({ width: 0, height: 0,
      getContext: () => context, toBlob: (callback: (blob: Blob) => void) => callback(new Blob([png], { type: 'image/png' })) }) });
    try {
      await exportInkPdf({ getData: async () => source } as any, [{ id: 'note', page: 2, type: 'note', color: '#000000', width: 0.03,
        points: [{ x: 0.2, y: 0.3 }], text: 'شرح' }], 'Lecture', () => {});
      const call = vi.mocked(nativeSavePdf).mock.calls[0];
      expect(call[1]).toBe('Lecture-annotated.pdf');
      const exported = await PDFDocument.load(await call[0].arrayBuffer());
      expect(exported.getPageCount()).toBe(2);
      expect(exported.getPages()[1].getRotation().angle).toBe(90);
      expect(exported.getPages()[1].getCropBox()).toEqual({ x: 20, y: 30, width: 500, height: 700 });
      expect(exported.getPages()[0].node.Contents()?.toString()).toBe(original.getPages()[0].node.Contents()?.toString());
      expect(source).toEqual(before);
    } finally { vi.unstubAllGlobals(); }
  });

  it.each([0, 90, 180, 270])('covers the crop box without shifting marks on a %i-degree page', rotation => {
    const box = { x: 20, y: 30, width: 600, height: 800 };
    const p = overlayPlacement(box, rotation);
    const angle = p.rotation * Math.PI / 180;
    const corners = [[0, 0], [p.width, 0], [0, p.height], [p.width, p.height]].map(([x, y]) => ({
      x: p.x + x * Math.cos(angle) - y * Math.sin(angle),
      y: p.y + x * Math.sin(angle) + y * Math.cos(angle)
    }));
    expect(Math.min(...corners.map(c => c.x))).toBeCloseTo(box.x);
    expect(Math.min(...corners.map(c => c.y))).toBeCloseTo(box.y);
    expect(Math.max(...corners.map(c => c.x))).toBeCloseTo(box.x + box.width);
    expect(Math.max(...corners.map(c => c.y))).toBeCloseTo(box.y + box.height);
  });
});
