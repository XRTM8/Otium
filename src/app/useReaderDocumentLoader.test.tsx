// @vitest-environment happy-dom
import { act, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { BookmarkItem, TextAnnotation, ThemeMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import type { openPdf, OpenedPdf } from '../core/pdf/document';
import { saveDocumentToStorage } from '../core/storage/documents';
import { EMPTY_PASSWORD_MODAL } from './readerControllerHelpers';
import { useReaderDocumentLoader } from './useReaderDocumentLoader';

const pdfMocks = vi.hoisted(() => ({
  openPdf: vi.fn<typeof openPdf>(),
}));

vi.mock(import('../core/pdf/document'), async (importOriginal) => ({
  ...await importOriginal(),
  openPdf: pdfMocks.openPdf,
}));

const pdfBytes = () => new TextEncoder().encode('%PDF-1.4\n').buffer;

function openedDocument(): OpenedPdf {
  const doc = {
    loadingTask: { destroy: vi.fn(async () => {}) },
    numPages: 3,
    getPage: vi.fn(async () => ({
      getTextContent: async () => ({ items: [{ str: 'Hello World' }] }),
    })),
  } as Partial<PDFDocumentProxy> as PDFDocumentProxy;
  return { doc, numPages: 3, basePageSize: { width: 595, height: 842 }, baseAspectRatio: 595 / 842 };
}

describe('useReaderDocumentLoader', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    pdfMocks.openPdf.mockReset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function mountReader() {
    const ref: {
      current: {
        loader: ReturnType<typeof useReaderDocumentLoader>;
        doc: PDFDocumentProxy | null;
        docTitle: string;
        numPages: number;
        documentError: string | null;
        isLoading: boolean;
        loadProgress: number | null;
        passwordModal: typeof EMPTY_PASSWORD_MODAL;
        annotationsHydrated: () => boolean;
        bookmarksHydrated: () => boolean;
      } | null;
    } = { current: null };

    function Harness() {
      const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
      const [docTitle, setDocTitle] = useState('');
      const [docId, setDocId] = useState('');
      const [numPages, setNumPages] = useState(0);
      const [, setCurrentPage] = useState(1);
      const [, setAnnotations] = useState<TextAnnotation[]>([]);
      const [, setBookmarks] = useState<BookmarkItem[]>([]);
      const [, setBasePageSize] = useState({ width: 0, height: 0 });
      const [, setBaseAspectRatio] = useState(0);
      const [, setSearchQuery] = useState('');
      const [, setActiveSearchPage] = useState<number | null>(null);
      const [, setSearchSeed] = useState<{ query: string; id: number } | null>(null);
      const [, setIsSearchOpen] = useState(false);
      const [, setIsSidebarOpen] = useState(false);
      const [, setIsSettingsOpen] = useState(false);
      const [, setIsImmersive] = useState(false);
      const [documentError, setDocumentError] = useState<string | null>(null);
      const [isLoading, setIsLoading] = useState(false);
      const [loadProgress, setLoadProgress] = useState<number | null>(null);
      const [, setDetectedDocIsRtl] = useState(false);
      const [, setFitScaleState] = useState(1);
      const [, setZoom] = useState(1);
      const [, setFileSizeBytes] = useState(0);
      const [passwordModal, setPasswordModal] = useState(EMPTY_PASSWORD_MODAL);
      const lang: Language = 'en';
      const langRef = useRef<Language>('en');
      const docRef = useRef<PDFDocumentProxy | null>(null);
      const docIdRef = useRef(docId);
      const annotationsGenerationRef = useRef(0);
      const annotationsHydratedRef = useRef(false);
      const bookmarksHydratedRef = useRef(false);
      const pendingScrollPageRef = useRef<number | null>(null);
      const pendingScrollOffsetRef = useRef<number | null>(null);
      const pageSaveTimerRef = useRef<number | null>(null);
      const currentPageRef = useRef(1);
      const scrollContainerRef = useRef<HTMLDivElement | null>(null);
      const lastFitScaleRef = useRef(1);
      const rememberDocThemeRef = useRef(true);
      const themeScheduleRef = useRef<'manual' | 'system' | 'sunset'>('manual');
      const dayThemeRef = useRef<ThemeMode>('paper');
      const nightThemeRef = useRef<ThemeMode>('midnight');

      useLayoutEffect(() => {
        docRef.current = doc;
        docIdRef.current = docId;
      }, [doc, docId]);

      const loader = useReaderDocumentLoader({
        dragDropEnabled: false,
        lang,
        langRef,
        viewMode: 'single',
        chromeInset: 0,
        docRef,
        docIdRef,
        annotationsGenerationRef,
        annotationsHydratedRef,
        bookmarksHydratedRef,
        pendingScrollPageRef,
        pendingScrollOffsetRef,
        pageSaveTimerRef,
        currentPageRef,
        scrollContainerRef,
        lastFitScaleRef,
        rememberDocThemeRef,
        themeScheduleRef,
        dayThemeRef,
        nightThemeRef,
        passwordModal,
        setPasswordModal,
        setDoc,
        setDocTitle,
        setDocId,
        setNumPages,
        setCurrentPage,
        setAnnotations,
        setBookmarks,
        setBasePageSize,
        setBaseAspectRatio,
        setSearchQuery,
        setActiveSearchPage,
        setSearchSeed,
        setIsSearchOpen,
        setIsSidebarOpen,
        setIsSettingsOpen,
        setIsImmersive,
        setDocumentError,
        setIsLoading,
        setLoadProgress,
        setDetectedDocIsRtl,
        setFitScaleState,
        setZoom,
        setFileSizeBytes,
        changeTheme: vi.fn(),
      });
      useEffect(() => {
        ref.current = {
          loader, doc, docTitle, numPages, documentError, isLoading, loadProgress, passwordModal,
          annotationsHydrated: () => annotationsHydratedRef.current,
          bookmarksHydrated: () => bookmarksHydratedRef.current,
        };
        scrollContainerRef.current = host;
      });
      return <div />;
    }

    await act(async () => {
      root.render(<Harness />);
    });

    return ref;
  }

  it('rejects non-PDF bytes cleanly, loads a valid PDF buffer, and resets state on closeDocument', async () => {
    const opened = openedDocument();
    pdfMocks.openPdf.mockReturnValue({ loadingTask: opened.doc.loadingTask, promise: Promise.resolve(opened) });

    const ref = await mountReader();
    const badBytes = new Uint8Array([1, 2, 3, 4]).buffer;
    let badOk = true;
    await act(async () => {
      badOk = await ref.current!.loader.loadDocumentBytes(badBytes, 'broken.pdf');
    });
    expect(badOk).toBe(false);
    expect(ref.current!.documentError).toBeTruthy();

    let goodOk = false;
    await act(async () => {
      goodOk = await ref.current!.loader.loadDocumentBytes(pdfBytes(), 'lecture.pdf');
    });
    expect(goodOk).toBe(true);
    expect(ref.current!.doc).toBe(opened.doc);
    expect(ref.current!.docTitle).toBe('lecture.pdf');
    expect(ref.current!.numPages).toBe(3);

    await act(async () => {
      ref.current!.loader.closeDocument();
    });
    expect(ref.current!.doc).toBeNull();
    expect(ref.current!.numPages).toBe(0);
  });

  it.each(['parser rejection', 'synchronous setup failure'] as const)(
    'keeps the current reader and its save state after a %s',
    async (failure) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const opened = openedDocument();
      pdfMocks.openPdf.mockReturnValueOnce({ loadingTask: opened.doc.loadingTask, promise: Promise.resolve(opened) });
      const ref = await mountReader();
      await act(async () => {
        expect(await ref.current!.loader.loadDocumentBytes(pdfBytes(), 'current.pdf')).toBe(true);
      });
      await act(async () => {
        await vi.waitFor(() => expect(ref.current!.annotationsHydrated()).toBe(true));
      });

      const error = Object.assign(new Error('Bad PDF structure'), { name: 'InvalidPDFException' });
      const destroy = vi.fn(async () => {});
      pdfMocks.openPdf.mockImplementationOnce((_data, options) => {
        if (failure === 'synchronous setup failure') throw error;
        options.onProgress?.(1, 2);
        return { loadingTask: { destroy }, promise: Promise.reject(error) };
      });

      await act(async () => {
        expect(await ref.current!.loader.loadDocumentBytes(pdfBytes(), 'corrupt.pdf')).toBe(false);
      });
      expect(ref.current).toMatchObject({
        doc: opened.doc, docTitle: 'current.pdf', isLoading: false, loadProgress: null,
        documentError: 'This file is not a valid PDF document.',
      });
      expect(ref.current!.annotationsHydrated()).toBe(true);
      expect(ref.current!.bookmarksHydrated()).toBe(true);
      expect(opened.doc.loadingTask.destroy).not.toHaveBeenCalled();
      expect(destroy).toHaveBeenCalledTimes(failure === 'parser rejection' ? 1 : 0);
    },
  );

  it('retries a wrong password, then cancels the pending encrypted PDF cleanly', async () => {
    const pending = Promise.withResolvers<OpenedPdf>();
    const destroy = vi.fn(async () => pending.reject(new Error('Cancelled')));
    const retry = vi.fn();
    pdfMocks.openPdf.mockImplementation((_data, options) => {
      options.onPassword({
        reason: 1,
        callback: () => options.onPassword({ reason: 2, callback: retry }),
      });
      return { loadingTask: { destroy }, promise: pending.promise };
    });
    const ref = await mountReader();
    let result: Promise<boolean> | undefined;
    await act(async () => {
      result = ref.current!.loader.loadDocumentBytes(pdfBytes(), 'encrypted.pdf');
    });
    expect(ref.current).toMatchObject({ passwordModal: { isOpen: true, isIncorrect: false, title: 'encrypted.pdf' }, isLoading: false });
    await act(async () => ref.current!.loader.handlePasswordSubmit('wrong'));
    expect(ref.current).toMatchObject({ passwordModal: { isOpen: true, isIncorrect: true }, isLoading: false });
    await act(async () => {
      ref.current!.loader.handlePasswordCancel();
      expect(await result).toBe(false);
    });
    expect(destroy).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    expect(ref.current).toMatchObject({ doc: null, passwordModal: EMPTY_PASSWORD_MODAL, isLoading: false, documentError: null });
  });

  it('opens an encrypted PDF after the engine accepts the password', async () => {
    const pending = Promise.withResolvers<OpenedPdf>();
    const opened = openedDocument();
    const acceptPassword = vi.fn(() => pending.resolve(opened));
    pdfMocks.openPdf.mockImplementation((_data, options) => {
      options.onPassword({ reason: 1, callback: acceptPassword });
      return { loadingTask: opened.doc.loadingTask, promise: pending.promise };
    });
    const ref = await mountReader();
    let result: Promise<boolean> | undefined;
    await act(async () => {
      result = ref.current!.loader.loadDocumentBytes(pdfBytes(), 'encrypted.pdf');
    });
    await act(async () => {
      ref.current!.loader.handlePasswordSubmit('correct');
      expect(await result).toBe(true);
    });
    expect(acceptPassword).toHaveBeenCalledWith('correct');
    expect(ref.current).toMatchObject({ doc: opened.doc, passwordModal: EMPTY_PASSWORD_MODAL, isLoading: false });
  });

  it('clears the loading state when the sample returns an empty or invalid file', async () => {
    const ref = await mountReader();
    const fetchSample = vi.fn().mockResolvedValueOnce(new Response('')).mockResolvedValueOnce(new Response('<html>'));
    vi.stubGlobal('fetch', fetchSample);
    for (const message of ['The selected file is empty.', 'The selected file is corrupt or not a valid PDF document.']) {
      await act(async () => {
        expect(await ref.current!.loader.openSample()).toBe(false);
      });
      expect(ref.current).toMatchObject({ isLoading: false, documentError: message, doc: null });
    }
    expect(pdfMocks.openPdf).not.toHaveBeenCalled();
  });

  it('ignores a delayed sample response after opening another document', async () => {
    const response = Promise.withResolvers<Response>();
    vi.stubGlobal('fetch', vi.fn(() => response.promise));
    const opened = openedDocument();
    pdfMocks.openPdf.mockReturnValueOnce({ loadingTask: opened.doc.loadingTask, promise: Promise.resolve(opened) });
    const ref = await mountReader();
    let sample: Promise<boolean> | undefined;
    await act(async () => {
      sample = ref.current!.loader.openSample();
    });
    await act(async () => {
      expect(await ref.current!.loader.loadDocumentBytes(pdfBytes(), 'newer.pdf')).toBe(true);
    });
    await act(async () => {
      response.resolve(new Response(pdfBytes()));
      expect(await sample).toBe(false);
    });
    expect(pdfMocks.openPdf).toHaveBeenCalledOnce();
    expect(ref.current).toMatchObject({ doc: opened.doc, docTitle: 'newer.pdf', isLoading: false, documentError: null });
  });

  it('handles recent documents with missing or corrupt local bytes', async () => {
    const corruptBytes = new TextEncoder().encode('not a PDF').buffer;
    const recent = {
      id: 'sha256:corrupt-recent', name: 'recent.pdf', sizeBytes: corruptBytes.byteLength,
      totalPages: 3, lastPage: 2, lastOpened: 1,
    };
    const ref = await mountReader();
    const cases = [
      { available: false, message: 'This book is in your library but its PDF is not on this device.' },
      { available: true, message: 'This document is no longer stored on this device.' },
    ];
    for (const { available, message } of cases) {
      await act(async () => {
        expect(await ref.current!.loader.openRecent({ ...recent, available })).toBe(false);
      });
      expect(ref.current!.documentError).toContain(message);
      expect(ref.current!.isLoading).toBe(false);
    }

    await saveDocumentToStorage(recent.id, recent.name, corruptBytes, recent.totalPages, recent.lastPage);
    await act(async () => {
      expect(await ref.current!.loader.openRecent({ ...recent, available: true })).toBe(false);
    });
    expect(ref.current).toMatchObject({
      doc: null, isLoading: false, documentError: 'The selected file is corrupt or not a valid PDF document.',
    });
    expect(pdfMocks.openPdf).not.toHaveBeenCalled();
  });

  it('returns the parser failure to callers that request error propagation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = Object.assign(new Error('Password required'), { name: 'PasswordException' });
    const destroy = vi.fn(async () => {});
    pdfMocks.openPdf.mockImplementationOnce(() => ({ loadingTask: { destroy }, promise: Promise.reject(error) }));
    const ref = await mountReader();
    await act(async () => {
      await expect(ref.current!.loader.loadDocumentRef.current(pdfBytes(), 'encrypted.pdf', 1, true)).rejects.toBe(error);
    });
    expect(destroy).toHaveBeenCalledOnce();
    expect(ref.current).toMatchObject({
      doc: null, isLoading: false, documentError: 'This document is password protected.',
    });
  });
});
