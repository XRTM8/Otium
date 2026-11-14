import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Player } from '../../src/media/Player';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function (this: HTMLMediaElement) { this.dispatchEvent(new Event('play')); });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) { this.dispatchEvent(new Event('pause')); });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it('preserves a local video URL through StrictMode effect replay', async () => {
  await act(async () => root.render(<StrictMode><Player url="blob:lesson" frozen={false} onSize={vi.fn()} onError={vi.fn()} /></StrictMode>));
  expect(host.querySelector('video')?.getAttribute('src')).toBe('blob:lesson');
});
it('does not reload a playing source when a callback changes', async () => {
  await act(async () => root.render(<Player url="blob:lesson" frozen={false} onSize={vi.fn()} onError={vi.fn()} />));
  const loads = vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length;
  await act(async () => root.render(<Player url="blob:lesson" frozen={false} onSize={vi.fn()} onError={vi.fn()} />));
  expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(loads);
});
it('restores playback position and clamps ten-second skips to the media duration', async () => {
  await act(async () => root.render(<Player url="blob:lesson" initialTime={17} frozen={false} onSize={vi.fn()} onError={vi.fn()} />));
  const video = host.querySelector('video')!;
  Object.defineProperty(video, 'duration', { configurable: true, value: 20 });
  await act(async () => video.dispatchEvent(new Event('loadedmetadata')));
  expect(video.currentTime).toBe(17);
  await act(async () => (host.querySelector('button[aria-label="تقديم 10 ثوانٍ"]') as HTMLButtonElement).click());
  expect(video.currentTime).toBe(20);
  video.currentTime = 3;
  await act(async () => (host.querySelector('button[aria-label="إرجاع 10 ثوانٍ"]') as HTMLButtonElement).click());
  expect(video.currentTime).toBe(0);
});

it('pauses the video for annotation and releases playback when the source is removed', async () => {
  const props = { url: 'blob:lesson', onSize: vi.fn(), onError: vi.fn() };
  await act(async () => root.render(<Player {...props} frozen={false} />));
  await act(async () => host.querySelector('button')!.click());
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  await act(async () => root.render(<Player {...props} frozen />));
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  expect(host.querySelector('.player-controls')).toBeNull();
  const element = host.querySelector('video')!;
  await act(async () => root.unmount());
  expect(element.hasAttribute('src')).toBe(false);
  expect(element.srcObject).toBeNull();
});
