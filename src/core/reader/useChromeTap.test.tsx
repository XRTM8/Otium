// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useChromeTap } from './useChromeTap';

it('toggles only stationary taps, preserving scroll, pinch, cancel and controls', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const toggle = vi.fn(), host = document.createElement('div'); document.body.appendChild(host);
  function Probe() { return <div data-viewport {...useChromeTap(true, toggle)}><canvas /><button>Control</button></div>; }
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Probe />));
    const viewport = host.querySelector('[data-viewport]')!;
    const send = (type: string, id = 1, x = 20, target: Element = viewport) => target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: 20, bubbles: true }));
    await act(async () => { send('pointerdown'); send('pointerup'); }); expect(toggle).toHaveBeenCalledOnce();
    await act(async () => { send('pointerdown'); send('pointermove', 1, 50); send('pointerup', 1, 50); });
    await act(async () => { send('pointerdown'); send('pointerdown', 2); send('pointerup', 2); send('pointerup'); });
    await act(async () => { send('pointerdown'); send('pointercancel'); send('pointerup'); });
    await act(async () => { send('pointerdown', 1, 20, host.querySelector('button')!); send('pointerup', 1, 20, host.querySelector('button')!); });
    expect(toggle).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
