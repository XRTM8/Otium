// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  clearCoverCache,
  extractPdfCover,
  getCachedCover,
  hasCachedCover,
  setCachedCover,
} from './cover';

describe('PDF Cover Extraction and Cache', () => {
  beforeEach(() => {
    clearCoverCache();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      fillStyle: '',
      fillRect: vi.fn(),
    }) as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,mockJpegData');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('manages in-memory cache correctly', () => {
    expect(hasCachedCover('doc-1')).toBe(false);
    expect(getCachedCover('doc-1')).toBeUndefined();

    setCachedCover('doc-1', 'data:image/jpeg;base64,mockCover1');
    expect(hasCachedCover('doc-1')).toBe(true);
    expect(getCachedCover('doc-1')).toBe('data:image/jpeg;base64,mockCover1');

    clearCoverCache();
    expect(hasCachedCover('doc-1')).toBe(false);
    expect(getCachedCover('doc-1')).toBeUndefined();
  });

  it('ignores invalid keys or URLs in cache', () => {
    setCachedCover('', 'data:image/jpeg;base64,test');
    expect(hasCachedCover('')).toBe(false);

    setCachedCover('doc-2', '');
    expect(hasCachedCover('doc-2')).toBe(false);
  });

  it('extracts cover thumbnail from PDF page 1', async () => {
    const mockPage = {
      getViewport: vi.fn(({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 800 * scale,
      })),
      render: vi.fn(() => ({
        promise: Promise.resolve(),
      })),
      cleanup: vi.fn(),
    };

    const mockDoc = {
      getPage: vi.fn(async (num: number) => {
        if (num === 1) return mockPage;
        throw new Error('Not found');
      }),
    } as unknown as PDFDocumentProxy;

    const coverUrl = await extractPdfCover(mockDoc, 120, 160);
    expect(coverUrl).toBe('data:image/jpeg;base64,mockJpegData');
    expect(mockDoc.getPage).toHaveBeenCalledWith(1);
    expect(mockPage.cleanup).toHaveBeenCalled();
  });

  it('handles page get or render failure gracefully without throwing', async () => {
    const mockDoc = {
      getPage: vi.fn(async () => {
        throw new Error('Corrupt page');
      }),
    } as unknown as PDFDocumentProxy;

    const coverUrl = await extractPdfCover(mockDoc);
    expect(coverUrl).toBeNull();
  });
});
