import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { pdfjsLib } from './worker';

export interface PdfPageSize {
  width: number;
  height: number;
}

export interface OpenedPdf {
  doc: PDFDocumentProxy;
  numPages: number;
  basePageSize: PdfPageSize;
  baseAspectRatio: number;
}

export interface PdfPasswordRequest {
  callback: (password: string) => void;
  reason: number;
}

export interface OpenPdfOptions {
  onPassword: (request: PdfPasswordRequest) => void;
  onProgress?: (loaded: number, total: number) => void;
}

export interface PdfOpenHandle {
  loadingTask: PDFDocumentLoadingTask;
  promise: Promise<OpenedPdf>;
}

const DEFAULT_PAGE_SIZE: PdfPageSize = { width: 595, height: 842 };

/**
 * Opens a PDF with the same resource configuration on every platform.
 * The returned loading task is exposed so the caller can cancel a password
 * prompt or discard a superseded document.
 */
export function openPdf(data: ArrayBuffer, options: OpenPdfOptions): PdfOpenHandle {
  const baseUrl = typeof window === 'undefined' ? '' : window.location.origin;
  const loadingTask = pdfjsLib.getDocument({
    data,
    cMapUrl: `${baseUrl}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${baseUrl}/standard_fonts/`,
    wasmUrl: `${baseUrl}/wasm/`,
    enableXfa: true
  });

  loadingTask.onPassword = (callback: (password: string) => void, reason: number) => {
    options.onPassword({ callback, reason });
  };
  loadingTask.onProgress = (progress: { loaded: number; total: number }) => {
    options.onProgress?.(progress.loaded, progress.total);
  };

  const promise = (async (): Promise<OpenedPdf> => {
    const doc = await loadingTask.promise;
    let basePageSize = DEFAULT_PAGE_SIZE;

    try {
      const firstPage = await doc.getPage(1);
      const viewport = firstPage.getViewport({ scale: 1 });
      if (viewport.width > 0 && viewport.height > 0) {
        basePageSize = { width: viewport.width, height: viewport.height };
      }
    } catch {
      // Keep the A4 fallback; a document can still render without page-one metrics.
    }

    return {
      doc,
      numPages: doc.numPages,
      basePageSize,
      baseAspectRatio: basePageSize.width / basePageSize.height
    };
  })();

  return { loadingTask, promise };
}
