// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { BrowserFullscreenButton } from './BrowserFullscreenButton';
it('enters from the homepage and reflects native Escape / fullscreen exit', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const request = vi.fn(async () => { Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.documentElement }); document.dispatchEvent(new Event('fullscreenchange')); });
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: request });
  try {
    await act(async () => root.render(<BrowserFullscreenButton ar />));
    await act(async () => host.querySelector('button')!.click());
    expect(request).toHaveBeenCalledOnce();
    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('خروج من ملء الشاشة');
    await act(async () => { Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null }); document.dispatchEvent(new Event('fullscreenchange')); });
    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('ملء الشاشة');
    request.mockRejectedValueOnce(new Error('Blocked'));
    await act(async () => host.querySelector('button')!.click());
    expect(host.querySelector('[role="status"]')).not.toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); }
});
