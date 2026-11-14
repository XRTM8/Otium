import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { describeFile, validateFile, fitSize, SourceLease } from '../../src/media/media';
import { openPptx } from '../../src/media/pptx';
import type { Deck } from '../../src/media/pptx';
import type { FileKind } from '../../src/media/media';
import { Ink } from '../../src/media/Ink';
import { Player } from '../../src/media/Player';
import sampleVideo from './samples/lesson.mp4?url';

type Source = { id: number; name: string; kind: FileKind; url?: string; text?: string; deck?: Deck };
const Pdf = lazy(() => import('./Pdf').then(module => ({ default: module.Pdf })));
const Pptx = lazy(() => import('../../src/media/SlideView').then(module => ({ default: module.Pptx })));

export function Lab() {
  const lease = useRef(new SourceLease());
  const loading = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [focus, setFocus] = useState(false);
  const [draw, setDraw] = useState(false);
  const [revision, setRevision] = useState(0);
  const [color, setColor] = useState('#ffcf63');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(1);
  const [dimensions, setDimensions] = useState({ width: 1600, height: 900 });
  const [space, setSpace] = useState({ width: 960, height: 540 });
  useEffect(() => () => { loading.current?.abort(); lease.current.replace(); }, []);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSpace({ width, height });
    });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  const reset = () => {
    loading.current?.abort(); loading.current = null;
    const ticket = lease.current.replace();
    setSource(null); setDraw(false); setFocus(false); setError(''); setNotice(''); setPage(1); setTotal(1);
    setDimensions({ width: 1600, height: 900 }); setBusy(false);
    return ticket;
  };
  const open = async (file?: File) => {
    if (!file) return;
    const problem = validateFile(file);
    if (problem) { setError(problem); return; }
    const ticket = reset();
    const { kind, mime } = describeFile(file.name);
    if (kind === 'office') {
      setSource({ id: ticket, name: file.name, kind });
      return;
    }
    setBusy(true);
    const controller = new AbortController(); loading.current = controller;
    try {
      if ((kind === 'video' || kind === 'audio') && !document.createElement(kind).canPlayType(mime)) {
        setNotice('المتصفح لا يعلن دعم هذه الصيغة. سنحاول فتحها، وقد تحتاج تحويلها إلى MP4 أو WebM.');
      }
      if (kind === 'presentation') {
        const buffer = await file.arrayBuffer();
        controller.signal.throwIfAborted();
        const deck = await openPptx(buffer, controller.signal);
        if (lease.current.current(ticket)) {
          setDimensions({ width: deck.width, height: deck.height }); setTotal(deck.slides.length);
          setSource({ id: ticket, name: file.name, kind, deck });
          setNotice('معاينة PPTX محلية مبسطة: قد تختلف الخطوط والتنسيقات المعقدة. الحركات والوسائط داخل الشرائح غير مشغّلة؛ يمكنك فتح مقطع الفيديو مباشرة كملف مستقل.');
        }
      } else if (kind === 'text') {
        const text = await file.text();
        if (lease.current.current(ticket)) setSource({ id: ticket, name: file.name, kind, text });
      } else {
        // Extension-derived MIME handles camera files whose browser File.type is empty.
        const url = lease.current.file(ticket, file.type === mime ? file : file.slice(0, file.size, mime));
        if (url) setSource({ id: ticket, name: file.name, kind, url });
      }
    } catch (err) {
      if (lease.current.current(ticket)) setError(err instanceof Error ? err.message : 'تعذّر قراءة الملف. أعد اختياره من مساحة تخزين الجهاز.');
    } finally { if (lease.current.current(ticket)) { setBusy(false); loading.current = null; } }
  };
  const size = fitSize(space, dimensions);
  const visual = source && ['video', 'audio', 'image', 'pdf', 'presentation'].includes(source.kind);
  return <div className={`lab-shell ${focus ? 'focused' : ''}`} ref={shell}>
    {!focus && <header>
      <div><strong>Otium <span>مختبر الوسائط</span></strong><p>تجربة منفصلة · بلا رفع تلقائي للملفات</p></div>
      <div className="header-actions">
        <button className="primary" onClick={() => input.current?.click()}>فتح ملف</button>
        {source && <button onClick={reset}>إغلاق الملف</button>}
      </div>
    </header>}
    <input ref={input} hidden type="file" accept=".mp4,.m4v,.webm,.mov,.mkv,.ogv,.mp3,.wav,.m4a,.ogg,.opus,.flac,.png,.jpg,.jpeg,.webp,.gif,.avif,.pdf,.txt,.md,.pptx,.ppsx,.doc,.docx,.xls,.xlsx"
      onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void open(file); }} />
    {!focus && (error || notice) && <div className={`message ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
      <span>{error || notice}</span><button aria-label="إغلاق الرسالة" onClick={() => { setError(''); setNotice(''); }}>×</button>
    </div>}
    {focus && error && <div className="focus-error" role="alert">{error}</div>}
    <main ref={stage} className="stage">
      {busy && <div className="empty"><h2>جارٍ تجهيز المصدر…</h2><button onClick={reset}>إلغاء</button></div>}
      {!busy && !source && <section className="welcome">
        <span className="eyebrow">مساحة الدرس</span><h1>الفيديو والشرح، في مساحة واحدة.</h1>
        <p>افتح ملفاً من الجهاز، شغّله أو أوقفه، ثم اكتب فوق اللقطة بقلم متجهي. هذه تجربة للعرض المحلي وليست تحديثاً منشوراً أو بثاً إلى الهاتف.</p>
        <div className="format-grid">
          <article><h2>فيديو وصوت</h2><p>تشغيل وتقديم وسرعة وصوت. نجاح التشغيل يعتمد على ترميز الملف والمتصفح.</p></article>
          <article><h2>صور وPDF ونصوص</h2><p>عرض محلي، تقليب PDF، وقلم للشرح فوق الصور والصفحات.</p></article>
          <article><h2>شرائح PPTX محلية</h2><p>معاينة ثابتة للنصوص والصور والأشكال الأساسية، مع التقليب والشرح. لا تحتاج خدمة خارجية.</p></article>
        </div>
        <button className="primary" onClick={() => input.current?.click()}>اختر ملفاً للتجربة</button>
        <button className="sample-play" onClick={() => { const ticket = reset(); setSource({ id: ticket, name: 'فيديو اختبار محلي', kind: 'video', url: sampleVideo }); }}>تشغيل فيديو الاختبار</button>
        <a className="sample-link" href={sampleVideo} download="otium-media-test.mp4">تنزيل فيديو اختبار قصير</a>
      </section>}
      {!busy && visual && <div className="surface" style={{ width: size.width, height: size.height }}>
        {(source.kind === 'video' || source.kind === 'audio') && <Player key={source.id} url={source.url} audio={source.kind === 'audio'} frozen={draw}
          onSize={(width, height) => setDimensions(previous => previous.width === width && previous.height === height ? previous : { width, height })}
          onError={setError} />}
        {source.kind === 'image' && <img src={source.url} alt={source.name} onLoad={event => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setError('تعذّر فك ترميز الصورة. جرّب PNG أو JPEG سليماً.')} />}
        {source.kind === 'pdf' && <Suspense fallback={<p>تحميل قارئ PDF…</p>}><Pdf key={source.id} url={source.url!} page={page}
          onReady={(width, height, count) => { setDimensions(previous => previous.width === width && previous.height === height ? previous : { width, height }); setTotal(count); }} onError={setError} /></Suspense>}
        {source.kind === 'presentation' && source.deck && <Suspense fallback={<p>تحميل عارض الشرائح…</p>}><Pptx key={source.id} deck={source.deck} page={page} onError={setError} /></Suspense>}
        <Ink key={`${source.id}:${page}:${revision}:${dimensions.width}:${dimensions.height}`} enabled={draw} color={color} width={dimensions.width} height={dimensions.height} />
      </div>}
      {!busy && source?.kind === 'text' && <pre className="text-document" dir="auto">{source.text}</pre>}
      {!busy && source?.kind === 'office' && <section className="office-card">
        <span className="eyebrow">{source?.name}</span>
        <h1>هذه الصيغة غير مدعومة محلياً بعد.</h1>
        <p>يمكنك فتح نسخة PDF من المستند. لا تُرسل ملفاتك إلى خدمة خارجية، ولا تُشغّل برامج أخرى لعرضها.</p>
      </section>}
    </main>
    {!focus && <footer>
      <div className="source-name"><strong>{source?.name ?? 'جاهز للتجربة'}</strong><span>{draw ? 'الشرح مؤقت؛ تشغيل الوسائط متوقف في المعاينة.' : 'اختبار محلي · لا يوجد بث إلى جهاز آخر في هذه التجربة'}</span></div>
      <nav aria-label="أدوات مساحة العرض">
        {visual && <>
          <button aria-pressed={draw} onClick={() => { setDraw(value => !value); if (draw) setRevision(value => value + 1); }}>{draw ? 'إنهاء الشرح' : 'شرح اللقطة'}</button>
          {draw && <><input aria-label="لون القلم" type="color" value={color} onChange={event => setColor(event.target.value)} /><button onClick={() => setRevision(value => value + 1)}>مسح الشرح</button></>}
          {(source?.kind === 'pdf' || source?.kind === 'presentation') && <div className="pager" dir="ltr"><button aria-label="الصفحة السابقة" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>‹</button><span>{page} / {total}</span><button aria-label="الصفحة التالية" disabled={page >= total} onClick={() => setPage(value => value + 1)}>›</button></div>}
        </>}
        {source && <button onClick={() => setFocus(true)}>إخفاء الأدوات</button>}
        <button onClick={() => {
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => setError('تعذّر إنهاء ملء الشاشة.'));
          else if (shell.current?.requestFullscreen) void shell.current.requestFullscreen().catch(() => setError('ملء الشاشة غير متاح في هذا المتصفح.'));
          else setError('ملء الشاشة غير متاح في هذا المتصفح.');
        }}>ملء الشاشة</button>
      </nav>
    </footer>}
    {focus && <button className="restore" onClick={() => setFocus(false)}>إظهار الأدوات{source?.kind === 'pdf' || source?.kind === 'presentation' ? ` · ${page} / ${total}` : ''}</button>}
  </div>;
}
