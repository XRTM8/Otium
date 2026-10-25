import type { PDFDocumentProxy } from 'pdfjs-dist';
import { normalizeSearchText } from './arabic';

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

function cacheFor(doc: PDFDocumentProxy): Map<number, string> {
  let cache = pageTextCache.get(doc);
  if (!cache) {
    cache = new Map();
    pageTextCache.set(doc, cache);
  }
  return cache;
}

export function clearSearchTextCache(doc: PDFDocumentProxy | null): void {
  if (doc) pageTextCache.delete(doc);
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
  if (signal?.aborted) throw new SearchCancelledError();

  const textContent = await page.getTextContent();
  if (signal?.aborted) throw new SearchCancelledError();

  const pageText = normalizeSearchText(
    textContent.items.map((item) => ('str' in item ? item.str : '')).join(' ')
  );
  cache.set(pageNumber, pageText);
  return pageText;
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

  if (signal?.aborted) throw new SearchCancelledError();
  return matches;
}
