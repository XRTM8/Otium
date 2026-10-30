import React, { createContext, useContext, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { Download, Eraser, Hand, Highlighter, PenLine, Redo2, Undo2, Type, X, Trash2 } from 'lucide-react';
import type { ReaderController } from '../app/useReaderController';
import { clampPoint, EMPTY_INK, hitInk, inkHistory, mergeInk, readInk, writeInk, type InkMark, type InkPoint } from '../core/annotations/ink';
import { beamService } from '../board/beam/beamService';

type InkTool = 'hand' | 'pen' | 'highlighter' | 'eraser' | 'note';
interface InkContextValue {
  ready: boolean; tool: InkTool; color: string; size: number; stylus: boolean;
  marks: InkMark[]; change: (marks: InkMark[]) => void;
}
const InkContext = createContext<InkContextValue | null>(null);
const newMarkId = () => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID() : `ink-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function DocumentInkProvider({ reader, children }: { reader: ReaderController; children: React.ReactNode }) {
  const [history, dispatch] = useReducer(inkHistory, EMPTY_INK);
  const [loadedId, setLoadedId] = useState('');
  const [tool, setTool] = useState<InkTool>('hand');
  const [color, setColor] = useState('#e11d48');
  const [size, setSize] = useState(4);
  const [stylus, setStylus] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<'loading' | 'saved' | 'saving' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [exporting, setExporting] = useState(false);
  const saveQueue = useRef(Promise.resolve());
  const documentRef = useRef(reader.docId);
  const marksRef = useRef(history.present);
  const sharedMarks = useRef<InkMark[]>([]);
  useLayoutEffect(() => { documentRef.current = reader.docId; marksRef.current = history.present; }, [reader.docId, history.present]);
  const ready = !!reader.doc && loadedId === reader.docId;
  const ar = reader.lang === 'ar';
  const change = (marks: InkMark[]) => dispatch({ type: 'change', marks });

  useEffect(() => {
    if (!expanded || !ready) return;
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
  }, [expanded, ready]);

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

  useEffect(() => {
    if (!ready || !reader.docId || !reader.beamPeerConnected || !reader.beamRoom) return;
    const roomCode = reader.beamRoom, documentId = reader.docId;
    const unsubscribe = beamService.subscribe(message => {
      if (!message.ink || message.ink.documentId !== documentId) return;
      if (message.type === 'BEAM_INK_REQUEST') {
        void beamService.broadcast({ type: 'BEAM_INK_UPDATE', roomCode, ink: { documentId, upsert: marksRef.current }, timestamp: Date.now() });
      } else if (message.type === 'BEAM_INK_UPDATE') {
        const marks = mergeInk(marksRef.current, message.ink.upsert, message.ink.deleted);
        if (JSON.stringify(marks) === JSON.stringify(marksRef.current)) return;
        sharedMarks.current = marks;
        marksRef.current = marks;
        dispatch({ type: 'remote', upsert: message.ink.upsert, deleted: message.ink.deleted });
      }
    });
    void beamService.broadcast({ type: 'BEAM_INK_UPDATE', roomCode, ink: { documentId, upsert: marksRef.current }, timestamp: Date.now() });
    void beamService.broadcast({ type: 'BEAM_INK_REQUEST', roomCode, ink: { documentId }, timestamp: Date.now() });
    return unsubscribe;
  }, [ready, reader.docId, reader.beamPeerConnected, reader.beamRoom]);

  useEffect(() => {
    if (!ready) return;
    const previous = new Map(sharedMarks.current.map(mark => [mark.id, mark]));
    const current = new Set(history.present.map(mark => mark.id));
    const upsert = history.present.filter(mark => JSON.stringify(previous.get(mark.id)) !== JSON.stringify(mark));
    const deleted = [...previous.keys()].filter(id => !current.has(id));
    sharedMarks.current = history.present;
    if ((!upsert.length && !deleted.length) || !reader.beamPeerConnected || !reader.beamRoom || !reader.docId) return;
    void beamService.broadcast({ type: 'BEAM_INK_UPDATE', roomCode: reader.beamRoom, ink: { documentId: reader.docId, upsert, deleted }, timestamp: Date.now() });
  }, [history.revision, history.present, ready, reader.beamPeerConnected, reader.beamRoom, reader.docId]);

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
      await exportInkPdf(reader.doc, history.present, reader.docTitle || 'Otium', page => setMessage(ar ? `تجهيز شرح الصفحة ${page}…` : `Preparing page ${page}…`));
      setMessage(ar ? 'تم تجهيز نسخة PDF المشروحة' : 'Annotated PDF ready');
    } catch (error) { setMessage(error instanceof Error ? error.message : (ar ? 'تعذر التصدير' : 'Export failed')); }
    finally { setExporting(false); }
  };
  const tools = [
    ['hand', Hand, ar ? 'تصفح وتحريك' : 'Navigate'],
    ['pen', PenLine, ar ? 'قلم' : 'Pen'],
    ['highlighter', Highlighter, ar ? 'تظليل' : 'Highlight'],
    ['note', Type, ar ? 'ملاحظة نصية' : 'Text note'],
    ['eraser', Eraser, ar ? 'ممحاة الشرح' : 'Erase annotation']
  ] as const;
  const buttonClass = 'p-2 rounded-xl transition-colors hover:bg-hover disabled:opacity-30 disabled:pointer-events-none';
  return <InkContext.Provider value={{ ready, tool: expanded ? tool : 'hand', color, size, stylus, marks: ready ? history.present : [], change }}>
    {children}
    {reader.doc && <aside dir={ar ? 'rtl' : 'ltr'} aria-label={ar ? 'أدوات الشرح على PDF' : 'PDF annotation tools'}
      className={`fixed start-3 bottom-24 sm:bottom-auto sm:top-24 z-40 max-w-[calc(100vw-24px)] rounded-2xl border border-line bg-surface/95 text-ink shadow-xl backdrop-blur-md p-2 theme-${reader.theme}`}>
      {!expanded ? <button className="flex items-center gap-2 px-3 py-2 text-xs font-bold" onClick={() => { setExpanded(true); setTool('pen'); }}><PenLine size={16} />{ar ? 'الكتابة على الملف' : 'Annotate PDF'}</button> : <>
        <div className="flex items-center gap-1 flex-wrap">
          {tools.map(([id, Icon, label]) => <button key={id} title={label} aria-label={label} aria-pressed={tool === id} disabled={!ready || exporting}
            className={`${buttonClass} ${tool === id ? 'bg-accent text-on-accent' : ''}`} onClick={() => setTool(id)}><Icon size={18} /></button>)}
          <span className="h-6 border-s border-line mx-1" />
          <button className={buttonClass} disabled={!history.past.length || !ready || exporting} aria-label={ar ? 'تراجع' : 'Undo'} title={ar ? 'تراجع' : 'Undo'} onClick={() => dispatch({ type: 'undo' })}><Undo2 size={17} /></button>
          <button className={buttonClass} disabled={!history.future.length || !ready || exporting} aria-label={ar ? 'إعادة' : 'Redo'} title={ar ? 'إعادة' : 'Redo'} onClick={() => dispatch({ type: 'redo' })}><Redo2 size={17} /></button>
          <button className={`${buttonClass} text-accent`} disabled={!ready || exporting || !history.present.length} onClick={() => void exportPdf()} title={ar ? 'تصدير نسخة PDF بالشرح' : 'Export annotated PDF'} aria-label={ar ? 'تصدير نسخة PDF بالشرح' : 'Export annotated PDF'}><Download size={18} /></button>
          <button className={buttonClass} aria-label={ar ? 'إغلاق أدوات الشرح' : 'Close annotation tools'} onClick={() => { setExpanded(false); setTool('hand'); }}><X size={17} /></button>
        </div>
        <div className="flex items-center gap-2 pt-2 border-t border-line mt-1 flex-wrap">
          <label className="text-[10px] flex items-center gap-1">{ar ? 'اللون' : 'Color'}<input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-7 h-7 bg-transparent" aria-label={ar ? 'لون الشرح' : 'Annotation color'} /></label>
          <label className="text-[10px] flex items-center gap-1">{ar ? 'الحجم' : 'Size'}<input type="range" min="2" max="12" value={size} onChange={e => setSize(Number(e.target.value))} className="w-20" aria-label={ar ? 'حجم القلم' : 'Pen size'} /></label>
          <label className="text-[10px] flex items-center gap-1"><input type="checkbox" checked={stylus} onChange={e => setStylus(e.target.checked)} />{ar ? 'قلم إلكتروني فقط' : 'Stylus only'}</label>
          <span role="status" className={`text-[10px] ${status === 'error' ? 'text-danger-ink' : 'text-ink-muted'}`}>
            {exporting ? (ar ? 'جارٍ التصدير…' : 'Exporting…') : status === 'saved' ? (ar ? 'محفوظ على هذا الجهاز' : 'Saved on this device') : status === 'saving' ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : status === 'loading' ? (ar ? 'تحميل الشرح…' : 'Loading…') : (ar ? 'تعذر الحفظ' : 'Save failed')}
          </span>
        </div>
        {message && <p role="status" className="text-[11px] max-w-sm pt-2">{message === 'load-error'
          ? (ar ? 'تعذر تحميل الشرح المحفوظ. أعد فتح الملف قبل التعديل.' : 'Saved annotations could not be loaded. Reopen the file before editing.')
          : message === 'save-error' ? (ar ? 'لم يُحفظ آخر تعديل. صدّر نسخة قبل الإغلاق.' : 'The last edit was not saved. Export a copy before closing.') : message}</p>}
      </>}
    </aside>}
  </InkContext.Provider>;
}

export function DocumentInkLayer({ page, width, height, lang }: { page: number; width: number; height: number; lang: string }) {
  const ink = useContext(InkContext);
  const [draft, setDraft] = useState<InkMark | null>(null);
  const [note, setNote] = useState<InkMark | null>(null);
  const drawing = useRef<InkMark | null>(null);
  const gesture = useRef<number | null>(null);
  const surface = useRef<HTMLDivElement>(null);
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
  return <div ref={surface} className="absolute inset-0 z-[15]" style={{ pointerEvents: ink.tool === 'hand' || !ink.ready ? 'none' : 'auto', touchAction: ink.tool === 'hand' ? 'auto' : 'none', cursor: ink.tool === 'eraser' ? 'crosshair' : ink.tool === 'note' ? 'text' : 'crosshair' }}
    onTouchStart={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}
    onPointerDown={e => {
      if (!ink.ready || ink.tool === 'hand' || (ink.stylus && e.pointerType !== 'pen') || e.button !== 0) return;
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
