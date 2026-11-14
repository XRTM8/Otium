import { describe, expect, it, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { createPdfFromCanvases, type OcrWordToken } from './pdf';

function createMockCanvas(width = 800, height = 1000): HTMLCanvasElement {
  const dummyJpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const canvas = {
    width,
    height,
    getContext: vi.fn(() => ({
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      fillStyle: '',
      textAlign: '',
      textBaseline: '',
      font: '',
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    })),
    toBlob: vi.fn((cb: (b: Blob | null) => void) => {
      const blob = new Blob([dummyJpegBytes], { type: 'image/jpeg' });
      cb(blob);
    }),
  } as unknown as HTMLCanvasElement;

  return canvas;
}

describe('PDF Compiler (createPdfFromCanvases)', () => {
  beforeEach(() => {
    // Stub document.createElement for canvas creation
    vi.stubGlobal('document', {
      createElement: vi.fn((tag: string) => {
        if (tag === 'canvas') {
          return createMockCanvas(800, 1000);
        }
        return {};
      }),
    });
  });

  it('compiles a valid single-page PDF with standard PDF-1.4 header and trailer', async () => {
    const canvas = createMockCanvas(600, 800);
    const pdfBlob = await createPdfFromCanvases([canvas], 'balanced', 'a4');

    expect(pdfBlob).toBeInstanceOf(Blob);
    expect(pdfBlob.type).toBe('application/pdf');

    const buffer = await pdfBlob.arrayBuffer();
    const text = new TextDecoder().decode(buffer);

    expect(text).toContain('%PDF-1.4');
    expect(text).toContain('/Type /Catalog');
    expect(text).toContain('/Type /Pages');
    expect(text).toContain('/Type /Page');
    expect(text).toContain('xref');
    expect(text).toContain('trailer');
    expect(text).toContain('%%EOF');
  });

  it('compiles multi-page documents with correct count and object references', async () => {
    const pages = [createMockCanvas(500, 700), createMockCanvas(600, 800)];
    const pdfBlob = await createPdfFromCanvases(pages, 'compact', 'fit');

    const buffer = await pdfBlob.arrayBuffer();
    const text = new TextDecoder().decode(buffer);

    expect(text).toContain('/Count 2');
    expect(text).toContain('/Type /Page');
  });

  it('round-trips Arabic, English, and literal punctuation through PDF.js', async () => {
    const jpeg = await sharp({ create: { width: 8, height: 10, channels: 3, background: '#fff' } }).jpeg().toBuffer();
    vi.mocked(document.createElement).mockImplementation(() => {
      const target = createMockCanvas();
      vi.mocked(target.toBlob).mockImplementation((callback) => callback(new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' })));
      return target;
    });
    const words: OcrWordToken[] = [
      { text: 'مرحبا', x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
      { text: 'Invoice (2026)', x: 0.1, y: 0.2, width: 0.2, height: 0.05 },
      { text: 'Path\\File\x00\x08Name\n', x: 0.1, y: 0.3, width: 0.2, height: 0.05 },
      { text: 'فاتورةABC123', x: 0.1, y: 0.4, width: 0.3, height: 0.05 },
      { text: 'مبلغ١٢٣٫٤٥', x: 0.1, y: 0.5, width: 0.3, height: 0.05 },
    ];
    const blob = await createPdfFromCanvases([{ canvas: createMockCanvas(), words }]);
    vi.unstubAllGlobals();
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: false });
    try {
      const page = await (await task.promise).getPage(1);
      const { items } = await page.getTextContent();
      expect(items.flatMap((item) => 'str' in item && item.str ? [item.str] : [])).toEqual([
        'مرحبا', 'Invoice (2026)', 'Path\\FileName', 'فاتورةABC123', 'مبلغ١٢٣٫٤٥',
      ]);
    } finally {
      await task.destroy();
    }
  });

  it('applies diagonal and tiled watermarks without crashing', async () => {
    const canvas = createMockCanvas(800, 1000);
    const pdfBlobDiagonal = await createPdfFromCanvases([canvas], 'balanced', 'a4', 'CONFIDENTIAL', 'diagonal');
    expect(pdfBlobDiagonal.size).toBeGreaterThan(0);

    const pdfBlobTiled = await createPdfFromCanvases([canvas], 'balanced', 'a4', 'سري للغاية', 'tiled');
    expect(pdfBlobTiled.size).toBeGreaterThan(0);
  });
});
