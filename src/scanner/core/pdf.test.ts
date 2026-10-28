import { describe, expect, it, vi, beforeEach } from 'vitest';
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

  it('sanitizes OCR word tokens and escapes parentheses and backslashes in PDF text layer', async () => {
    const canvas = createMockCanvas(800, 1000);
    const words: OcrWordToken[] = [
      { text: 'Invoice (2026)', x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
      { text: 'Path\\File\x00\x08Name\n', x: 0.1, y: 0.2, width: 0.2, height: 0.05 },
      { text: '   \r\n\t  ', x: 0.5, y: 0.5, width: 0.1, height: 0.05 }, // empty token
    ];

    const pdfBlob = await createPdfFromCanvases([{ canvas, words }], 'balanced', 'a4');
    const buffer = await pdfBlob.arrayBuffer();
    const text = new TextDecoder().decode(buffer);

    // Parentheses must be escaped: \(2026\)
    expect(text).toContain('(Invoice \\(2026\\)) Tj');
    // Backslash must be escaped: Path\\\\FileName, and control characters stripped
    expect(text).toContain('(Path\\\\FileName) Tj');
    // Invisible text rendering mode 3
    expect(text).toContain('3 Tr');
  });

  it('applies diagonal and tiled watermarks without crashing', async () => {
    const canvas = createMockCanvas(800, 1000);
    const pdfBlobDiagonal = await createPdfFromCanvases([canvas], 'balanced', 'a4', 'CONFIDENTIAL', 'diagonal');
    expect(pdfBlobDiagonal.size).toBeGreaterThan(0);

    const pdfBlobTiled = await createPdfFromCanvases([canvas], 'balanced', 'a4', 'سري للغاية', 'tiled');
    expect(pdfBlobTiled.size).toBeGreaterThan(0);
  });
});
