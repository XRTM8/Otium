import type React from 'react';
import { useEffect, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { AnnotationRect, ThemeMode, ViewMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import type { BeamMessage } from '../board/types';
import { base64ToArrayBuffer, beamService } from '../board/beam/beamService';
import { describeDocumentError } from './readerControllerHelpers';

interface UseReaderBeamSyncOptions {
  doc: PDFDocumentProxy | null;
  docTitle: string;
  currentPage: number;
  numPages: number;
  lang: Language;
  isLoading: boolean;
  docId: string;
  beamState: { room: string | null; role: 'receiver' | 'sender' | null };
  beamSelection: { pageNumber: number; rects: AnnotationRect[] } | null;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  scrollToPage: (pageNumber: number, offsetRatio?: number) => void;
  goToNextPage: () => void;
  goToPrevPage: () => void;
  changeTheme: (nextTheme: ThemeMode, persistDocument?: boolean) => void;
  changeViewMode: (mode: ViewMode) => void;
  loadDocumentRef: React.MutableRefObject<
    (data: ArrayBuffer, title: string, startPage?: number, reportFailure?: boolean) => Promise<boolean>
  >;
  setIsLoading: (loading: boolean) => void;
  setDocumentError: (message: string | null) => void;
}

/**
 * Synchronizes page turns, relayed PDF payloads, and presenter text selections
 * over Otium Beam when acting as sender or receiver.
 */
export function useReaderBeamSync({
  doc,
  docTitle,
  currentPage,
  numPages,
  lang,
  isLoading,
  docId,
  beamState,
  beamSelection,
  scrollContainerRef,
  scrollToPage,
  goToNextPage,
  goToPrevPage,
  changeTheme,
  changeViewMode,
  loadDocumentRef,
  setIsLoading,
  setDocumentError,
}: UseReaderBeamSyncOptions): void {
  const lastBroadcastedPageRef = useRef<number | null>(null);
  const beamLoadingRef = useRef(false);
  const pendingBeamPageRef = useRef<number | null>(null);

  const beamSyncRef = useRef({
    hasPdf: Boolean(doc),
    docTitle,
    currentPage,
    numPages,
    lang,
    scrollToPage,
    goToNextPage,
    goToPrevPage,
    changeTheme,
    changeViewMode,
  });

  useEffect(() => {
    beamSyncRef.current = {
      hasPdf: Boolean(doc),
      docTitle,
      currentPage,
      numPages,
      lang,
      scrollToPage,
      goToNextPage,
      goToPrevPage,
      changeTheme,
      changeViewMode,
    };
  });

  useEffect(() => {
    if (doc && beamState.role === 'sender' && beamState.room) {
      if (lastBroadcastedPageRef.current !== currentPage) {
        lastBroadcastedPageRef.current = currentPage;
        beamService.broadcastPageChange(currentPage);
      }
    } else {
      lastBroadcastedPageRef.current = null;
    }
  }, [doc, currentPage, beamState.role, beamState.room]);

  useEffect(() => {
    if (!beamState.room || beamState.role !== 'receiver') return;

    const currentRoom = beamState.room;
    const initialSync = beamSyncRef.current;
    if (initialSync.docTitle) {
      beamService.announceState(
        initialSync.docTitle,
        initialSync.currentPage,
        initialSync.numPages
      );
    }

    const unsubscribe = beamService.subscribe((msg: BeamMessage) => {
      if (!beamService.isMatchingRoom(msg.roomCode, currentRoom)) return;
      const sync = beamSyncRef.current;

      if (msg.type === 'BEAM_PAGE_CHANGE' && typeof msg.pageNumber === 'number') {
        if (beamLoadingRef.current) {
          pendingBeamPageRef.current = msg.pageNumber;
        } else if (sync.hasPdf) {
          sync.scrollToPage(msg.pageNumber);
        }
      } else if (msg.type === 'BEAM_VIEW_MODE' && msg.viewMode && sync.hasPdf) {
        sync.changeViewMode(msg.viewMode);
      } else if (msg.type === 'BEAM_STEP' && sync.hasPdf) {
        if (msg.direction === 'next') {
          sync.goToNextPage();
        } else if (msg.direction === 'prev') {
          sync.goToPrevPage();
        }
      } else if (msg.type === 'BEAM_PAYLOAD' && msg.payload?.fileName === undefined) {
        return openPdf(msg, sync);
      }
    });

    async function openPdf(msg: BeamMessage, sync: typeof beamSyncRef.current) {
      const payloadTitle = msg.payload?.title || 'Beamed Document';
      try {
        beamLoadingRef.current = true;
        pendingBeamPageRef.current = null;
        setIsLoading(true);
        let buffer: ArrayBuffer | null = null;
        if (msg.payload?.pdfData) {
          buffer = msg.payload.pdfData;
        } else if (msg.payload?.pdfBase64) {
          buffer = base64ToArrayBuffer(msg.payload.pdfBase64);
        } else if (msg.payload?.pdfUrl) {
          buffer = await beamService.downloadRelayDocument(msg.payload.pdfUrl);
        } else if (msg.payload?.chunks && msg.payload.chunks.length > 0) {
          buffer = await beamService.downloadRelayChunks(
            msg.payload.chunks,
            msg.payload.totalSize,
            msg.payload.sha256
          );
        }

        if (!buffer) {
          throw new Error('No PDF payload found');
        }

        const opened = await loadDocumentRef.current(
          buffer,
          payloadTitle,
          msg.payload?.pageNumber,
          true
        );
        if (!opened) {
          throw new Error('The receiving device could not open this PDF. Check the error on its screen.');
        }
        if (msg.payload?.theme) {
          sync.changeTheme(msg.payload.theme);
        }
        beamService.announceState(
          payloadTitle,
          msg.payload?.pageNumber || 1,
          msg.payload?.totalPages || 1
        );
      } catch (err) {
        console.error('Failed to load beamed PDF in reader:', err);
        setIsLoading(false);
        setDocumentError(describeDocumentError(err, sync.lang));
        throw err;
      } finally {
        beamLoadingRef.current = false;
      }
    }

    return () => {
      unsubscribe();
    };
  }, [beamState.room, beamState.role, setIsLoading, setDocumentError, loadDocumentRef]);

  useEffect(() => {
    if (!beamSelection || beamState.role !== 'receiver' || !doc) return;
    const raf = window.requestAnimationFrame(() => {
      scrollToPage(beamSelection.pageNumber);
    });
    const timer = setTimeout(() => {
      const container = scrollContainerRef.current;
      const page = container?.querySelector<HTMLElement>(`[data-pdf-page="${beamSelection.pageNumber}"]`);
      const firstRect = beamSelection.rects[0];
      if (!container || !page || !firstRect) return;
      const rect = page.getBoundingClientRect();
      const viewport = container.getBoundingClientRect();
      const selectedY = rect.top + firstRect.yPct * rect.height;
      if (selectedY < viewport.top + 70 || selectedY > viewport.bottom - 70) {
        container.scrollTop += selectedY - viewport.top - container.clientHeight * 0.35;
      }
    }, 80);
    return () => {
      window.cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [beamSelection, beamState.role, doc, scrollToPage, scrollContainerRef]);

  useEffect(() => {
    if (isLoading || !docId || numPages <= 0 || beamLoadingRef.current || pendingBeamPageRef.current === null) return;
    const page = pendingBeamPageRef.current;
    pendingBeamPageRef.current = null;
    scrollToPage(page);
  }, [isLoading, numPages, docId, scrollToPage]);

  useEffect(() => {
    if (beamState.role === 'receiver' && beamState.room && docTitle) {
      beamService.setLocalDocumentState(docTitle, currentPage, numPages);
    }
  }, [currentPage, numPages, docTitle, beamState.role, beamState.room]);
}
