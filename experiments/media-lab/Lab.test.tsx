import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Lab } from './Lab';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let resize: ResizeObserverCallback;
beforeEach(async () => {
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe() {} disconnect() {}
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Lab />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const button = (text: string) => [...host.querySelectorAll('button')].find(item => item.textContent === text)!;
const upload = async (file: File) => {
  const transfer = new DataTransfer(); transfer.items.add(file);
  const input = host.querySelector('input[type=file]') as HTMLInputElement;
  input.files = transfer.files;
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
};

it('can hide and restore controls without losing the current source', async () => {
  await act(async () => button('تشغيل فيديو الاختبار').click());
  const video = host.querySelector('video');
  expect(video).toBeTruthy();
  await act(async () => button('إخفاء الأدوات').click());
  expect(host.querySelector('header')).toBeNull();
  expect(host.querySelector('footer')).toBeNull();
  expect(host.querySelector('.focused')).toBeTruthy();
  await act(async () => button('إظهار الأدوات').click());
  expect(host.querySelector('footer')).toBeTruthy();
  expect(host.querySelector('video')).toBe(video);
});

it('keeps the active file mounted across rotation and a zero-sized layout', async () => {
  await act(async () => button('تشغيل فيديو الاختبار').click());
  const video = host.querySelector('video');
  for (const rect of [{ width: 0, height: 0 }, { width: 375, height: 600 }, { width: 700, height: 300 }]) {
    await act(async () => resize([{ contentRect: rect } as ResizeObserverEntry], {} as ResizeObserver));
    expect(host.querySelector('video')).toBe(video);
    expect(host.textContent).toContain('فيديو اختبار محلي');
  }
});

it('treats HTML inside a text file as text, and closes without keeping its content', async () => {
  await upload(new File(['<script>window.bad=true</script>'], 'notes.txt'));
  expect(host.querySelector('pre')?.textContent).toContain('<script>');
  expect(host.querySelector('script')).toBeNull();
  await act(async () => button('إغلاق الملف').click());
  expect(host.querySelector('pre')).toBeNull();
  expect(host.textContent).not.toContain('window.bad');
});

it('rejects a damaged PPTX locally and never offers cloud embedding or a window picker', async () => {
  const file = new File(['fake archive'], 'lecture.pptx');
  await upload(file);
  expect(host.querySelector('[role=alert]')?.textContent).toContain('PPTX');
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(host.querySelector('iframe')).toBeNull();
  expect(host.querySelector('input[type=url]')).toBeNull();
  expect(host.textContent).not.toContain('التقاط نافذة');
});
