// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MediaWorkspace } from './MediaWorkspace';
import type { ReaderController } from '../app/useReaderController';
import type { ActiveMedia } from './useAppMedia';
vi.mock('../components/teachingContextValue', () => ({ useTeaching: () => ({ setLayout }) }));
const setLayout = vi.fn();
vi.mock('./pptx', () => ({ openPptx: vi.fn(async () => ({ width: 1600, height: 900, slides: [{}, {}, {}] })) }));
vi.mock('./SlideView', () => ({ Pptx: () => null }));
vi.mock('./Ink', () => ({ Ink: () => null }));
vi.mock('./Player', () => ({ Player: ({ frozen }: { frozen: boolean }) => <span data-frozen={String(frozen)} /> }));
vi.mock('./useMediaDrawing', () => ({ useMediaDrawing: () => ({ ready: true, strokes: [], status: 'saved' }) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
const reader = { lang: 'en', theme: 'paper', changeTheme: vi.fn(), handleToggleFullscreen: vi.fn() } as unknown as ReaderController;
const onOpen = vi.fn(), onProgress = vi.fn();
async function render(kind: 'presentation' | 'video') {
  const source = { file: new File(['test'], kind === 'video' ? 'test.mp4' : 'test.pptx'), item: { id: 'media:test', name: 'test', mediaKind: kind, lastPage: 1, position: 0 }, saved: true } as ActiveMedia;
  await act(async () => root.render(<MediaWorkspace source={source} reader={reader} onClose={vi.fn()} onOpen={onOpen} onProgress={onProgress} />));
}
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
it('does not navigate slides while arrow keys are used inside a popup or dialog', async () => {
  await render('presentation');
  const section = host.querySelector('section')!;
  await act(async () => section.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ lastPage: 2 }));
  onProgress.mockClear();
  const summary = host.querySelector('summary')!;
  await act(async () => summary.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
  const dialog = document.createElement('dialog'), button = document.createElement('button');
  dialog.append(button); section.append(dialog);
  await act(async () => button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  expect(onProgress).not.toHaveBeenCalled();
  dialog.remove();
});
it('does not freeze playback when selecting another file before it successfully opens', async () => {
  await render('video');
  const input = host.querySelector('input[type=file]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['x'], 'next.mp4')] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(onOpen).toHaveBeenCalled();
  expect(host.querySelector('[data-frozen]')?.getAttribute('data-frozen')).toBe('false');
});
