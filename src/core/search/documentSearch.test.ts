// @vitest-environment happy-dom
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSearchTextCache,
  SearchCancelledError,
  searchDocumentPages,
} from './documentSearch';

const mockState = vi.hoisted(() => ({
  tauri: false,
  rustHits: null as number[] | null,
}));

vi.mock('../../platform/runtime', () => ({
  isTauriRuntime: () => mockState.tauri,
}));

vi.mock('../../platform/rustEngine', () => ({
  searchDocumentPagesWithRust: vi.fn(async () => mockState.rustHits),
}));

function makeDoc(pagesText: string[]) {
  const getPage = vi.fn(async (pageNumber: number) => ({
    getTextContent: async () => ({
      items: [{ str: pagesText[pageNumber - 1] ?? '' }],
    }),
    cleanup: vi.fn(),
  }));
  return {
    numPages: pagesText.length,
    getPage,
  } as unknown as PDFDocumentProxy & { getPage: ReturnType<typeof vi.fn> };
}

describe('documentSearch', () => {
  beforeEach(() => {
    mockState.tauri = false;
    mockState.rustHits = null;
    vi.clearAllMocks();
  });

  it('normalizes Arabic diacritics, alef variants, and digits across pages', async () => {
    const doc = makeDoc([
      'مقدمة عامة في الرياضيات',
      'الْإِحْصَاءُ وَالِاحْتِمَالُ الصفحة ٢٥',
      'الفصل الثالث بدون تطابق',
      'احصاء تطبيقي ٢٥',
    ]);

    expect(await searchDocumentPages(doc, 'إحصاء')).toEqual([2, 4]);
    expect(await searchDocumentPages(doc, '25')).toEqual([2, 4]);
    // Cache hit avoids re-extracting pages from pdf.js on subsequent queries.
    expect(doc.getPage).toHaveBeenCalledTimes(4);
  });

  it('returns empty results for normalized queries shorter than two characters', async () => {
    const doc = makeDoc(['ألف باء تاء']);
    expect(await searchDocumentPages(doc, '  ً ')).toEqual([]);
    expect(await searchDocumentPages(doc, 'أ')).toEqual([]);
    expect(doc.getPage).not.toHaveBeenCalled();
  });

  it('clears cached page text on clearSearchTextCache', async () => {
    const doc = makeDoc(['الفصل الأول']);
    await searchDocumentPages(doc, 'الفصل');
    expect(doc.getPage).toHaveBeenCalledTimes(1);

    clearSearchTextCache(doc);
    await searchDocumentPages(doc, 'الأول');
    expect(doc.getPage).toHaveBeenCalledTimes(2);
  });

  it('aborts search with SearchCancelledError when AbortSignal fires', async () => {
    const doc = makeDoc(['واحد', 'اثنان']);
    const controller = new AbortController();
    controller.abort();

    await expect(searchDocumentPages(doc, 'واحد', controller.signal)).rejects.toBeInstanceOf(
      SearchCancelledError
    );
    expect(doc.getPage).not.toHaveBeenCalled();
  });

  it('uses cached Rust trigram search in Tauri once all pages are extracted', async () => {
    mockState.tauri = true;
    mockState.rustHits = [2];
    const { searchDocumentPagesWithRust } = await import('../../platform/rustEngine');

    const doc = makeDoc(['أول صفحة', 'تانية صفحة']);
    expect(await searchDocumentPages(doc, 'تانية')).toEqual([2]);
    // Warmed once after extraction, then queried via native trigram cache without resending pages.
    expect(searchDocumentPagesWithRust).toHaveBeenCalledWith(expect.any(String), 'تانية', [
      'اول صفحه',
      'تانيه صفحه',
    ]);

    vi.mocked(searchDocumentPagesWithRust).mockClear();
    expect(await searchDocumentPages(doc, 'صفحة')).toEqual([2]);
    expect(searchDocumentPagesWithRust).toHaveBeenCalledWith(expect.any(String), 'صفحة', null);
  });
});
