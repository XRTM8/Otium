import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ReaderController } from '../app/useReaderController';
import { beamService } from '../board/beam/beamService';
import type { BeamMessage, BeamPayload } from '../board/types';
import { MAX_FILE_BYTES } from '../board/beam/beamTypesAndConstants';
import type { ActiveMedia } from './useAppMedia';
import { describeFile, isBeamMediaFile, validateFile } from './media';
import type { MediaProgress } from './library';

type OpenMedia = (file: File, received: BeamPayload, stillCurrent: () => boolean, getPage: () => number | undefined) => Promise<boolean>;

export function useMediaBeam(
  reader: ReaderController,
  active: ActiveMedia | null,
  open: OpenMedia,
  progress: React.RefObject<MediaProgress>,
) {
  const [remotePage, setRemotePage] = useState<{ id: string; page: number } | null>(null);
  const [transfer, setTransfer] = useState(() => beamService.getTransferState());
  const attempt = useRef<File | null>(null);
  const sending = useRef(false);
  const [retryCount, setRetryCount] = useState(0);
  const [failure, setFailure] = useState<{ file: File; message: string } | null>(null);
  const { beamRoom: room, beamRole: role, beamPeerConnected: connected } = reader;
  const file = active?.file;
  const canSend = Boolean(file && isBeamMediaFile(file.name));
  const error = failure && failure.file === file ? failure.message : null;

  const latestSendState = useRef({ file, theme: reader.theme });
  useEffect(() => { latestSendState.current = { file, theme: reader.theme }; }, [file, reader.theme]);
  useEffect(() => beamService.onTransferProgress(setTransfer), []);
  const attemptScope = useRef({ room, role });
  useEffect(() => {
    if (attemptScope.current.room !== room || attemptScope.current.role !== role) {
      attempt.current = null;
      attemptScope.current = { room, role };
    }
    if (!file || !canSend || !room || role !== 'sender' || !connected ||
        transfer.active || sending.current || attempt.current === file || retryCount < 0) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      attempt.current = file;
      sending.current = true;
      setFailure(null);
      try {
        const problem = validateFile(file);
        if (problem) throw new Error(problem);
        if (file.size > MAX_FILE_BYTES) throw new Error('حجم الملف يتجاوز حد البث المباشر 300 MB.');
        const buffer = await file.arrayBuffer();
        if (cancelled || latestSendState.current.file !== file || beamService.getConnectedRoom() !== room) return;
        const { theme } = latestSendState.current;
        const { lastPage, totalPages } = progress.current;
        await beamService.sendDocument({ roomCode: room, buffer, title: file.name, fileName: file.name,
          pageNumber: lastPage, totalPages, theme });
        if (latestSendState.current.file === file && beamService.getConnectedRoom() === room) {
          beamService.broadcastPageChange(progress.current.lastPage);
        }
      } catch (cause) {
        setFailure({ file, message: cause instanceof Error ? cause.message : 'تعذر بث الملف.' });
      } finally {
        sending.current = false;
        setRetryCount(value => value + 1);
      }
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [canSend, file, room, role, connected, progress, transfer.active, retryCount]);

  const incomingPage = useRef<{ page?: number } | null>(null);
  const wasPresenting = useRef(false);
  useEffect(() => {
    if (role !== 'receiver' || !room) {
      wasPresenting.current = false;
      return;
    }
    if (active) {
      beamService.setLocalDocumentState(active.file.name, progress.current.lastPage, progress.current.totalPages);
    } else if (wasPresenting.current && !reader.doc) {
      beamService.setLocalDocumentState('', 1, 0);
    }
    wasPresenting.current = Boolean(active);
  }, [role, room, active, progress, reader.doc]);

  const handleMessage = useEffectEvent((message: BeamMessage, direct: boolean) => {
    if (message.type === 'BEAM_PAYLOAD' && message.payload?.fileName !== undefined) {
      const payload = message.payload;
      if (!direct || !(payload.fileData instanceof ArrayBuffer) || payload.fileData.byteLength > MAX_FILE_BYTES ||
          typeof payload.fileName !== 'string' || !isBeamMediaFile(payload.fileName) ||
          validateFile({ name: payload.fileName, size: payload.fileData.byteLength })) {
        return Promise.reject(new Error('The receiving device rejected this media file.'));
      }
      const incoming = new File([payload.fileData], payload.fileName, { type: describeFile(payload.fileName).mime });
      const pending: { page?: number } = {};
      incomingPage.current = pending;
      const stillCurrent = () => incomingPage.current === pending && beamService.isReceivingSession(room, message.sessionId);
      return open(incoming, payload, stillCurrent, () => pending.page).then(opened => {
        if (!opened) throw new Error('The receiving device could not open this media file.');
      }).finally(() => {
        if (incomingPage.current === pending) incomingPage.current = null;
      });
    }
    if (incomingPage.current && message.type === 'BEAM_PAGE_CHANGE' && Number.isSafeInteger(message.pageNumber)) {
      incomingPage.current.page = message.pageNumber;
      return;
    }
    if (!active || active.item.mediaKind !== 'presentation') return;
    if (message.type === 'BEAM_PAGE_CHANGE' && Number.isSafeInteger(message.pageNumber)) {
      setRemotePage({ id: active.item.id, page: message.pageNumber! });
    } else if (message.type === 'BEAM_STEP' && (message.direction === 'next' || message.direction === 'prev')) {
      const move = message.direction === 'next' ? 1 : -1;
      const page = progress.current.lastPage;
      const { totalPages } = progress.current;
      setRemotePage(previous => ({ id: active.item.id, page: Math.min(totalPages,
        Math.max(1, (previous?.id === active.item.id ? previous.page : page) + move)) }));
    }
  });

  useEffect(() => {
    if (role !== 'receiver' || !room) return;
    return beamService.subscribe((message, transport) => {
      if (beamService.isMatchingRoom(message.roomCode, room)) return handleMessage(message, transport === 'p2p');
    });
  }, [role, room]);

  const update = useCallback((value: MediaProgress, previous: MediaProgress) => {
    if (!active) return;
    const pageChanged = previous.lastPage !== value.lastPage;
    if (role === 'receiver' && (pageChanged || previous.totalPages !== value.totalPages)) {
      beamService.setLocalDocumentState(active.file.name, value.lastPage, value.totalPages);
    } else if (role === 'sender' && active.item.mediaKind === 'presentation' && pageChanged) {
      beamService.broadcastPageChange(value.lastPage);
    }
  }, [active, role]);
  return {
    canSend,
    remotePage: remotePage?.id === active?.item.id ? remotePage : null,
    error,
    retry: () => { attempt.current = null; setFailure(null); setRetryCount(value => value + 1); },
    update,
  };
}
