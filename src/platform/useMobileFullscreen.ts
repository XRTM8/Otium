import { useEffect } from 'react';
import { syncNativeImmersive } from './ui';

export function useMobileFullscreen() {
  useEffect(() => {
    syncNativeImmersive(true);
    let pending = false;
    const enter = (event: PointerEvent) => {
      const native = (window as Window & { OtiumUi?: { setImmersive?: (enabled: boolean) => void } }).OtiumUi;
      if (native?.setImmersive || pending || document.fullscreenElement) return;
      // Do not consume the user gesture of a file picker, editor or native selection handle.
      const target = event.target as Element | null;
      if (target?.closest?.('button, a, input, textarea, select, [role="button"], [contenteditable="true"], .textLayer')) return;
      const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
      const request = root.requestFullscreen ? () => root.requestFullscreen({ navigationUI: 'hide' }) : root.webkitRequestFullscreen?.bind(root);
      if (!request) return;
      pending = true;
      try { Promise.resolve(request()).catch(() => {}).finally(() => { pending = false; }); } catch { pending = false; }
    };
    document.addEventListener('pointerup', enter);
    return () => document.removeEventListener('pointerup', enter);
  }, []);
}
