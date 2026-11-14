import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReaderController } from '../app/useReaderController';
import type { RecentDocItem } from '../core/storage/documents';
import type { BeamPayload } from '../board/types';
import { useMediaBeam } from './useMediaBeam';
import { beamService } from '../board/beam/beamService';
import type { Deck } from './pptx';
import { describeFile, validateFile } from './media';
import { registerIncomingDocumentHandler } from '../platform/incomingDocument';
import { loadMedia, mediaKind, newMediaItem, storeMedia, updateMedia, type MediaLibraryItem, type MediaProgress } from './library';
import { loadDocumentTheme, loadRememberDocTheme, saveDocumentTheme } from '../core/settings/preferences';
export type ActiveMedia = { file: File; item: MediaLibraryItem; saved: boolean; deck?: Deck; received?: boolean };

async function prepareIncomingMedia(file: File) {
  if (describeFile(file.name).kind === 'presentation') {
    return (await import('./pptx')).openPptx(await file.arrayBuffer());
  }
  const url = URL.createObjectURL(file);
  try {
    if (describeFile(file.name).kind === 'image') {
      const image = new Image();
      image.src = url;
      await image.decode();
    } else {
      const video = document.createElement('video');
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('The video did not load on the receiving device.')), 10_000);
        video.onloadedmetadata = () => {
          clearTimeout(timer);
          if (!video.videoWidth) reject(new Error('The file does not contain a playable video track.'));
          else resolve();
        };
        video.onerror = () => { clearTimeout(timer); reject(new Error('The receiving device cannot play this video codec.')); };
        video.preload = 'metadata';
        video.src = url;
      }).finally(() => {
        video.onloadedmetadata = video.onerror = null;
        video.removeAttribute('src');
        video.load();
      });
    }
  } finally { URL.revokeObjectURL(url); }
  return undefined;
}
export function useAppMedia(reader: ReaderController) {
  const [active, setActive] = useState<ActiveMedia | null>(null);
  const [pending, setPending] = useState(false);
  const [nativePending, setNativePending] = useState(false);
  const nativeRequest = useRef<{ id?: string; ticket: number } | null>(null);
  const current = useRef<ActiveMedia | null>(null), progress = useRef<MediaProgress>({ lastPage: 1, totalPages: 1, position: 0 });
  const generation = useRef(0);
  const dirty = useRef(false);
  const { openFile: openPdf, openRecent: openRecentPdf, closeDocument, setDocumentError } = reader;
  const commit = useCallback((value: ActiveMedia | null) => {
    current.current = value;
    setActive(value);
    dirty.current = false;
    if (value) {
      progress.current = value.item;
      if (loadRememberDocTheme()) {
        const savedTheme = loadDocumentTheme(value.item.id, value.file.name);
        if (savedTheme) {
          reader.changeTheme(savedTheme, false);
        }
      }
    }
  }, [reader]);
  const persist = useCallback(async () => {
    if (!current.current?.saved || !dirty.current) return;
    const source = current.current, snapshot = progress.current;
    dirty.current = false;
    try { await updateMedia(source.item.id, snapshot); }
    catch { if (current.current === source) dirty.current = true; }
  }, []);
  const incomingActions = useRef({ reader, persist, commit });
  useEffect(() => { incomingActions.current = { reader, persist, commit }; });
  useEffect(() => registerIncomingDocumentHandler(async incoming => {
    const ticket = nativeRequest.current?.id === incoming.id && nativeRequest.current ? nativeRequest.current.ticket : ++generation.current;
    if (ticket !== generation.current) return false;
    const actions = incomingActions.current;
    await actions.persist();
    if (ticket !== generation.current) return false;
    const opened = await actions.reader.loadDocumentBytes(incoming.data, incoming.name);
    if (ticket !== generation.current) return false;
    if (opened) actions.commit(null);
    return opened;
  }, message => incomingActions.current.reader.setDocumentError(message), (reading, id) => {
    if (reading) {
      if (!nativeRequest.current || nativeRequest.current.id !== id) nativeRequest.current = { id, ticket: ++generation.current };
      setNativePending(true);
    } else {
      if (id && nativeRequest.current?.id !== id) return;
      nativeRequest.current = null; setNativePending(false);
    }
  }), []);
  useEffect(() => {
    if (current.current?.item.id && reader.theme && loadRememberDocTheme()) {
      saveDocumentTheme(current.current.item.id, reader.theme);
    }
  }, [reader.theme]);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => { void persist(); }, 5000);
    const flush = () => { void persist(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => { window.clearInterval(timer); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', flush); void persist(); };
  }, [active, persist]);
  const close = useCallback(async () => { const ticket = ++generation.current; await persist(); if (ticket !== generation.current) return; current.current = null; setActive(null); setPending(false); }, [persist]);
  const openMedia = useCallback(async (file: File, received?: BeamPayload,
    stillCurrent: () => boolean = () => true, getPage?: () => number | undefined) => {
    if (describeFile(file.name).kind !== 'pdf') {
      const problem = validateFile(file);
      if (problem || !mediaKind(file)) { setDocumentError(problem || 'هذه الصيغة غير مدعومة بعد.'); return false; }
    }
    const ticket = ++generation.current;
    setPending(true);
    try {
      await persist();
      if (ticket !== generation.current || !stillCurrent()) return false;
      if (describeFile(file.name).kind === 'pdf') {
        const opened = await openPdf(file);
        if (ticket !== generation.current || opened === false) return false;
        commit(null);
      } else {
        const item = newMediaItem(file);
        const deck = received ? await prepareIncomingMedia(file) : undefined;
        if (ticket !== generation.current || !stillCurrent()) return false;
        if (deck && received) {
          item.totalPages = deck.slides.length;
          item.lastPage = Math.min(item.totalPages, Math.max(1, Math.round(Number(getPage?.() ?? received.pageNumber)) || 1));
        }
        const saved = !received && await storeMedia(file, item).catch(() => false);
        if (ticket !== generation.current || !stillCurrent()) return false;
        closeDocument(); commit({ file, item, saved, deck, received: Boolean(received) });
        if (received?.theme) reader.changeTheme(received.theme, false);
      }
      return true;
    } catch (error) {
      if (ticket === generation.current) setDocumentError(error instanceof Error ? error.message : 'تعذر فتح الملف.');
      if (received) throw error;
      return false;
    }
    finally { if (ticket === generation.current) setPending(false); }
  }, [persist, commit, openPdf, closeDocument, setDocumentError, reader]);
  const open = useCallback((file: File) => openMedia(file), [openMedia]);
  const openRecent = useCallback(async (item: RecentDocItem) => {
    const ticket = ++generation.current; setPending(true);
    try {
      await persist();
      if (ticket !== generation.current) return;
      if (!item.id.startsWith('media:')) {
        const opened = await openRecentPdf(item);
        if (ticket === generation.current && opened !== false) commit(null);
        return;
      }
      const stored = await loadMedia(item.id);
      if (ticket !== generation.current) return;
      closeDocument(); commit({ ...stored, saved: true });
    } catch (error) { if (ticket === generation.current) setDocumentError(error instanceof Error ? error.message : 'تعذر فتح الملف المحفوظ.'); }
    finally { if (ticket === generation.current) setPending(false); }
  }, [persist, commit, closeDocument, openRecentPdf, setDocumentError]);
  const updateProgress = useCallback((value: MediaProgress) => {
    if (value.lastPage !== progress.current.lastPage || value.totalPages !== progress.current.totalPages || value.position !== progress.current.position) {
      progress.current = value; dirty.current = true;
    }
  }, []);
  const beam = useMediaBeam(reader, active, openMedia, progress);
  const { beamRole, beamRoom } = reader;
  useEffect(() => {
    if (beamRole !== 'receiver' || !beamRoom) return;
    return beamService.subscribe(message => {
      if (message.type !== 'BEAM_DOCUMENT_OPENED' || message.payload?.fileName !== undefined ||
          !beamService.isMatchingRoom(message.roomCode, beamRoom) || !current.current) return;
      void persist();
      generation.current++;
      commit(null);
      setPending(false);
    });
  }, [beamRole, beamRoom, commit, persist]);
  const onBeamProgress = beam.update;
  const reportProgress = useCallback((value: MediaProgress) => {
    onBeamProgress(value, progress.current);
    updateProgress(value);
  }, [onBeamProgress, updateProgress]);
  return { active, pending: pending || nativePending, open, openRecent, close, updateProgress: reportProgress, beam };
}
