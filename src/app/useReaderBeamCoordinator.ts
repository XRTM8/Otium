import type { MutableRefObject, RefObject } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ThemeMode, ViewMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { beamService } from '../board/beam/beamService';
import { useAutoBeamDocument } from '../board/beam/useAutoBeamDocument';
import { useReaderBeamState } from './useReaderBeamState';
import { useReaderBeamSync } from './useReaderBeamSync';

interface UseReaderBeamCoordinatorParams {
  doc: PDFDocumentProxy | null;
  docTitle: string;
  docId: string;
  numPages: number;
  currentPage: number;
  viewMode: ViewMode;
  theme: ThemeMode;
  lang: Language;
  isLoading: boolean;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  scrollToPage: (pageNumber: number, offsetRatio?: number) => void;
  goToNextPage: () => void;
  goToPrevPage: () => void;
  changeTheme: (nextTheme: ThemeMode, persistDocument?: boolean) => void;
  changeViewMode: (mode: ViewMode) => void;
  loadDocumentRef: MutableRefObject<
    (data: ArrayBuffer, title: string, startPage?: number, reportFailure?: boolean) => Promise<boolean>
  >;
  setIsLoading: (loading: boolean) => void;
  setDocumentError: (message: string | null) => void;
}

export function useReaderBeamCoordinator(params: UseReaderBeamCoordinatorParams) {
  const {
    beamState,
    beamPeerConnected,
    beamSelection,
    receiveBeamSelection,
  } = useReaderBeamState(params.docId);

  const autoBeam = useAutoBeamDocument({
    doc: params.doc,
    docId: params.docId,
    title: params.docTitle,
    page: params.currentPage,
    total: params.numPages,
    theme: params.theme,
    viewMode: params.viewMode,
    room: beamState.room,
    role: beamState.role,
    peerConnected: beamPeerConnected,
    loading: params.isLoading,
  });

  useReaderBeamSync({
    doc: params.doc,
    docTitle: params.docTitle,
    currentPage: params.currentPage,
    numPages: params.numPages,
    lang: params.lang,
    isLoading: params.isLoading,
    docId: params.docId,
    beamState,
    beamSelection,
    scrollContainerRef: params.scrollContainerRef,
    scrollToPage: params.scrollToPage,
    goToNextPage: params.goToNextPage,
    goToPrevPage: params.goToPrevPage,
    changeTheme: params.changeTheme,
    changeViewMode: params.changeViewMode,
    loadDocumentRef: params.loadDocumentRef,
    setIsLoading: params.setIsLoading,
    setDocumentError: params.setDocumentError,
  });

  return {
    beamRoom: beamState.room,
    beamPeerConnected,
    autoBeam,
    beamRole: beamState.role,
    beamSelection,
    receiveBeamSelection,
    disconnectBeam: () => beamService.disconnect(),
  };
}
