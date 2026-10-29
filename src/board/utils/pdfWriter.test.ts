import { describe, it, expect } from 'vitest';
import { buildPdfFromJpegPages } from './pdfWriter';

describe('pdfWriter', () => {
  it('throws if no pages are provided', () => {
    expect(() => buildPdfFromJpegPages([])).toThrow('At least one page is required');
  });

  it('generates a valid PDF structure for 1 page', () => {
    // Fake small JPEG header bytes
    const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const pdfBytes = buildPdfFromJpegPages([
      { width: 800, height: 600, jpegBytes: fakeJpeg }
    ]);

    const pdfString = new TextDecoder('latin1').decode(pdfBytes);
    expect(pdfString.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfString.includes('/Type /Catalog')).toBe(true);
    expect(pdfString.includes('/Type /Pages')).toBe(true);
    expect(pdfString.includes('/Count 1')).toBe(true);
    expect(pdfString.includes('/MediaBox [0 0 800 600]')).toBe(true);
    expect(pdfString.includes('/Filter /DCTDecode')).toBe(true);
    expect(pdfString.includes('%%EOF')).toBe(true);
  });

  it('generates multi-page PDF structure with correct page counts and kids', () => {
    const fakeJpeg1 = new Uint8Array([0xff, 0xd8, 0x01]);
    const fakeJpeg2 = new Uint8Array([0xff, 0xd8, 0x02]);
    const pdfBytes = buildPdfFromJpegPages([
      { width: 1920, height: 1080, jpegBytes: fakeJpeg1 },
      { width: 1920, height: 1080, jpegBytes: fakeJpeg2 }
    ]);

    const pdfString = new TextDecoder('latin1').decode(pdfBytes);
    expect(pdfString.includes('/Count 2')).toBe(true);
    expect(pdfString.includes('/Kids [3 0 R 6 0 R]')).toBe(true);
    expect(pdfString.includes('3 0 obj')).toBe(true);
    expect(pdfString.includes('6 0 obj')).toBe(true);
    expect(pdfString.includes('startxref')).toBe(true);
    expect(pdfString.endsWith('%%EOF\r\n') || pdfString.endsWith('%%EOF')).toBe(true);
  });
});
