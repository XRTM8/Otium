// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useMobileFullscreen } from './useMobileFullscreen';

it('requests browser fullscreen on a page gesture without consuming file-picker control gestures', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const request = vi.fn(async () => {});
  const previous = Object.getOwnPropertyDescriptor(document.documentElement, 'requestFullscreen');
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: request });
  const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
  function Probe() { useMobileFullscreen(); return <><div data-page>Page</div><button>Open file</button></>; }
  try {
    await act(async () => root.render(<Probe />));
    expect(request).not.toHaveBeenCalled();
    await act(async () => { host.querySelector('button')!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
    expect(request).not.toHaveBeenCalled();
    await act(async () => { host.querySelector('[data-page]')!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
    expect(request).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount()); host.remove();
    if (previous) Object.defineProperty(document.documentElement, 'requestFullscreen', previous); else Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
    vi.unstubAllGlobals();
  }
});
