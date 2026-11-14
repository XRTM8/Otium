// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CropView } from './CropView';

const warpMock = vi.hoisted(() =>
  vi.fn(async () => document.createElement('canvas'))
);

vi.mock('../core/geometry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/geometry')>();
  return {
    ...actual,
    warpPerspectiveAsync: warpMock,
  };
});

let root: Root;
let host: HTMLDivElement;

function findButton(label: string): HTMLButtonElement {
  const btn = [...host.querySelectorAll('button')].find(
    (b) => b.textContent?.includes(label) || b.getAttribute('title')?.includes(label)
  );
  if (!btn) throw new Error(`Missing button: ${label}`);
  return btn;
}

describe('CropView', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    warpMock.mockClear();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('initializes quad on image load, supports full-frame selection and undo/redo, and confirms warped canvas', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    await act(async () => {
      root.render(
        <CropView
          imageSrc="data:image/png;base64,AAAA"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );
    });

    const img = host.querySelector('img');
    if (!img) throw new Error('Missing preview image');
    Object.defineProperty(img, 'naturalWidth', { value: 1200, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 1600, configurable: true });
    vi.spyOn(img, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 400));

    await act(async () => {
      img.dispatchEvent(new Event('load'));
    });

    expect(host.textContent).toContain('تحديد أبعاد المستند');
    const undoBtn = findButton('Undo');
    const redoBtn = findButton('Redo');
    expect(undoBtn.disabled).toBe(true);
    expect(redoBtn.disabled).toBe(true);

    await act(async () => findButton('كامل الصورة').click());
    expect(undoBtn.disabled).toBe(false);

    await act(async () => undoBtn.click());
    expect(redoBtn.disabled).toBe(false);

    await act(async () => findButton('تطبيق القص').click());
    expect(warpMock).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await act(async () => findButton('إلغاء').click());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
