import React, { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { TeacherDock, type InkTool } from './TeacherDock';
import { useTeaching } from './teachingContextValue';
import { useAnnotationDelivery } from './useAnnotationDelivery';
import type { ReaderController } from '../app/useReaderController';
import { EMPTY_INK, inkHistory, mergeInk, readInk, writeInk, type InkMark } from '../core/annotations/ink';
import { beamService } from '../board/beam/beamService';
import { mergeTextAnnotations } from '../core/annotations/textSync';
import type { AnnotationRect, TextAnnotation } from '../core/types';
import { InkContext } from './documentInkContext';

export { DocumentInkLayer } from './DocumentInkLayer';

interface DocSyncState {
  docId: string;
  loadedId: string;
  status: 'loading' | 'saved' | 'saving' | 'error';
  message: string;
}

export function DocumentInkProvider({ reader, children }: { reader: ReaderController; children: React.ReactNode }) {
  const { receiveBeamSelection, mergeRemoteAnnotations } = reader;
  const docKey = reader.docId ?? '';
  const [history, dispatch] = useReducer(inkHistory, EMPTY_INK);
  const teaching = useTeaching();
  const toolScope = `${teaching.target}:${teaching.layout}:${docKey}`;
  const [toolState, setToolState] = useState<{ scope: string; tool: InkTool }>({ scope: toolScope, tool: 'hand' });
  const [docSync, setDocSync] = useState<DocSyncState>({ docId: docKey, loadedId: '', status: 'loading', message: '' });
  const [exportState, setExportState] = useState<{ exporting: boolean; message: string }>({ exporting: false, message: '' });

  const tool = toolState.scope === toolScope ? toolState.tool : 'hand';
  const setTool = useCallback((next: InkTool) => {
    setToolState({ scope: toolScope, tool: next });
  }, [toolScope]);

  const activeSync = docSync.docId === docKey ? docSync : { docId: docKey, loadedId: '', status: 'loading' as const, message: '' };
  const loadedId = activeSync.loadedId;
  const status = activeSync.status;
  const syncMessage = activeSync.message;

  const { color, width: size, stylusOnly: stylus } = teaching.prefs;
  const { delivery, queue } = useAnnotationDelivery(reader);

  const saveQueue = useRef(Promise.resolve());
  const documentRef = useRef(reader.docId);
  const marksRef = useRef(history.present);
  const sharedMarks = useRef<InkMark[]>([]);
  const annotationsRef = useRef(reader.annotations);
  const sharedAnnotations = useRef<TextAnnotation[]>([]);

  useLayoutEffect(() => {
    annotationsRef.current = reader.annotations;
  }, [reader.annotations]);

  useLayoutEffect(() => {
    documentRef.current = reader.docId;
    marksRef.current = history.present;
  }, [reader.docId, history.present]);

  const ready = !!reader.doc && loadedId === reader.docId;
  const ar = reader.lang === 'ar';
  const change = useCallback((marks: InkMark[]) => dispatch({ type: 'change', marks }), []);
  const selectionBroadcast = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (selectionBroadcast.current) clearTimeout(selectionBroadcast.current);
  }, []);

  const publishSelection = useCallback((selection: { page: number; rects: AnnotationRect[] } | null) => {
    if (selectionBroadcast.current) clearTimeout(selectionBroadcast.current);
    if (!reader.docId || !reader.beamRoom || !reader.beamPeerConnected) return;
    const sendSelection = () => {
      selectionBroadcast.current = null;
      void beamService.broadcast({
        type: 'BEAM_SELECTION',
        roomCode: reader.beamRoom!,
        selection: { documentId: reader.docId!, page: selection?.page || 1, rects: selection?.rects || [] },
        timestamp: Date.now(),
      });
    };
    if (!selection) sendSelection();
    else selectionBroadcast.current = setTimeout(sendSelection, 90);
  }, [reader.docId, reader.beamRoom, reader.beamPeerConnected]);

  const scopeRef = useRef('');

  useEffect(() => {
    const scope = `${teaching.target}:${teaching.layout}`;
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    publishSelection(null);
  }, [teaching.target, teaching.layout, publishSelection]);

  useEffect(() => {
    if (teaching.target !== 'document' || !ready) return;
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]') || !(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      event.preventDefault();
      event.stopPropagation();
      dispatch({ type: key === 'y' || event.shiftKey ? 'redo' : 'undo' });
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [teaching.target, ready]);

  useEffect(() => {
    let alive = true;
    sharedAnnotations.current = [];
    const currentId = reader.docId;
    if (!currentId) return;
    void saveQueue.current
      .then(undefined, (err: unknown) => {
        console.warn('[DocumentInk] Previous ink save failed before read:', err);
      })
      .then(() => readInk(currentId))
      .then((marks) => {
        if (!alive) return;
        sharedMarks.current = marks;
        dispatch({ type: 'load', marks });
        setDocSync({ docId: currentId, loadedId: currentId, status: 'saved', message: '' });
      })
      .catch(() => {
        if (alive) {
          setDocSync({ docId: currentId, loadedId: '', status: 'error', message: 'load-error' });
        }
      });
    return () => {
      alive = false;
    };
  }, [reader.docId]);

  useEffect(() => {
    if (!reader.docId || !reader.beamRoom || !reader.beamPeerConnected) return;
    const documentId = reader.docId;
    const roomCode = reader.beamRoom;
    const sendSnapshot = () => queue.send({
      type: 'BEAM_TEXT_ANNOTATIONS', roomCode, annotationSnapshot: true,
      annotationSync: { documentId, upsert: annotationsRef.current }, timestamp: Date.now(),
    });
    const unsubscribe = beamService.subscribe((msg) => {
      if (msg.type === 'BEAM_SELECTION' && msg.selection?.documentId === documentId) {
        if (msg.selection.page <= reader.numPages) receiveBeamSelection(msg.selection.page, msg.selection.rects);
        return;
      }
      if (msg.annotationSync?.documentId !== documentId) return;
      if (msg.type === 'BEAM_TEXT_ANNOTATIONS_REQUEST') {
        sendSnapshot();
      } else if (msg.type === 'BEAM_TEXT_ANNOTATIONS') {
        queue.receive(msg.type, msg, msg.annotationSync, (upsert, deleted) => {
          const incoming = msg.annotationSnapshot
            ? upsert.filter(item => !annotationsRef.current.some(current => current.id === item.id)) : upsert;
          const merged = mergeTextAnnotations(annotationsRef.current, incoming, deleted);
          sharedAnnotations.current = merged;
          annotationsRef.current = merged;
          if (incoming.length || deleted.length) mergeRemoteAnnotations(incoming, deleted);
        });
      }
    });
    sendSnapshot();
    void beamService.broadcast({ type: 'BEAM_TEXT_ANNOTATIONS_REQUEST', roomCode, annotationSync: { documentId }, timestamp: Date.now() });
    return unsubscribe;
  }, [reader.docId, reader.beamRoom, reader.beamPeerConnected, reader.numPages, receiveBeamSelection, mergeRemoteAnnotations, queue]);

  useEffect(() => {
    const previous = new Map(sharedAnnotations.current.map((a) => [a.id, a]));
    const current = new Set(reader.annotations.map((a) => a.id));
    const upsert = reader.annotations.filter((a) => JSON.stringify(previous.get(a.id)) !== JSON.stringify(a));
    const deleted = [...previous.keys()].filter((id) => !current.has(id));
    sharedAnnotations.current = reader.annotations;
    if (!reader.docId || !reader.beamRoom || (!upsert.length && !deleted.length)) return;
    queue.send({
      type: 'BEAM_TEXT_ANNOTATIONS',
      roomCode: reader.beamRoom,
      annotationSync: { documentId: reader.docId, upsert, deleted },
      timestamp: Date.now(),
    });
  }, [reader.annotations, reader.docId, reader.beamRoom, queue]);

  useEffect(() => {
    if (!ready || !reader.docId || !reader.beamPeerConnected || !reader.beamRoom) return;
    const roomCode = reader.beamRoom;
    const documentId = reader.docId;
    const sendSnapshot = () => queue.send({
      type: 'BEAM_INK_UPDATE', roomCode, annotationSnapshot: true,
      ink: { documentId, upsert: marksRef.current }, timestamp: Date.now(),
    });
    const unsubscribe = beamService.subscribe((msg) => {
      if (!msg.ink || msg.ink.documentId !== documentId) return;
      if (msg.type === 'BEAM_INK_REQUEST') {
        sendSnapshot();
      } else if (msg.type === 'BEAM_INK_UPDATE') {
        queue.receive(msg.type, msg, msg.ink, (upsert, deleted) => {
          const incoming = msg.annotationSnapshot
            ? upsert.filter(item => !marksRef.current.some(current => current.id === item.id)) : upsert;
          const marks = mergeInk(marksRef.current, incoming, deleted);
          if (JSON.stringify(marks) === JSON.stringify(marksRef.current)) return;
          sharedMarks.current = marks;
          marksRef.current = marks;
          dispatch({ type: 'remote', upsert: incoming, deleted });
        });
      }
    });
    sendSnapshot();
    void beamService.broadcast({ type: 'BEAM_INK_REQUEST', roomCode, ink: { documentId }, timestamp: Date.now() });
    return unsubscribe;
  }, [ready, reader.docId, reader.beamPeerConnected, reader.beamRoom, queue]);

  useEffect(() => {
    if (!ready) return;
    const previous = new Map(sharedMarks.current.map((mark) => [mark.id, mark]));
    const current = new Set(history.present.map((mark) => mark.id));
    const upsert = history.present.filter((mark) => JSON.stringify(previous.get(mark.id)) !== JSON.stringify(mark));
    const deleted = [...previous.keys()].filter((id) => !current.has(id));
    sharedMarks.current = history.present;
    if ((!upsert.length && !deleted.length) || !reader.beamRoom || !reader.docId) return;
    queue.send({ type: 'BEAM_INK_UPDATE', roomCode: reader.beamRoom, ink: { documentId: reader.docId, upsert, deleted }, timestamp: Date.now() });
  }, [history.present, ready, reader.beamRoom, reader.docId, queue]);

  useEffect(() => {
    if (!ready || !history.revision) return;
    const id = loadedId;
    let alive = true;
    saveQueue.current = saveQueue.current
      .then(undefined, (err: unknown) => {
        console.warn('[DocumentInk] Previous ink save failed before write:', err);
      })
      .then(() => {
        if (alive && documentRef.current === id) {
          setDocSync({ docId: id, loadedId: id, status: 'saving', message: '' });
        }
        return writeInk(id, history.present);
      });
    void saveQueue.current
      .then(() => {
        if (alive && documentRef.current === id) {
          setDocSync({ docId: id, loadedId: id, status: 'saved', message: '' });
        }
      })
      .catch(() => {
        if (alive && documentRef.current === id) {
          setDocSync({ docId: id, loadedId: id, status: 'error', message: 'save-error' });
        }
      });
    return () => {
      alive = false;
    };
  }, [history.revision, history.present, ready, loadedId]);

  const exportPdf = async () => {
    if (!reader.doc || exportState.exporting) return;
    setExportState({ exporting: true, message: '' });
    try {
      const { exportInkPdf } = await import('../core/annotations/inkExport');
      await exportInkPdf(
        reader.doc,
        history.present,
        reader.docTitle || 'Otium',
        (page) => setExportState({ exporting: true, message: ar ? `تجهيز شرح الصفحة ${page}…` : `Preparing page ${page}…` }),
        reader.annotations
      );
      setExportState({ exporting: false, message: ar ? 'تم تجهيز نسخة PDF المشروحة' : 'Annotated PDF ready' });
    } catch (error) {
      setExportState({ exporting: false, message: error instanceof Error ? error.message : (ar ? 'تعذر التصدير' : 'Export failed') });
    }
  };

  const documentStatus =
    status === 'error' || reader.annotationSaveStatus === 'error'
      ? 'error'
      : status === 'saving' || reader.annotationSaveStatus === 'saving'
        ? 'saving'
        : status;

  const rawMessage = exportState.message || syncMessage;
  const displayMessage =
    rawMessage === 'load-error'
      ? (ar ? 'تعذر تحميل الشرح. أعد فتح الملف قبل التعديل.' : 'Could not load annotations. Reopen before editing.')
      : rawMessage === 'save-error'
        ? (ar ? 'لم يُحفظ آخر تعديل. صدّر نسخة قبل الإغلاق.' : 'Save failed. Export a copy before closing.')
        : rawMessage;

  const contextValue = useMemo(
    () => ({
      ready,
      tool: teaching.target === 'document' && !teaching.presentation ? tool : 'hand',
      color,
      size,
      stylus,
      marks: ready ? history.present : [],
      change,
      setTool,
      publishSelection,
    }),
    [ready, teaching.target, teaching.presentation, tool, color, size, stylus, history.present, change, setTool, publishSelection]
  );

  return (
    <InkContext.Provider value={contextValue}>
      {children}
      {/* Phone keeps its document annotation dock (including text selection),
          while the desktop dock appears only in the board workspace. */}
      {(teaching.mobile || teaching.layout !== 'document') && (
        <TeacherDock
          reader={reader}
          ink={{
            ready,
            tool,
            setTool,
            canUndo: !!history.past.length,
            canRedo: !!history.future.length,
            undo: () => dispatch({ type: 'undo' }),
            redo: () => dispatch({ type: 'redo' }),
            clear: () => change([]),
            status: documentStatus,
            delivery,
            exporting: exportState.exporting,
            exportPdf: () => void exportPdf(),
            message: displayMessage,
          }}
        />
      )}
    </InkContext.Provider>
  );
}
