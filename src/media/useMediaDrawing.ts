import { useEffect, useRef, useState } from 'react';
import { loadDrawing, saveDrawing } from './library';
import type { InkStroke, MediaDrawing } from './drawing';
type History = { past: InkStroke[][]; present: InkStroke[]; future: InkStroke[][] };
const empty: History = { past: [], present: [], future: [] };
export function useMediaDrawing(id: string, saved: boolean, persistent: boolean, page: number) {
  const [pages, setPages] = useState<Record<number, History>>({});
  const [status, setStatus] = useState<'loading' | 'saved' | 'saving' | 'session' | 'error'>(persistent && saved ? 'loading' : 'session');
  const [message, setMessage] = useState('');
  const [restored, setRestored] = useState(!(persistent && saved));
  const drawing = useRef<MediaDrawing>({}), history = useRef<Record<number, History>>({});
  const queue = useRef(Promise.resolve()), sequence = useRef(0), mounted = useRef(false);
  useEffect(() => {
    let cancelled = false; mounted.current = true;
    if (persistent && saved) void loadDrawing(id).then(value => {
      if (cancelled) return;
      drawing.current = value;
      const initial = Object.fromEntries(Object.entries(value).map(([key, present]) => [key, { past: [], present, future: [] }]));
      history.current = initial; setPages(initial); setRestored(true); setStatus('saved');
    }).catch(() => { if (!cancelled) { setStatus('error'); setMessage('تعذر تحميل الشرح؛ أعد فتح الملف لحماية النسخة المحفوظة.'); } });
    return () => { cancelled = true; mounted.current = false; };
  }, [id, persistent, saved]);
  const saveSnapshot = () => {
    if (!persistent || !saved) return;
    const snapshot = drawing.current, ticket = ++sequence.current;
    setStatus('saving'); setMessage('');
    queue.current = queue.current
      .then(undefined, (err: unknown) => {
        console.warn('[MediaDrawing] Previous drawing save failed:', err);
      })
      .then(() => saveDrawing(id, snapshot)).then(() => {
      if (mounted.current && ticket === sequence.current) setStatus('saved');
    }).catch(error => {
      if (mounted.current && ticket === sequence.current) { setStatus('error'); setMessage(error instanceof Error ? error.message : 'تعذر حفظ الشرح.'); }
    });
  };
  const apply = (next: History) => {
    if (!restored) return;
    history.current = { ...history.current, [page]: next }; setPages(history.current);
    drawing.current = { ...drawing.current, [page]: next.present };
    saveSnapshot();
  };
  const current = pages[page] ?? empty;
  return { strokes: current.present, status, message, ready: restored,
    change: (present: InkStroke[]) => apply({ past: [...current.past.slice(-19), current.present], present, future: [] }),
    undo: () => {
      const prevPresent = current.past.at(-1);
      if (prevPresent) apply({ past: current.past.slice(0, -1), present: prevPresent, future: [current.present, ...current.future] });
    },
    redo: () => {
      const nextPresent = current.future[0];
      if (nextPresent) apply({ past: [...current.past, current.present], present: nextPresent, future: current.future.slice(1) });
    },
    canUndo: !!current.past.length, canRedo: !!current.future.length,
    getDrawing: () => drawing.current,
    replaceDrawing: (value: MediaDrawing) => {
      if (!restored) return;
      const keys = new Set([...Object.keys(drawing.current), ...Object.keys(value)]);
      const next = Object.fromEntries([...keys].map(key => [key, { past: [drawing.current[key] ?? []], present: value[key] ?? [], future: [] }]));
      history.current = next; setPages(next); drawing.current = Object.fromEntries([...keys].map(key => [key, value[key] ?? []])); saveSnapshot();
    },
    resetSession: () => { if (!persistent) { history.current = {}; drawing.current = {}; setPages({}); } }
  };
}
