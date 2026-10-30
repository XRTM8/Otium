import React, { createContext, useContext, useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { TeacherDock, type InkTool } from './TeacherDock';
import { useTeaching } from './TeachingContext';
import { useAnnotationDelivery } from './useAnnotationDelivery';
import type { ReaderController } from '../app/useReaderController';
import { clampPoint, EMPTY_INK, hitInk, inkHistory, mergeInk, readInk, writeInk, type InkMark, type InkPoint } from '../core/annotations/ink';
import { beamService } from '../board/beam/beamService';
import { mergeTextAnnotations } from '../core/annotations/textSync';
import type { TextAnnotation } from '../core/types';

interface InkContextValue {
  ready: boolean; tool: InkTool; color: string; size: number; stylus: boolean;
  marks: InkMark[]; change: (marks: InkMark[]) => void;
  publishSelection: (selection: { page: number; rects: import('../core/types').AnnotationRect[] } | null) => void;
}
const InkContext = createContext<InkContextValue | null>(null);
const noSelection = () => {};
export function useDocumentInteraction() {
  const context = useContext(InkContext);
  return { mode: context?.stylus && context.tool !== 'select' ? 'hand' : context?.tool || 'hand', publishSelection: context?.publishSelection || noSelection };
}
const newMarkId = () => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID() : `ink-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function DocumentInkProvider({ reader, children }: { reader: ReaderController; children: React.ReactNode }) {
  const { receiveBeamSelection, mergeRemoteAnnotations } = reader;
  const [history, dispatch] = useReducer(inkHistory, EMPTY_INK);
  const [loadedId, setLoadedId] = useState('');
  const [tool, setTool] = useState<InkTool>('hand');
  const teaching = useTeaching();
  const { color, width: size, stylusOnly: stylus } = teaching.prefs;
  const { delivery, send, acknowledge } = useAnnotationDelivery(reader);
  const [status, setStatus] = useState<'loading' | 'saved' | 'saving' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [exporting, setExporting] = useState(false);
  const saveQueue = useRef(Promise.resolve());
  const documentRef = useRef(reader.docId);
  const marksRef = useRef(history.present);
  const sharedMarks = useRef<InkMark[]>([]);
  const annotationsRef = useRef(reader.annotations);
  const sharedAnnotations = useRef<TextAnnotation[]>([]);
  useLayoutEffect(() => { annotationsRef.current = reader.annotations; }, [reader.annotations]);
  useLayoutEffect(() => { documentRef.current = reader.docId; marksRef.current = history.present; }, [reader.docId, history.present]);
  const ready = !!reader.doc && loadedId === reader.docId;
  const ar = reader.lang === 'ar';
  const change = (marks: InkMark[]) => dispatch({ type: 'change', marks });
  const selectionBroadcast = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (selectionBroadcast.current) clearTimeout(selectionBroadcast.current); }, [reader.docId, reader.beamRoom]);
  const publishSelection = useCallback((selection: { page: number; rects: import('../core/types').AnnotationRect[] } | null) => {
    if (selectionBroadcast.current) clearTimeout(selectionBroadcast.current);
    if (!reader.docId || !reader.beamRoom || !reader.beamPeerConnected) return;
    const send = () => {
      selectionBroadcast.current = null;
      void beamService.broadcast({ type: 'BEAM_SELECTION', roomCode: reader.beamRoom!,
        selection: { documentId: reader.docId!, page: selection?.page || 1, rects: selection?.rects || [] }, timestamp: Date.now() });
    };
    if (!selection) send();
    else selectionBroadcast.current = setTimeout(send, 90);
  }, [reader.docId, reader.beamRoom, reader.beamPeerConnected]);
  useEffect(() => { setTool('hand'); publishSelection(null); }, [teaching.target, teaching.layout, publishSelection]);

  useEffect(() => {
    if (teaching.target !== 'document' || !ready) return;
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]') || !(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      event.preventDefault(); event.stopPropagation();
      dispatch({ type: key === 'y' || event.shiftKey ? 'redo' : 'undo' });
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [teaching.target, ready]);

  useEffect(() => {
    let alive = true;
    setLoadedId(''); setTool('hand'); setMessage(''); setStatus('loading');
    if (!reader.docId) return;
    void saveQueue.current.catch(() => {}).then(() => readInk(reader.docId!)).then(marks => {
      if (!alive) return;
      sharedMarks.current = marks;
      dispatch({ type: 'load', marks }); setLoadedId(reader.docId!); setStatus('saved');
    }).catch(() => { if (alive) { setStatus('error'); setMessage('load-error'); } });
    return () => { alive = false; };
  }, [reader.docId]);

  useEffect(() => { sharedAnnotations.current = []; }, [reader.docId]);
  useEffect(() => {
    if (!reader.docId || !reader.beamRoom || !reader.beamPeerConnected) return;
    const documentId = reader.docId, roomCode = reader.beamRoom;
    const unsubscribe = beamService.subscribe(message => {
      if (message.type === 'BEAM_SELECTION' && message.selection?.documentId === documentId) {
        if (message.selection.page <= reader.numPages) receiveBeamSelection(message.selection.page, message.selection.rects);
        return;
      }
      if (message.annotationSync?.documentId !== documentId) return;
      if (message.type === 'BEAM_TEXT_ANNOTATIONS_REQUEST') {
        send({ type: 'BEAM_TEXT_ANNOTATIONS', roomCode, annotationSync: { documentId, upsert: annotationsRef.current }, timestamp: Date.now() });
      } else if (message.type === 'BEAM_TEXT_ANNOTATIONS') {
        acknowledge(message);
        const merged = mergeTextAnnotations(annotationsRef.current, message.annotationSync.upsert, message.annotationSync.deleted);
        sharedAnnotations.current = merged;
        annotationsRef.current = merged;
        mergeRemoteAnnotations(message.annotationSync.upsert || [], message.annotationSync.deleted || []);
      }
    });
    send({ type: 'BEAM_TEXT_ANNOTATIONS', roomCode, annotationSync: { documentId, upsert: annotationsRef.current }, timestamp: Date.now() });
    void beamService.broadcast({ type: 'BEAM_TEXT_ANNOTATIONS_REQUEST', roomCode, annotationSync: { documentId }, timestamp: Date.now() });
    return unsubscribe;
  }, [reader.docId, reader.beamRoom, reader.beamPeerConnected, reader.numPages, receiveBeamSelection, mergeRemoteAnnotations, send, acknowledge]);

  useEffect(() => {
    const previous = new Map(sharedAnnotations.current.map(a => [a.id, a]));
    const current = new Set(reader.annotations.map(a => a.id));
    const upsert = reader.annotations.filter(a => JSON.stringify(previous.get(a.id)) !== JSON.stringify(a));
    const deleted = [...previous.keys()].filter(id => !current.has(id));
    sharedAnnotations.current = reader.annotations;
    if (!reader.docId || !reader.beamRoom || !reader.beamPeerConnected || (!upsert.length && !deleted.length)) return;
    send({ type: 'BEAM_TEXT_ANNOTATIONS', roomCode: reader.beamRoom,
      annotationSync: { documentId: reader.docId, upsert, deleted }, timestamp: Date.now() });
  }, [reader.annotations, reader.docId, reader.beamRoom, reader.beamPeerConnected, send]);

  useEffect(() => {
    if (!ready || !reader.docId || !reader.beamPeerConnected || !reader.beamRoom) return;
    const roomCode = reader.beamRoom, documentId = reader.docId;
    const unsubscribe = beamService.subscribe(message => {
      if (!message.ink || message.ink.documentId !== documentId) return;
      if (message.type === 'BEAM_INK_REQUEST') {
        send({ type: 'BEAM_INK_UPDATE', roomCode, ink: { documentId, upsert: marksRef.current }, timestamp: Date.now() });
      } else if (message.type === 'BEAM_INK_UPDATE') {
        acknowledge(message);
        const marks = mergeInk(marksRef.current, message.ink.upsert, message.ink.deleted);
        if (JSON.stringify(marks) === JSON.stringify(marksRef.current)) return;
        sharedMarks.current = marks;
        marksRef.current = marks;
        dispatch({ type: 'remote', upsert: message.ink.upsert, deleted: message.ink.deleted });
      }
    });
    send({ type: 'BEAM_INK_UPDATE', roomCode, ink: { documentId, upsert: marksRef.current }, timestamp: Date.now() });
    void beamService.broadcast({ type: 'BEAM_INK_REQUEST', roomCode, ink: { documentId }, timestamp: Date.now() });
    return unsubscribe;
  }, [ready, reader.docId, reader.beamPeerConnected, reader.beamRoom, send, acknowledge]);

  useEffect(() => {
    if (!ready) return;
    const previous = new Map(sharedMarks.current.map(mark => [mark.id, mark]));
    const current = new Set(history.present.map(mark => mark.id));
    const upsert = history.present.filter(mark => JSON.stringify(previous.get(mark.id)) !== JSON.stringify(mark));
    const deleted = [...previous.keys()].filter(id => !current.has(id));
    sharedMarks.current = history.present;
    if ((!upsert.length && !deleted.length) || !reader.beamPeerConnected || !reader.beamRoom || !reader.docId) return;
    send({ type: 'BEAM_INK_UPDATE', roomCode: reader.beamRoom, ink: { documentId: reader.docId, upsert, deleted }, timestamp: Date.now() });
  }, [history.revision, history.present, ready, reader.beamPeerConnected, reader.beamRoom, reader.docId, send]);

  useEffect(() => {
    if (!ready || !history.revision) return;
    const id = loadedId;
    let alive = true;
    setStatus('saving');
    saveQueue.current = saveQueue.current.catch(() => {}).then(() => writeInk(id, history.present));
    void saveQueue.current.then(() => { if (alive && documentRef.current === id) setStatus('saved'); })
      .catch(() => { if (alive && documentRef.current === id) { setStatus('error'); setMessage('save-error'); } });
    return () => { alive = false; };
  }, [history.revision, history.present, ready, loadedId]);

  const exportPdf = async () => {
    if (!reader.doc || exporting) return;
    setExporting(true); setMessage('');
    try {
      const { exportInkPdf } = await import('../core/annotations/inkExport');
      await exportInkPdf(reader.doc, history.present, reader.docTitle || 'Otium', page => setMessage(ar ? `تجهيز شرح الصفحة ${page}…` : `Preparing page ${page}…`), reader.annotations);
      setMessage(ar ? 'تم تجهيز نسخة PDF المشروحة' : 'Annotated PDF ready');
    } catch (error) { setMessage(error instanceof Error ? error.message : (ar ? 'تعذر التصدير' : 'Export failed')); }
    finally { setExporting(false); }
  };
  const documentStatus = status === 'error' || reader.annotationSaveStatus === 'error' ? 'error' : status === 'saving' || reader.annotationSaveStatus === 'saving' ? 'saving' : status;
  return <InkContext.Provider value={{ ready, tool: teaching.target === 'document' && !teaching.presentation ? tool : 'hand', color, size, stylus, marks: ready ? history.present : [], change, publishSelection }}>
    {children}
    {/* Phone keeps its document annotation dock (including text selection),
        while the desktop dock appears only in the board workspace. */}
    {(teaching.mobile || teaching.layout !== 'document') && <TeacherDock reader={reader} ink={{ ready, tool, setTool, canUndo: !!history.past.length, canRedo: !!history.future.length,
      undo: () => dispatch({ type: 'undo' }), redo: () => dispatch({ type: 'redo' }), clear: () => change([]),
      status: documentStatus, delivery, exporting, exportPdf: () => void exportPdf(),
      message: message === 'load-error' ? (ar ? 'تعذر تحميل الشرح. أعد فتح الملف قبل التعديل.' : 'Could not load annotations. Reopen before editing.')
        : message === 'save-error' ? (ar ? 'لم يُحفظ آخر تعديل. صدّر نسخة قبل الإغلاق.' : 'Save failed. Export a copy before closing.') : message }} />}
  </InkContext.Provider>;
}

export function DocumentInkLayer({ page, width, height, lang }: { page: number; width: number; height: number; lang: string }) {
  const ink = useContext(InkContext);
  const [draft, setDraft] = useState<InkMark | null>(null);
  const [note, setNote] = useState<InkMark | null>(null);
  const drawing = useRef<InkMark | null>(null);
  const gesture = useRef<number | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const lastPen = useRef(0);
  const ar = lang === 'ar';
  useEffect(() => { setNote(null); setDraft(null); drawing.current = null; gesture.current = null; }, [ink?.tool, page]);
  if (!ink) return null;
  const marks = ink.marks.filter(mark => mark.page === page);
  const point = (e: React.PointerEvent) => {
    const box = surface.current!.getBoundingClientRect();
    return clampPoint((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height);
  };
  const erase = (p: InkPoint) => {
    const hit = [...marks].reverse().find(mark => hitInk(mark, p, width, height));
    if (hit) ink.change(ink.marks.filter(mark => mark.id !== hit.id));
  };
  const finish = (e: React.PointerEvent, cancelled = false) => {
    if (gesture.current !== e.pointerId) return;
    if (drawing.current && !cancelled) ink.change([...ink.marks, drawing.current]);
    gesture.current = null; drawing.current = null; setDraft(null);
  };
  const renderMark = (mark: InkMark) => mark.type === 'note'
    ? <text key={mark.id} x={mark.points[0].x * width} y={mark.points[0].y * height} fill={mark.color} fontSize={mark.width * width}
        fontFamily="Tajawal, Arial, sans-serif" dominantBaseline="text-before-edge" direction={/[\u0600-\u06ff]/.test(mark.text || '') ? 'rtl' : 'ltr'}>
        {(mark.text || '').split('\n').map((line, i) => <tspan key={i} x={mark.points[0].x * width} dy={i ? '1.35em' : '0'}>{line}</tspan>)}
      </text>
    : mark.points.length === 1
      ? <circle key={mark.id} cx={mark.points[0].x * width} cy={mark.points[0].y * height} r={mark.width * width / 2} fill={mark.color} opacity={mark.type === 'highlighter' ? 0.3 : 1} />
      : <polyline key={mark.id} points={mark.points.map(p => `${p.x * width},${p.y * height}`).join(' ')} fill="none" stroke={mark.color} strokeWidth={mark.width * width} strokeLinecap="round" strokeLinejoin="round" opacity={mark.type === 'highlighter' ? 0.3 : 1} />;
  return <div ref={surface} className="absolute inset-0 z-[15] select-none" style={{ pointerEvents: ink.tool === 'hand' || ink.tool === 'select' || !ink.ready ? 'none' : 'auto', touchAction: ink.stylus ? 'pan-x pan-y pinch-zoom' : ink.tool === 'hand' ? 'auto' : 'none', cursor: ink.tool === 'eraser' ? 'crosshair' : ink.tool === 'note' ? 'text' : 'crosshair' }}
    onTouchStart={e => { if (e.touches.length > 1 && !ink.stylus) { drawing.current = null; gesture.current = null; setDraft(null); } if (!ink.stylus) e.stopPropagation(); }} onTouchMove={e => { if (!ink.stylus) e.stopPropagation(); }} onTouchEnd={e => { if (!ink.stylus) e.stopPropagation(); }}
    onPointerDown={e => {
      if (e.pointerType === 'pen') lastPen.current = Date.now();
      if (e.pointerType === 'touch' && (e.width > 35 || e.height > 35 || Date.now() - lastPen.current < 800)) return;
      if (!ink.ready || ink.tool === 'hand' || ink.tool === 'select' || (ink.stylus && e.pointerType !== 'pen') || e.button !== 0) return;
      if (gesture.current !== null) return;
      e.preventDefault(); e.stopPropagation();
      const p = point(e);
      if (ink.tool === 'note') {
        const existing = [...marks].reverse().find(mark => mark.type === 'note' && hitInk(mark, p, width, height));
        setNote(existing || { id: newMarkId(), page, type: 'note', color: ink.color, width: ink.size / 160, points: [p], text: '' });
        return;
      }
      gesture.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId);
      if (ink.tool === 'eraser') { erase(p); return; }
      drawing.current = { id: newMarkId(), page, type: ink.tool, color: ink.color, width: ink.size / (ink.tool === 'highlighter' ? 140 : 1000), points: [p] };
      setDraft(drawing.current);
    }}
    onPointerMove={e => {
      if (gesture.current !== e.pointerId) return;
      e.preventDefault(); e.stopPropagation();
      if (ink.tool === 'eraser') { erase(point(e)); return; }
      if (!drawing.current || drawing.current.points.length >= 5000) return;
      const p = point(e), last = drawing.current.points[drawing.current.points.length - 1];
      if (Math.hypot((p.x - last.x) * width, (p.y - last.y) * height) < 1) return;
      drawing.current = { ...drawing.current, points: [...drawing.current.points, p] }; setDraft(drawing.current);
    }} onPointerUp={e => finish(e)} onPointerCancel={e => finish(e, true)} onLostPointerCapture={e => finish(e, true)}>
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 pointer-events-none" aria-hidden="true">{marks.map(renderMark)}{draft && renderMark(draft)}</svg>
    {note && <div role="dialog" aria-label={ar ? 'ملاحظة على الصفحة' : 'Page note'} dir={ar ? 'rtl' : 'ltr'} className="absolute top-4 left-4 z-30 w-60 max-w-[90%] rounded-2xl border border-line bg-surface text-ink shadow-xl p-3 pointer-events-auto" onPointerDown={e => e.stopPropagation()} onPointerMove={e => e.stopPropagation()}>
      <textarea autoFocus aria-label={ar ? 'نص الملاحظة' : 'Note text'} value={note.text} maxLength={2000} onChange={e => setNote({ ...note, text: e.target.value })} className="w-full min-h-24 rounded-xl p-2 bg-hover text-sm resize-y" />
      <div className="flex items-center gap-2 pt-2 text-xs">
        <button className="rounded-lg bg-accent text-on-accent px-3 py-2" disabled={!note.text?.trim()} onClick={() => { ink.change([...ink.marks.filter(mark => mark.id !== note.id), { ...note, text: note.text!.trim() }]); setNote(null); }}>{ar ? 'حفظ' : 'Save'}</button>
        <button onClick={() => setNote(null)}>{ar ? 'إلغاء' : 'Cancel'}</button>
        {ink.marks.some(mark => mark.id === note.id) && <button aria-label={ar ? 'حذف الملاحظة' : 'Delete note'} className="ms-auto text-danger-ink" onClick={() => { ink.change(ink.marks.filter(mark => mark.id !== note.id)); setNote(null); }}><Trash2 size={16} /></button>}
      </div>
    </div>}
  </div>;
}
