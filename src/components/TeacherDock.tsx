import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BookOpen, Presentation, EyeOff, Hand, MousePointer2, PenLine, Highlighter, Eraser, Undo2, Redo2, MoreHorizontal, ChevronLeft, ChevronRight, X, Type, SlidersHorizontal, Download, Trash2, type LucideIcon } from 'lucide-react';
import type { ReaderController } from '../app/useReaderController';
import { useTeaching, type SaveStatus } from './TeachingContext';
import { computeOptimalPageScale } from '../core/reader/device';
import { trapModalFocus } from '../core/utils/a11y';

export type InkTool = 'hand' | 'select' | 'pen' | 'highlighter' | 'eraser' | 'note';
export interface DocumentControls {
  ready: boolean; tool: InkTool; setTool: (tool: InkTool) => void;
  canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void; clear: () => void;
  status: SaveStatus; delivery: 'local' | 'sending' | 'received' | 'waiting';
  exporting: boolean; exportPdf: () => void; message: string;
}
export function TeacherDock({ reader, ink }: { reader: ReaderController; ink: DocumentControls }) {
  const teaching = useTeaching();
  const { prefs, updatePrefs, target, board, mobile, presentation, setPresentation } = teaching;
  const ar = reader.lang === 'ar';
  const [panel, setPanel] = useState<'more' | 'settings' | 'pen' | null>(null);
  const [confirm, setConfirm] = useState(false);
  const confirmationTarget = useRef(target);
  const dialog = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLElement>(null);
  const [dockHeight, setDockHeight] = useState(110);
  const onBoard = target === 'board' && !mobile && prefs.boardEnabled;
  const broadcastActive = Boolean(reader.beamRoom && reader.beamPeerConnected);
  const compactStudy = mobile && !broadcastActive;
  const active = onBoard ? board : ink;
  const mode = onBoard ? board?.tool || 'hand' : ink.tool;
  const label = (arabic: string, english: string) => ar ? arabic : english;
  const setTool = (tool: InkTool) => {
    if (onBoard) board?.setTool(tool === 'select' || tool === 'note' ? 'hand' : tool);
    else ink.setTool(tool);
    setPanel(tool === 'pen' || tool === 'highlighter' ? 'pen' : null);
  };
  useEffect(() => { setPanel(null); setConfirm(false); }, [target, reader.docId, presentation]);
  useEffect(() => {
    if (!confirm || !dialog.current) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current.querySelector<HTMLButtonElement>('button')?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirm(false);
      else if (dialog.current) trapModalFocus(dialog.current, event);
    };
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); previous?.focus(); };
  }, [confirm]);
  useEffect(() => {
    const element = dock.current;
    if (!element) return;
    const resize = () => setDockHeight(element.getBoundingClientRect().height);
    resize();
    const observer = new ResizeObserver(resize); observer.observe(element);
    return () => observer.disconnect();
  }, [reader.doc, presentation]);
  useEffect(() => {
    document.documentElement.style.setProperty('--teacher-bottom-inset', `${dockHeight + (mobile ? 8 : prefs.offset) + 18}px`);
    return () => { document.documentElement.style.removeProperty('--teacher-bottom-inset'); };
  }, [dockHeight, prefs.offset, mobile]);
  useEffect(() => {
    if (!panel) return;
    const close = (e: PointerEvent) => { if (!dock.current?.contains(e.target as Node)) setPanel(null); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanel(null); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); };
  }, [panel]);
  if (!reader.doc) return null;
  const saved = active?.status || 'loading';
  const saveLabel = saved === 'saved' ? label('محفوظ على هذا الجهاز', 'Saved on this device') : saved === 'saving' ? label('جارٍ الحفظ…', 'Saving…') : saved === 'error' ? label('تعذر الحفظ — صدّر نسخة', 'Save failed — export a copy') : label('تحميل الشرح…', 'Loading annotations…');
  const deliveryLabel = !onBoard && reader.beamRoom ? ink.delivery === 'received' ? label('وصل الشرح للجهاز الآخر', 'Annotations received') : ink.delivery === 'sending' ? label('جارٍ إرسال الشرح…', 'Sending annotations…') : label('بانتظار الاتصال أو تأكيد الوصول', 'Waiting for connection or receipt') : '';
  const page = onBoard ? board?.page || 1 : reader.currentPage;
  const pages = onBoard ? board?.pages || 1 : reader.numPages;
  const tools: [InkTool, LucideIcon, string][] = [ ['hand', Hand, label('تصفح', 'Navigate')], ...(!onBoard ? [['select', MousePointer2, label('تحديد', 'Select')] as [InkTool, LucideIcon, string]] : []), ['pen', PenLine, label('قلم', 'Pen')], ['highlighter', Highlighter, label('تظليل', 'Highlight')], ['eraser', Eraser, label('ممحاة', 'Eraser')] ];
  const fit = () => {
    teaching.setReachMode(false);
    const container = reader.scrollContainerRef.current;
    if (container) {
      reader.setZoom(computeOptimalPageScale(reader.basePageSize.width, reader.basePageSize.height, container.clientWidth, container.clientHeight, reader.viewMode));
      requestAnimationFrame(() => reader.scrollToPage(reader.currentPage));
    }
    setPanel(null);
  };
  const message = onBoard ? board?.error : ink.message;
  return <>
    <aside ref={dock} dir={ar ? 'rtl' : 'ltr'} aria-label={label('أدوات المعلّم', 'Teacher controls')} className={`teacher-dock theme-${reader.theme} ${mobile ? 'teacher-mobile' : ''} ${presentation ? 'teacher-presenting' : ''}`}
      data-position={prefs.position} style={{ '--teacher-size': `${prefs.size}px`, '--teacher-offset': `${mobile ? 8 : prefs.offset}px` } as CSSProperties}>
      {!presentation && !compactStudy && <div className="teacher-context-line"><strong>{onBoard ? label('تكتب على السبورة', 'Writing on whiteboard') : label('تكتب على الملف', 'Writing on document')}</strong><span role="status" aria-live="polite" className={saved === 'error' ? 'text-danger-ink' : ''}>{active?.exporting ? label('جارٍ التصدير…', 'Exporting…') : saveLabel}{deliveryLabel && ` · ${deliveryLabel}`}</span></div>}
      {!presentation && panel && <div className="teacher-popover" aria-label={panel === 'settings' ? label('تخصيص أدوات المعلم', 'Customize teacher controls') : label('خيارات الأدوات', 'Tool options')}>
        <div className="teacher-popover-heading"><strong>{panel === 'pen' ? label('إعدادات القلم', 'Pen settings') : panel === 'settings' ? label('راحة المعلّم', 'Teacher comfort') : label('المزيد', 'More')}</strong><button type="button" aria-label={label('إغلاق الخيارات', 'Close options')} onClick={() => setPanel(null)}><X size={18} /></button></div>
        {panel === 'pen' && <div className="teacher-pen-options">
          <div className="teacher-palette" aria-label={label('ألوان سريعة', 'Quick colors')}>{[['#e11d48', label('أحمر', 'Red')], ['#2563eb', label('أزرق', 'Blue')], ['#059669', label('أخضر', 'Green')], [onBoard && board?.background === 'dark' ? '#f8fafc' : '#111827', label('حبر أساسي', 'Basic ink')]].map(([color, name]) => <button type="button" key={color} aria-label={name} style={{ backgroundColor: color }} onClick={() => { updatePrefs({ color }); if (onBoard) board?.setColor(color); }} />)}</div>
          <label>{label('اللون', 'Color')}<input type="color" value={onBoard ? board?.color || prefs.color : prefs.color} onChange={e => { updatePrefs({ color: e.target.value }); if (onBoard) board?.setColor(e.target.value); }} /></label>
          <label>{label('السُمك', 'Width')} <output>{onBoard ? board?.width : prefs.width}</output><input type="range" min="2" max="12" step="1" value={onBoard ? board?.width || prefs.width : prefs.width} onChange={e => { updatePrefs({ width: +e.target.value }); if (onBoard) board?.setWidth(+e.target.value); }} /></label>
          <label className="teacher-check"><input type="checkbox" checked={prefs.stylusOnly} onChange={e => updatePrefs({ stylusOnly: e.target.checked })} />{onBoard ? label('الكتابة بالقلم الإلكتروني فقط', 'Stylus-only writing') : label('القلم الإلكتروني للكتابة، والإصبع للتنقل', 'Write with stylus, navigate with finger')}</label>
        </div>}
        {panel === 'settings' && <div className="teacher-settings">
          <label>{label('مكان الشريط', 'Dock position')}<select value={prefs.position} onChange={e => updatePrefs({ position: e.target.value as typeof prefs.position })}><option value="right">{label('يمين', 'Right')}</option><option value="center">{label('وسط', 'Center')}</option><option value="left">{label('يسار', 'Left')}</option></select></label>
          <label>{label('حجم الأزرار', 'Button size')} <output>{prefs.size}</output><input type="range" min="44" max="64" step="2" value={prefs.size} onChange={e => updatePrefs({ size: +e.target.value })} /></label>
          {!mobile && <label>{label('ارتفاع الشريط', 'Dock height')} <output>{prefs.offset}</output><input type="range" min="8" max="120" step="4" value={prefs.offset} onChange={e => updatePrefs({ offset: +e.target.value })} /></label>}
          {!mobile && <label className="teacher-check"><input type="checkbox" checked={prefs.boardEnabled} onChange={e => { updatePrefs({ boardEnabled: e.target.checked }); if (!e.target.checked) teaching.setLayout('document'); }} />{label('تفعيل السبورة الذكية على هذا الجهاز', 'Enable whiteboard on this device')}</label>}
          <label className="teacher-check"><input type="checkbox" checked={prefs.stylusOnly} onChange={e => updatePrefs({ stylusOnly: e.target.checked })} />{label('الكتابة بالقلم الإلكتروني فقط', 'Stylus-only writing')}</label>
        </div>}
        {panel === 'more' && <div className="teacher-menu">
          {compactStudy && <button type="button" disabled={!active?.canRedo || active.exporting} onClick={() => active?.redo()}><Redo2 size={18} />{label('إعادة', 'Redo')}</button>}
          {!onBoard && <button type="button" onClick={() => setTool('note')}><Type size={18} />{label('ملاحظة على الملف', 'Document note')}</button>}
          <button type="button" disabled={!active?.ready || active.exporting} onClick={() => active?.exportPdf()}><Download size={18} />{onBoard ? label('تصدير السبورة PDF', 'Export whiteboard PDF') : label('تصدير الملف مع الشرح', 'Export annotated document')}</button>
          {onBoard && <><button type="button" onClick={() => board?.exportPng()}>{label('تصدير الصفحة كصورة', 'Export page image')}</button><button type="button" disabled={(board?.pages || 0) >= 10} onClick={() => board?.addPage()}>{label('صفحة سبورة جديدة', 'New whiteboard page')}</button><button type="button" onClick={() => { teaching.setLayout('split'); board?.clip(); setPanel(null); }}>{label('قصّ جزء من الكتاب', 'Clip from document')}</button><label>{label('خلفية السبورة', 'Board background')}<select value={board?.background} onChange={e => board?.setBackground(e.target.value as 'white' | 'grid' | 'ruled' | 'dark')}><option value="white">{label('بيضاء', 'White')}</option><option value="grid">{label('مربعات', 'Grid')}</option><option value="ruled">{label('مسطّرة', 'Ruled')}</option><option value="dark">{label('داكنة', 'Dark')}</option></select></label></>}
          {!mobile && <button type="button" onClick={() => { teaching.setLayout('split'); setPanel(null); }}>{label('فتح الكتاب بجانب السبورة', 'Open document beside board')}</button>}
          <button type="button" onClick={() => setPanel('settings')}><SlidersHorizontal size={18} />{label('تخصيص الشريط واللمس', 'Customize dock and touch')}</button>
          {!onBoard && <><button type="button" onClick={fit}>{label('ملاءمة الصفحة وإعادة التموضع', 'Fit and reposition page')}</button><button type="button" onClick={() => { teaching.setReachMode(!teaching.reachMode); const el = reader.scrollContainerRef.current; el?.scrollBy({ top: -(el.clientHeight / 3), behavior: 'auto' }); setPanel(null); }}>{teaching.reachMode ? label('إرجاع ارتفاع الصفحة', 'Restore page height') : label('إنزال المحتوى نحو اليد', 'Bring content down')}</button></>}
          <button type="button" onClick={() => { teaching.setReaderTools(!teaching.readerTools); setPanel(null); }}>{teaching.readerTools ? label('إخفاء أدوات القراءة الإضافية', 'Hide extra reader controls') : label('أدوات القراءة والربط', 'Reader and connection controls')}</button>
          <button type="button" onClick={() => { teaching.setReaderTools(false); setPresentation(true); }}><Presentation size={18} />{label('عرض للطلاب', 'Present to students')}</button>
          <button type="button" onClick={() => { void reader.handleToggleFullscreen(); setPanel(null); }}>{reader.isFullscreen ? label('خروج من ملء الشاشة', 'Exit fullscreen') : label('ملء الشاشة', 'Fullscreen')}</button>
          <button type="button" onClick={() => { setPanel(null); reader.setIsSettingsOpen(true); }}>{label('إعدادات التطبيق', 'App settings')}</button>
          <button type="button" className="text-danger-ink" disabled={!active?.ready || active.exporting} onClick={() => { confirmationTarget.current = target; setConfirm(true); setPanel(null); }}>{onBoard ? label('مسح شرح صفحة السبورة', 'Clear this board page') : label('مسح الكتابة عن الملف', 'Clear document ink')}</button>
          <button type="button" onClick={() => { setPanel(null); reader.closeDocument(); }}>{label('العودة للمكتبة', 'Back to library')}</button>
        </div>}
      </div>}
      <div className="teacher-main-row" role="toolbar" aria-label={label('الكتابة والتنقل', 'Writing and navigation')}>
        {!mobile && prefs.boardEnabled && <button type="button" className="teacher-workspace-toggle" onClick={() => { if (onBoard) { teaching.setReaderTools(true); teaching.setLayout('document'); } else { teaching.setLayout('board'); } }} aria-label={onBoard ? label('إظهار الكتاب', 'Show document') : label('إظهار السبورة', 'Show whiteboard')}>{onBoard ? <BookOpen size={21} /> : <Presentation size={21} />}<span>{onBoard ? label('الكتاب', 'Document') : label('السبورة', 'Whiteboard')}</span></button>}
        {!presentation && <><div className="teacher-tool-group">{tools.map(([id, Icon, text]) => <button type="button" key={id} aria-label={text} aria-pressed={mode === id} disabled={!active?.ready || active.exporting} onClick={() => setTool(id as InkTool)}><Icon size={21} /><span>{text}</span></button>)}</div>
          {compactStudy ? <div className="teacher-history"><button type="button" disabled={!active?.canUndo || active.exporting} aria-label={label('تراجع', 'Undo')} onClick={() => active?.undo()}><Undo2 size={21} /><span>{label('تراجع', 'Undo')}</span></button></div> : <><div className="teacher-history"><button type="button" disabled={!active?.canUndo || active.exporting} aria-label={label('تراجع', 'Undo')} onClick={() => active?.undo()}><Undo2 size={21} /><span>{label('تراجع', 'Undo')}</span></button><button type="button" disabled={!active?.canRedo || active.exporting} aria-label={label('إعادة', 'Redo')} onClick={() => active?.redo()}><Redo2 size={21} /><span>{label('إعادة', 'Redo')}</span></button></div>
          <button type="button" disabled={!active?.ready || active.exporting} aria-label={label('تصدير', 'Export')} onClick={() => active?.exportPdf()}><Download size={21} /><span>{label('تصدير', 'Export')}</span></button>
          <button type="button" disabled={!active?.ready || active.exporting} aria-label={label('فتح تأكيد المسح', 'Open clear confirmation')} onClick={() => { confirmationTarget.current = target; setConfirm(true); }}><Trash2 size={21} /><span>{label('مسح', 'Clear')}</span></button></>}</>}
        {!presentation && !compactStudy && <div className="teacher-page-navigation" dir={reader.docIsRtl ? 'rtl' : 'ltr'}><button type="button" disabled={page <= 1} aria-label={label('الصفحة السابقة', 'Previous page')} onClick={() => onBoard ? board?.goToPage(page - 1) : reader.goToPrevPage()}>{reader.docIsRtl ? <ChevronRight size={22} /> : <ChevronLeft size={22} />}</button><span dir="ltr">{page} / {pages}</span><button type="button" disabled={page >= pages} aria-label={label('الصفحة التالية', 'Next page')} onClick={() => onBoard ? board?.goToPage(page + 1) : reader.goToNextPage()}>{reader.docIsRtl ? <ChevronLeft size={22} /> : <ChevronRight size={22} />}</button></div>}
        {presentation ? <button type="button" onClick={() => { setPresentation(false); teaching.setReaderTools(true); }}><PenLine size={21} /><span>{label('إرجاع الأدوات', 'Show tools')}</span></button> : <><button type="button" aria-label={label('إخفاء كل الأدوات', 'Hide all controls')} onClick={() => { setPanel(null); teaching.setReaderTools(false); setPresentation(true); }}><EyeOff size={21} /><span>{label('إخفاء', 'Hide')}</span></button><button type="button" aria-expanded={panel === 'more'} onClick={() => setPanel(panel === 'more' ? null : 'more')}><MoreHorizontal size={23} /><span>{label('المزيد', 'More')}</span></button></>}
      </div>
      {!presentation && message && <p role="status" className="teacher-message">{message}</p>}
    </aside>
    {confirm && <div className={`fixed inset-0 z-[100] bg-scrim flex items-end sm:items-center justify-center p-5 theme-${reader.theme}`} onPointerDown={e => { if (e.target === e.currentTarget) setConfirm(false); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="teacher-clear-title" dir={ar ? 'rtl' : 'ltr'} className="bg-surface text-ink border border-line rounded-2xl p-6 max-w-md w-full shadow-xl">
        <h2 id="teacher-clear-title" className="font-bold mb-3">{onBoard ? label('مسح شرح هذه الصفحة؟', 'Clear this board page?') : label('مسح الكتابة عن جميع صفحات الملف؟', 'Clear ink on all document pages?')}</h2>
        <p className="text-sm text-ink-muted mb-5">{label('يمكن استرجاع الكتابة بزر التراجع. محتوى الملف الأصلي يبقى محفوظاً.', 'Undo restores the ink. The original document is preserved.')}</p>
        <div className="flex gap-3"><button type="button" className="min-h-12 px-5 rounded-xl bg-hover" onClick={() => setConfirm(false)}>{label('إلغاء', 'Cancel')}</button><button type="button" className="min-h-12 px-5 rounded-xl bg-danger-ink text-white" onClick={() => { if (confirmationTarget.current === target) active?.clear(); setConfirm(false); }}>{label('مسح الشرح', 'Clear ink')}</button></div>
      </div>
    </div>}
  </>;
}
