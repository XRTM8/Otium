// @vitest-environment happy-dom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const device = vi.hoisted(() => ({ form: 'mobile' }));
vi.mock('./platform/runtime', () => ({ getFormFactor: () => device.form }));
vi.mock('./core/storage/persistence', () => ({ requestStoragePersistence: vi.fn() }));
vi.mock('./shells/MobileShell', () => ({ MobileShell: function Mobile() {
  const [page, setPage] = useState(1);
  return <button onClick={() => setPage(7)}>Mobile page {page}</button>;
} }));
vi.mock('./shells/DesktopShell', () => ({ DesktopShell: () => <p>Desktop library</p> }));
import App from './App';

it('preserves the open mobile reader when landscape crosses the desktop breakpoint', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<App />));
    await act(async () => host.querySelector('button')!.click());
    device.form = 'desktop';
    await act(async () => window.dispatchEvent(new Event('resize')));
    expect(host.textContent).toBe('Mobile page 7');
    await act(async () => window.dispatchEvent(new Event('orientationchange')));
    expect(host.textContent).toBe('Mobile page 7');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    device.form = 'mobile';
    vi.unstubAllGlobals();
  }
});
