import { useEffect, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { isTauriRuntime } from '../platform/runtime';
type FullscreenDocument = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> | void };
export function BrowserFullscreenButton({ ar }: { ar: boolean }) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const update = () => setActive(Boolean(document.fullscreenElement || (document as FullscreenDocument).webkitFullscreenElement));
    update(); document.addEventListener('fullscreenchange', update); document.addEventListener('webkitfullscreenchange', update);
    return () => { document.removeEventListener('fullscreenchange', update); document.removeEventListener('webkitfullscreenchange', update); };
  }, []);
  if (isTauriRuntime()) return null;
  const label = active ? (ar ? 'خروج من ملء الشاشة' : 'Exit fullscreen') : (ar ? 'ملء الشاشة' : 'Fullscreen');
  return <>
    <button type="button" aria-label={label} title={label} aria-pressed={active} className="fluid-press flex min-h-11 items-center gap-1.5 px-3 py-1.5 rounded-full chrome-surface text-xs text-ink cursor-pointer" onClick={async () => {
      setError(false);
      const doc = document as FullscreenDocument;
      const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
      try {
        if (doc.fullscreenElement) await doc.exitFullscreen();
        else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
        else if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
        else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
        else setError(true);
      } catch { setError(true); }
    }}>
      {active ? <Minimize size={16} /> : <Maximize size={16} />}<span className="hidden sm:inline">{label}</span>
    </button>
    {error && <span role="status" className="text-xs text-danger-ink">{ar ? 'ملء الشاشة غير متاح أو لم يسمح به المتصفح.' : 'Fullscreen is unavailable or blocked by this browser.'}</span>}
  </>;
}
