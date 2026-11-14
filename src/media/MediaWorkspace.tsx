import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Cast, FolderOpen, Palette, Maximize, EyeOff, Hand, PenLine, Highlighter, Undo2, Redo2, Trash2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Scan, Info, Download, Upload } from 'lucide-react';
import type { ReaderController } from '../app/useReaderController';
import type { ThemeMode } from '../core/types';
import { OtiumLogo } from '../components/OtiumLogo';
import { registerBackHandler } from '../core/navigation/backHandler';
import { useTeaching } from '../components/teachingContextValue';
import { APP_FILE_ACCEPT, type MediaProgress } from './library';
import type { ActiveMedia } from './useAppMedia';
import { fitSize, isBeamMediaFile } from './media';
import { openPptx, type Deck } from './pptx';
import { Pptx } from './SlideView';
import { Player } from './Player';
import { Ink } from './Ink';
import { useMediaDrawing } from './useMediaDrawing';
import { inkSvg, MAX_INK_BACKUP_BYTES, parseInkBackup, serializeInkBackup, type InkSource } from './annotationBackup';
import type { MediaDrawing } from './drawing';
import { saveTextFile } from '../platform/saveFile';
import { ConfirmDialog } from '../library/ConfirmDialog';
import { formatBytes } from '../library/model';
import { useVolumePageKeys } from '../platform/useVolumePageKeys';
import './media.css';
function placePopup(details: HTMLDetailsElement) {
  if (!details.open) return;
  const panel = details.querySelector('div'); if (!panel) return;
  const anchor = details.querySelector('summary')!.getBoundingClientRect();
  const left = Math.max(16, Math.min(anchor.left, innerWidth - panel.offsetWidth - 16));
  const top = details.classList.contains('media-export') ? Math.max(12, anchor.top - panel.offsetHeight - 10) : Math.max(12, Math.min(anchor.bottom + 10, innerHeight - panel.offsetHeight - 12));
  Object.assign(panel.style, { left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto' });
}

export function MediaWorkspace({ source, reader, onClose, onOpen, onProgress, onOpenBeam, remotePage, enableVolumePages }: {
  source: ActiveMedia; reader: ReaderController; onClose: () => void; onOpen: (file: File) => void; onProgress: (value: MediaProgress) => void;
  onOpenBeam?: () => void;
  remotePage?: { page: number } | null;
  enableVolumePages?: boolean;
}) {
  const ar = reader.lang === 'ar', label = (a: string, e: string) => ar ? a : e;
  const { setLayout } = useTeaching();
  const stage = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const workspace = useRef<HTMLElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(''), [text, setText] = useState(''), [deck, setDeck] = useState<Deck | null>(null);
  const [error, setError] = useState(''), [draw, setDraw] = useState(false), [hidden, setHidden] = useState(false);
  const [page, setPage] = useState(Math.max(1, source.item.lastPage)), [color, setColor] = useState('#e11d48');
  const [highlighter, setHighlighter] = useState(false), [penSize, setPenSize] = useState(3);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1), [feedback, setFeedback] = useState('');
  const [restoring, setRestoring] = useState<MediaDrawing | null>(null), [exporting, setExporting] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 1600, height: 900 }), [space, setSpace] = useState({ width: 800, height: 450 });
  const position = useRef(source.item.position);
  const kind = source.item.mediaKind;
  const persistentInk = kind === 'presentation' || kind === 'image';
  const ink = useMediaDrawing(source.item.id, source.saved, persistentInk, page);
  const total = deck?.slides.length ?? 1;
  useVolumePageKeys(Boolean(enableVolumePages && deck && total > 1 && !restoring), direction => {
    setPage(value => Math.max(1, Math.min(total, value + (direction === 'next' ? 1 : -1))));
  });
  const changeZoom = (value: number) => {
    const viewport = stage.current, surface = viewport?.querySelector('.media-surface');
    if (!viewport || !surface) { setZoom(value); return; }
    const bounds = viewport.getBoundingClientRect(), original = surface.getBoundingClientRect();
    const center = { x: bounds.left + viewport.clientWidth / 2, y: bounds.top + viewport.clientHeight / 2 };
    const anchor = { x: (center.x - original.left) / original.width, y: (center.y - original.top) / original.height };
    setZoom(value);
    requestAnimationFrame(() => {
      if (stage.current !== viewport) return;
      const resized = surface.getBoundingClientRect();
      viewport.scrollLeft += resized.left + resized.width * anchor.x - center.x;
      viewport.scrollTop += resized.top + resized.height * anchor.y - center.y;
    });
  };
  const backupSource: InkSource = { name: source.file.name, size: source.file.size, kind: kind === 'presentation' ? 'presentation' : 'image' };
  const saveCopy = async (svg = false) => {
    setExporting(true); setFeedback('');
    try {
      const drawing = ink.getDrawing();
      const content = svg ? inkSvg(drawing, page, dimensions.width, dimensions.height) : serializeInkBackup(backupSource, drawing);
      const outcome = await saveTextFile(`${source.file.name.replace(/\.[^.]+$/, '')}${svg ? `-ink-${page}.svg` : '.otium-ink.json'}`, content, svg ? 'image/svg+xml' : 'application/json');
      if (outcome === 'unavailable') throw new Error(label('تعذر حفظ النسخة. حاول مجدداً.', 'Could not save the copy. Try again.'));
      setFeedback(outcome === 'native-picker' ? label('اختر مكان الحفظ في نافذة النظام.', 'Choose a destination in the system dialog.') : label('بدأ تنزيل نسخة الشرح.', 'Your ink copy is downloading.'));
    } catch (cause) { setFeedback(cause instanceof Error ? cause.message : label('تعذر التصدير.', 'Export failed.')); }
    finally { setExporting(false); }
  };
  const themes: ThemeMode[] = ['paper', 'amber', 'amoled', 'eink', 'midnight', 'pure', 'parchment', 'sakura', 'forest', 'nordic'];
  useEffect(() => { workspace.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const outside = (event: globalThis.PointerEvent) => { document.querySelectorAll<HTMLDetailsElement>('.otium-media-viewer details[open]').forEach(details => { if (!details.contains(event.target as Node)) details.open = false; }); };
    const resize = () => document.querySelectorAll<HTMLDetailsElement>('.otium-media-viewer details[open]').forEach(placePopup);
    document.addEventListener('pointerdown', outside); window.addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', resize); };
  }, []);
  useEffect(() => { if (!feedback) return; const timer = window.setTimeout(() => setFeedback(''), 8000); return () => window.clearTimeout(timer); }, [feedback]);
  useEffect(() => {
    setLayout('document');
    const controller = new AbortController();
    let objectUrl = '';
    void (async () => {
      try {
        if (kind === 'presentation') {
          const value = source.deck ?? await openPptx(await source.file.arrayBuffer(), controller.signal);
          if (!controller.signal.aborted) { setDeck(value); setDimensions({ width: value.width, height: value.height }); setPage(valuePage => Math.min(valuePage, value.slides.length)); setLoading(false); }
        } else if (kind === 'text') {
          const value = await source.file.text(); if (!controller.signal.aborted) { setText(value); setLoading(false); }
        } else { objectUrl = URL.createObjectURL(source.file); setUrl(objectUrl); if (kind !== 'image') setLoading(false); }
      } catch (cause) { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : 'تعذر فتح الملف.'); setLoading(false); } }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [source, kind, setLayout]);
  const [appliedRemotePage, setAppliedRemotePage] = useState<typeof remotePage>(null);
  if (deck && remotePage && remotePage !== appliedRemotePage) {
    setAppliedRemotePage(remotePage);
    setPage(Math.max(1, Math.min(total, remotePage.page)));
  }
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(entries => {
      const firstEntry = entries[0];
      if (!firstEntry) return;
      const { width, height } = firstEntry.contentRect;
      setSpace({ width, height });
    });
    observer.observe(stage.current); return () => observer.disconnect();
  }, []);
  useEffect(() => { if (kind !== 'presentation' || deck) onProgress({ lastPage: page, totalPages: total, position: position.current }); }, [page, total, kind, deck, onProgress]);
  const backState = useRef({ hidden, onClose });
  useEffect(() => { backState.current = { hidden, onClose }; });
  useEffect(() => registerBackHandler(() => {
    const popup = workspace.current?.querySelector<HTMLDetailsElement>('details[open]');
    if (popup) popup.open = false;
    else if (backState.current.hidden) setHidden(false);
    else backState.current.onClose();
    return true;
  }), []);
  const size = fitSize(space, dimensions);
  return <section ref={workspace} className={`otium-media-viewer ${hidden ? 'media-focused' : ''}`} dir={ar ? 'rtl' : 'ltr'} aria-label={label('عارض الملفات', 'File viewer')}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.currentTarget.querySelectorAll('details[open]').forEach(details => details.removeAttribute('open')); }
      if (!deck || event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement).closest('input,select,textarea,dialog,details,[contenteditable=true]')) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); setPage(value => Math.min(total, value + 1)); }
      else if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); setPage(value => Math.max(1, value - 1)); }
      else if (event.key === 'Home') { event.preventDefault(); setPage(1); }
      else if (event.key === 'End') { event.preventDefault(); setPage(total); }
    }} tabIndex={0}>
    {!hidden && <header className="chrome-surface flex items-center gap-2 px-3 py-2 border-b border-line">
      <button type="button" className="toolbar-icon flex gap-1 min-h-11 px-2" onClick={onClose}><ArrowLeft size={18} /><span>{label('المكتبة', 'Library')}</span></button>
      <OtiumLogo size={22} theme={reader.theme} />
      <strong className="flex-1 min-w-0 truncate text-xs sm:text-sm" dir="auto">{source.item.name}</strong>
      {onOpenBeam && isBeamMediaFile(source.file.name) && (
        <button type="button" className="toolbar-icon min-h-11 min-w-11" onClick={onOpenBeam} aria-label={label('بث الملف إلى الشاشة', 'Beam file to screen')}>
          <Cast size={19} />
        </button>
      )}
      <span className="text-[10px] text-accent">{label('تجريبي', 'Preview')}</span>
      <details className="media-popup media-info" onToggle={event => placePopup(event.currentTarget)}><summary tabIndex={0} role="button" aria-label={label('تفاصيل الملف', 'File details')}><Info size={19} /></summary><div>
        <strong dir="auto">{source.file.name}</strong><span>{formatBytes(source.file.size)} · {source.saved ? label('محفوظ في المكتبة', 'Saved in library') : label('غير محفوظ في المكتبة', 'Not stored in library')}</span>
        <p>{label('عرض محلي. بث هذه الصيغة إلى شاشة أخرى لم يُضف بعد.', 'Local playback. Beaming this format to another display is not available yet.')}</p>
        {kind === 'presentation' && <p>{label('عرض الشرائح ثابت وتقريبي؛ قد تختلف التنسيقات المعقدة.', 'Slides are static previews; complex formatting may differ.')}</p>}
        {!persistentInk && kind !== 'text' && <p>{label('شرح المقطع مؤقت ويُمسح عند استئناف التصفح.', 'Video ink is temporary and clears when returning to navigation.')}</p>}
      </div></details>
      <button type="button" className="toolbar-icon min-h-11 min-w-11" aria-label={label('فتح ملف', 'Open file')} onClick={() => input.current?.click()}><FolderOpen size={19} /></button>
      <button type="button" className="toolbar-icon min-h-11 min-w-11" aria-label={label('تغيير الثيم', 'Change theme')} onClick={() => {
        const nextTheme = themes[(themes.indexOf(reader.theme) + 1) % themes.length];
        if (nextTheme) reader.changeTheme(nextTheme);
      }}><Palette size={19} /></button>
      <button type="button" className="toolbar-icon min-h-11 min-w-11" aria-label={label('ملء الشاشة', 'Fullscreen')} onClick={() => void reader.handleToggleFullscreen()}><Maximize size={19} /></button>
    </header>}
    <input hidden ref={input} type="file" accept={APP_FILE_ACCEPT} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onOpen(file); }} />
    {!hidden && !source.saved && <p className="media-notice text-ink-muted" role="status">{label('هذا الملف مفتوح دون حفظ في المكتبة؛ أعد اختياره بعد الإغلاق.', 'This file is open without library storage; reselect it after closing.')}</p>}
    <input hidden ref={backupInput} type="file" accept=".json,application/json" onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
      try { if (file.size > MAX_INK_BACKUP_BYTES) throw new Error(label('نسخة الشرح أكبر من الحد المسموح (8 MB).', 'Ink backup exceeds the 8 MB limit.')); setRestoring(parseInkBackup(await file.text(), backupSource)); }
      catch (cause) { setFeedback(cause instanceof Error ? cause.message : label('تعذر قراءة النسخة.', 'Could not read the backup.')); }
    }} />
    {error && <p role="alert" className="media-notice text-danger-ink">{error}</p>}
    {ink.message && <p role="alert" className="media-notice text-danger-ink">{ink.message}</p>}
    {feedback && <p className="media-feedback" role="status">{feedback}<button aria-label={label('إغلاق التنبيه', 'Dismiss message')} onClick={() => setFeedback('')}>×</button></p>}
    <div className={`media-stage ${zoom > 1 ? 'media-zoomed' : ''}`} ref={stage}>
      {loading && <span className="media-loading" role="status">{label('جارٍ فتح الملف…', 'Opening file…')}</span>}
      {kind === 'text' ? <pre className="media-text" dir="auto">{text}</pre> : <div className="media-surface" style={{ width: size.width * zoom, height: size.height * zoom }}>
        {(kind === 'video' || kind === 'audio') && url && <Player url={url} audio={kind === 'audio'} frozen={draw} autoPlay={source.received} initialTime={source.item.position} lang={reader.lang}
          onSize={(width, height) => setDimensions(previous => previous.width === width && previous.height === height ? previous : { width, height })} onError={setError}
          onPosition={value => { position.current = value; onProgress({ lastPage: page, totalPages: total, position: value }); }} />}
        {kind === 'image' && url && <img src={url} alt={source.item.name} onLoad={event => { setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); setLoading(false); }} onError={() => { setError(label('تعذر فتح الصورة.', 'Could not decode this image.')); setLoading(false); }} />}
        {deck && <Pptx deck={deck} page={page} onError={setError} />}
        <Ink key={page} enabled={draw && ink.ready && !loading && !error} color={color} width={dimensions.width} height={dimensions.height}
          strokes={ink.strokes} onChange={ink.change} size={highlighter ? penSize * 5 : penSize} highlighter={highlighter} />
      </div>}
    </div>
    {!hidden && <footer className="media-bottom chrome-surface border-t border-line">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {kind !== 'text' && <>
          <button type="button" className="toolbar-icon min-h-11 px-3 flex items-center gap-2" aria-pressed={!draw} onClick={() => { setDraw(false); ink.resetSession(); }}><Hand size={20} />{label('تصفح', 'Navigate')}</button>
          <button type="button" className="toolbar-icon min-h-11 px-3 flex items-center gap-2" disabled={!ink.ready || loading || !!error} aria-pressed={draw && !highlighter} onClick={() => { setDraw(true); setHighlighter(false); }}><PenLine size={20} />{label('قلم', 'Pen')}</button>
          <button type="button" className="toolbar-icon min-h-11 px-3 flex items-center gap-2" disabled={!ink.ready || loading || !!error} aria-pressed={draw && highlighter} onClick={() => { setDraw(true); setHighlighter(true); }}><Highlighter size={20} />{label('تظليل', 'Highlight')}</button>
          {draw && <><input type="color" aria-label={label('لون القلم', 'Ink color')} value={color} onChange={event => setColor(event.target.value)} />
            <select className="media-size" aria-label={label('سماكة القلم', 'Pen width')} value={penSize} onChange={event => setPenSize(Number(event.target.value))}>{[2, 3, 5, 8].map(value => <option key={value} value={value}>{value}</option>)}</select>
            <button className="toolbar-icon min-h-11 min-w-11" disabled={!ink.canUndo} aria-label={label('تراجع', 'Undo')} onClick={ink.undo}><Undo2 size={19} /></button>
            <button className="toolbar-icon min-h-11 min-w-11" disabled={!ink.canRedo} aria-label={label('إعادة', 'Redo')} onClick={ink.redo}><Redo2 size={19} /></button>
            <button className="toolbar-icon min-h-11 min-w-11" disabled={!ink.strokes.length} aria-label={label('مسح شرح الصفحة', 'Clear page ink')} onClick={() => ink.change([])}><Trash2 size={19} /></button></>}
        </>}
        {persistentInk && <div className="media-tool-group"><button className="toolbar-icon" aria-label={label('تصغير', 'Zoom out')} disabled={zoom <= 1} onClick={() => changeZoom(Math.max(1, zoom - .25))}><ZoomOut size={18} /></button><button className="toolbar-icon media-fit" aria-label={label('ملاءمة الشاشة', 'Fit to screen')} onClick={() => { setZoom(1); stage.current?.scrollTo(0, 0); }}><Scan size={17} /><bdi>{Math.round(zoom * 100)}%</bdi></button><button className="toolbar-icon" aria-label={label('تكبير', 'Zoom in')} disabled={zoom >= 3} onClick={() => changeZoom(Math.min(3, zoom + .25))}><ZoomIn size={18} /></button></div>}
        {deck && <form className="media-page-control media-tool-group" dir="ltr" onSubmit={event => { event.preventDefault(); const field = event.currentTarget.elements.namedItem('slide') as HTMLInputElement; setPage(Math.max(1, Math.min(total, Math.round(Number(field.value)) || page))); field.blur(); }}><button type="button" className="toolbar-icon" aria-label={label('الشريحة السابقة', 'Previous slide')} disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={21} /></button><label><input key={page} name="slide" type="number" inputMode="numeric" min={1} max={total} defaultValue={page} aria-label={label('الانتقال إلى شريحة', 'Go to slide')} /><span>/ {total}</span></label><button type="button" className="toolbar-icon" aria-label={label('الشريحة التالية', 'Next slide')} disabled={page >= total} onClick={() => setPage(value => value + 1)}><ChevronRight size={21} /></button><button type="submit" className="media-go">{label('انتقال', 'Go')}</button></form>}
        {kind !== 'text' && <details className="media-popup media-export" onToggle={event => placePopup(event.currentTarget)}><summary tabIndex={0} role="button"><Download size={18} />{label('نسخة من الشرح', 'Ink copy')}</summary><div>
          {persistentInk && <><button disabled={!ink.ready || exporting} onClick={() => void saveCopy()}><Download size={17} />{label('تنزيل نسخة قابلة للاستعادة', 'Download restorable ink backup')}</button><button disabled={!ink.ready || loading} onClick={() => backupInput.current?.click()}><Upload size={17} />{label('استعادة نسخة الشرح', 'Restore ink backup')}</button></>}
          <button disabled={!ink.ready || exporting || !ink.strokes.length} onClick={() => void saveCopy(true)}><Download size={17} />{label('تصدير خطوط الصفحة SVG', 'Export page ink as SVG')}</button><p>{label('SVG يحتوي الخطوط بخلفية شفافة، دون صورة الملف.', 'SVG contains ink on a transparent background, without the document image.')}</p>
        </div></details>}
        <button type="button" className="toolbar-icon min-h-11 px-3 flex items-center gap-2" onClick={() => setHidden(true)}><EyeOff size={20} />{label('إخفاء', 'Hide')}</button>
      </div>
      {kind !== 'text' && <p className="media-save-status" role="status">{ink.status === 'saved' ? label('الشرح محفوظ على هذا الجهاز', 'Ink saved on this device') : ink.status === 'saving' ? label('جارٍ حفظ الشرح…', 'Saving ink…') : ink.status === 'loading' ? label('جارٍ استعادة الشرح…', 'Restoring ink…') : ink.status === 'error' ? label('الشرح غير محفوظ', 'Ink not saved') : label('شرح مؤقت للجلسة فقط', 'Ink for this session only')}{ink.strokes.length >= 200 ? label(' · وصلت إلى حد الخطوط في هذه الصفحة', ' · Page stroke limit reached') : ''}</p>}
    </footer>}
    {hidden && <button type="button" className="media-restore chrome-surface min-h-11 px-4 rounded-2xl" onClick={() => setHidden(false)}>{label('إظهار الأدوات', 'Show controls')}{deck ? ` · ${page} / ${total}` : ''}</button>}
    {restoring && <ConfirmDialog title={label('استعادة الشرح؟', 'Restore this ink?')} confirmLabel={label('استعادة', 'Restore')} cancelLabel={label('إلغاء', 'Cancel')} onClose={() => setRestoring(null)} onConfirm={() => { ink.replaceDrawing(restoring); setRestoring(null); setFeedback(label('استُعيد الشرح. يمكنك التراجع في كل صفحة.', 'Ink restored. You can undo on each page.')); }}><p>{label('سيُستبدل شرح الصور أو الشرائح الحالي بالنسخة المختارة. نزّل نسخة من شرحك الحالي أولاً إذا أردت الاحتفاظ به.', 'This replaces the current image or slide ink with the selected backup. Download a copy of your current ink first if you want to keep it.')}</p></ConfirmDialog>}
  </section>;
}
