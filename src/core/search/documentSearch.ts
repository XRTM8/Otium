import type { PDFDocumentProxy } from 'pdfjs-dist';
import { normalizeSearchText } from './arabic';
import { isTauriRuntime } from '../../platform/runtime';
import { searchDocumentPagesWithRust } from '../../platform/rustEngine';

export class SearchCancelledError extends Error {
  constructor() {
    super('Search cancelled');
    this.name = 'SearchCancelledError';
  }
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

/**
 * Page text is immutable for a document, so a query only needs to pay the
 * pdf.js text-extraction cost once. Later queries scan the cached strings
 * instead of re-walking every page, which keeps large documents responsive.
 * A WeakMap lets the cache disappear with the document itself.
 */
const pageTextCache = new WeakMap<PDFDocumentProxy, Map<number, string>>();
const rustDocKeyMap = new WeakMap<PDFDocumentProxy, string>();
let nextDocKeySeq = 1;

function getDocSearchKey(doc: PDFDocumentProxy): string {
  let key = rustDocKeyMap.get(doc);
  if (!key) {
    key = `doc_${nextDocKeySeq++}`;
    rustDocKeyMap.set(doc, key);
  }
  return key;
}

function cacheFor(doc: PDFDocumentProxy): Map<number, string> {
  let cache = pageTextCache.get(doc);
  if (!cache) {
    cache = new Map();
    pageTextCache.set(doc, cache);
  }
  return cache;
}

export function clearSearchTextCache(doc: PDFDocumentProxy | null): void {
  if (doc) {
    pageTextCache.delete(doc);
    rustDocKeyMap.delete(doc);
  }
}

async function getPageText(
  doc: PDFDocumentProxy,
  pageNumber: number,
  signal?: AbortSignal
): Promise<string> {
  const cache = cacheFor(doc);
  const cached = cache.get(pageNumber);
  if (cached !== undefined) return cached;

  const page = await doc.getPage(pageNumber);
  try {
    if (signal?.aborted) throw new SearchCancelledError();

    const textContent = await page.getTextContent();
    if (signal?.aborted) throw new SearchCancelledError();

    const pageText = normalizeSearchText(
      textContent.items.map((item) => ('str' in item ? item.str : '')).join(' ')
    );
    cache.set(pageNumber, pageText);
    return pageText;
  } finally {
    try {
      page.cleanup();
    } catch {
      // Best-effort cleanup of PDF.js page resources
    }
  }
}

/**
 * Searches every page for a literal term after Arabic-aware normalisation.
 * Vocalisation marks, alef/hamza variants and Arabic-Indic digits therefore
 * match their plain forms. The scan yields periodically so typing and
 * scrolling stay responsive on large documents, and stops as soon as the
 * caller aborts it.
 */
export async function searchDocumentPages(
  doc: PDFDocumentProxy,
  query: string,
  signal?: AbortSignal
): Promise<number[]> {
  const term = normalizeSearchText(query);
  if (term.length < 2) return [];

  const docKey = getDocSearchKey(doc);
  const cache = cacheFor(doc);

  // Fast native path when all pages are already extracted & Tauri runtime is active:
  // queries the cached Rust ArabicTrigramIndex without resending page text over IPC.
  if (isTauriRuntime() && cache.size === doc.numPages) {
    const cachedRustHits = await searchDocumentPagesWithRust(docKey, query, null);
    if (signal?.aborted) throw new SearchCancelledError();
    if (cachedRustHits !== null) {
      return cachedRustHits;
    }
  }

  const matches: number[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    if (signal?.aborted) throw new SearchCancelledError();

    const pageText = await getPageText(doc, pageNumber, signal);

    if (pageText.includes(term)) {
      matches.push(pageNumber);
    }

    if (pageNumber % 8 === 0) {
      await yieldToUi();
    }
  }

  // Warm the native Rust trigram index once extraction finishes so follow-up
  // queries run in sub-millisecond Rust without holding extra JS work.
  if (isTauriRuntime() && cache.size === doc.numPages && !signal?.aborted) {
    const orderedPages: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      orderedPages.push(cache.get(pageNumber) ?? '');
    }
    void searchDocumentPagesWithRust(docKey, query, orderedPages);
  }

  if (signal?.aborted) throw new SearchCancelledError();
  return matches;
}
