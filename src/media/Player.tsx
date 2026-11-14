import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Play, Pause, Volume2, VolumeX, RotateCcw, RotateCw } from 'lucide-react';
import { formatTime, mediaErrorMessage } from './media';

export function Player({ url, audio, frozen, autoPlay = false, onSize, onError, initialTime = 0, onPosition, lang = 'ar' }: {
  url?: string; audio?: boolean; frozen: boolean;
  onSize: (width: number, height: number) => void; onError: (message: string) => void;
  initialTime?: number; onPosition?: (position: number) => void;
  autoPlay?: boolean;
  lang?: 'ar' | 'en';
}) {
  const label = (ar: string, en: string) => lang === 'ar' ? ar : en;
  const media = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(autoPlay);
  const [rate, setRate] = useState(1);
  const [buffering, setBuffering] = useState(true);
  useEffect(() => {
    const element = media.current;
    if (!element) return;
    if (url) {
      // React's development StrictMode replays cleanup/setup without replacing
      // the DOM node, so setup must restore the src removed by cleanup.
      element.srcObject = null;
      element.src = url;
      element.load();
    }
    return () => { element.pause(); element.srcObject = null; element.removeAttribute('src'); element.load(); };
  }, [url]); // Callback changes must not reset an already-playing source.
  useEffect(() => { if (frozen) media.current?.pause(); }, [frozen]);
  const seek = (offset: number) => {
    const element = media.current;
    if (element && duration) element.currentTime = Math.max(0, Math.min(duration, element.currentTime + offset));
  };
  const toggle = () => {
    const element = media.current;
    if (!element || frozen) return;
    if (element.paused) void element.play().catch(() => onError(label('تعذّر بدء التشغيل؛ تحقق من ترميز الملف وصلاحية تشغيل الصوت.', 'Playback could not start. Check the codec and audio playback permission.')));
    else element.pause();
  };
  const keyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (frozen || event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement).matches('input,select,textarea,button,[contenteditable=true]')) return;
    if (event.key === ' ' || event.key.toLowerCase() === 'k') { event.preventDefault(); toggle(); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); seek(10); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); seek(-10); }
    else if (event.key.toLowerCase() === 'm') { event.preventDefault(); setMuted(value => !value); }
  };
  return <>
    <video ref={media} src={url} playsInline autoPlay={autoPlay && !frozen} preload="metadata" muted={muted} className={audio ? 'audio-element' : ''} tabIndex={frozen ? -1 : 0} aria-label={label('تشغيل المقطع، مسافة للإيقاف وأسهم للتقديم', 'Video: Space to play or pause, arrows to seek')} onKeyDown={keyboard} onClick={toggle}
      onLoadedMetadata={event => {
        const element = event.currentTarget;
        setDuration(Number.isFinite(element.duration) ? element.duration : 0);
        setBuffering(false);
        if (initialTime > 0 && Number.isFinite(element.duration)) element.currentTime = Math.min(initialTime, Math.max(0, element.duration - 0.1));
        if (element.videoWidth) onSize(element.videoWidth, element.videoHeight);
      }}
      onResize={event => { const element = event.currentTarget; if (element.videoWidth) onSize(element.videoWidth, element.videoHeight); }}
      onTimeUpdate={event => { setTime(event.currentTarget.currentTime); onPosition?.(event.currentTarget.currentTime); }}
      onWaiting={() => setBuffering(true)} onCanPlay={() => setBuffering(false)} onPlaying={() => setBuffering(false)}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)} onError={event => { setBuffering(false); onError(mediaErrorMessage(event.currentTarget.error?.code)); }} />
    {audio && <div className="audio-art"><span>♫</span><p>{label('مساحة استماع وشرح', 'A space to listen and annotate')}</p></div>}
    {buffering && !frozen && <span className="media-loading" role="status">{label('جارٍ تجهيز المقطع…', 'Preparing playback…')}</span>}
    {!frozen && <div className="player-controls" aria-label={label('التحكم بالوسائط', 'Media controls')} onKeyDown={keyboard} onPointerDown={event => event.stopPropagation()}>
      <button aria-label={playing ? label('إيقاف مؤقت', 'Pause') : label('تشغيل', 'Play')} onClick={toggle}>{playing ? <Pause size={19} /> : <Play size={19} />}</button>
      <button aria-label={label('إرجاع 10 ثوانٍ', 'Back 10 seconds')} disabled={!duration} onClick={() => seek(-10)}><RotateCcw size={17} /><span className="player-skip">10</span></button>
      <button aria-label={label('تقديم 10 ثوانٍ', 'Forward 10 seconds')} disabled={!duration} onClick={() => seek(10)}><RotateCw size={17} /><span className="player-skip">10</span></button>
      <>
        <span className="clock">{formatTime(time)} / {formatTime(duration)}</span>
        <input className="player-timeline" aria-label={label('موضع التشغيل', 'Playback position')} type="range" min={0} max={duration || 0} step={0.1} value={Math.min(time, duration)} disabled={!duration}
          onChange={event => { if (media.current) media.current.currentTime = Number(event.target.value); }} />
        <select aria-label={label('سرعة التشغيل', 'Playback speed')} value={rate} onChange={event => { const next = Number(event.target.value); setRate(next); if (media.current) media.current.playbackRate = next; }}>
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map(value => <option key={value} value={value}>{value}×</option>)}
        </select>
      </>
      <button aria-label={muted ? label('تشغيل الصوت', 'Unmute') : label('كتم الصوت', 'Mute')} aria-pressed={muted} onClick={() => setMuted(value => !value)}>{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>
    </div>}
  </>;
}
