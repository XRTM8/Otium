// @vitest-environment happy-dom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { detectDeviceRole, readDeviceUsage, saveDeviceUsage, useDeviceUsage } from './deviceUsage';
import { TeachingProvider, useTeaching } from '../components/TeachingContext';
import { getPlatformId } from './runtime';
afterEach(() => { vi.unstubAllGlobals(); });
it('uses Android television hints but never mistakes a rotated phone or generic Android board for a TV', () => {
  vi.stubGlobal('navigator', { userAgent: 'Mozilla Android Mobile', maxTouchPoints: 5 });
  expect(detectDeviceRole()).toBe('handheld');
  window.innerWidth = 1920; window.dispatchEvent(new Event('resize'));
  expect(detectDeviceRole()).toBe('handheld');
  Object.defineProperty(window, 'OtiumUi', { configurable: true, value: { getDeviceType: () => 'television' } });
  expect(detectDeviceRole()).toBe('display');
  delete (window as any).OtiumUi;
});
it('validates stored roles and remembers a manually selected Android board', () => {
  expect(readDeviceUsage()).toBe('auto');
  expect(saveDeviceUsage('board')).toBe(true);
  expect(readDeviceUsage()).toBe('board');
  localStorage.setItem('otium-device-usage-v1', 'unknown');
  expect(readDeviceUsage()).toBe('auto');
});
it('recognizes native Android even when the WebView requests a desktop user agent', () => {
  vi.stubGlobal('navigator', { userAgent: 'Windows NT Desktop', maxTouchPoints: 0 });
  Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
  Object.defineProperty(window, 'OtiumUi', { configurable: true, value: { getDeviceType: () => 'handheld' } });
  try { expect(getPlatformId()).toBe('android'); expect(detectDeviceRole()).toBe('handheld'); }
  finally { delete (window as any).__TAURI_INTERNALS__; delete (window as any).OtiumUi; }
});
it('changes roles without remounting children, losing the active board, or changing roles on rotation', async () => {
  vi.stubGlobal('navigator', { userAgent: 'Android Mobile', maxTouchPoints: 5 });
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  let mounts = 0, current: ReturnType<typeof useTeaching>, profile: ReturnType<typeof useDeviceUsage>;
  function Child() { current = useTeaching(); useEffect(() => { mounts++; }, []); return null; }
  function Harness() { profile = useDeviceUsage(); return <TeachingProvider mobile={profile.compact}><Child /></TeachingProvider>; }
  try {
    await act(async () => root.render(<Harness />));
    expect(current!.mobile).toBe(true);
    await act(async () => { saveDeviceUsage('board'); });
    await act(async () => current!.updatePrefs({ boardEnabled: true }));
    await act(async () => current!.setLayout('split'));
    await act(async () => window.dispatchEvent(new Event('resize')));
    expect(profile!.role).toBe('board'); expect(profile!.receiver).toBe(true);
    expect(current!.mobile).toBe(false); expect(current!.layout).toBe('split'); expect(mounts).toBe(1);
    await act(async () => { saveDeviceUsage('display'); });
    expect(current!.layout).toBe('split'); expect(mounts).toBe(1);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
