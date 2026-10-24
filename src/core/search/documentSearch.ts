import type { PDFDocumentProxy } from 'pdfjs-dist';

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
 * Searches every page for a literal, case-insensitive term.
 * The scan yields periodically so typing and scrolling stay responsive on
 * large documents, and stops as soon as the caller aborts it.
 */
export async function searchDocumentPages(
  doc: PDFDocumentProxy,
  query: string,
  signal?: AbortSignal
): Promise<number[]> {
  const term = query.trim().toLowerCase();
  if (term.length < 2) return [];

  const matches: number[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    if (signal?.aborted) throw new SearchCancelledError();

    const page = await doc.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .toLowerCase();

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
