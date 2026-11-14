// @vitest-environment happy-dom
import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReaderController } from '../app/useReaderController';
import { useAppMedia } from './useAppMedia';
import { storeMedia, updateMedia } from './library';
import { registerIncomingDocumentHandler } from '../platform/incomingDocument';
vi.mock('../platform/incomingDocument', () => ({ registerIncomingDocumentHandler: vi.fn(() => () => {}) }));
vi.mock('./library', async importActual => ({ ...await importActual<typeof import('./library')>(), storeMedia: vi.fn(), updateMedia: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement, current: ReturnType<typeof useAppMedia>;
const reader = { openFile: vi.fn(), openRecent: vi.fn(), closeDocument: vi.fn(), setDocumentError: vi.fn(), loadDocumentBytes: vi.fn(async () => true) } as unknown as ReaderController;
function Probe() {
  const value = useAppMedia(reader);
  useLayoutEffect(() => { current = value; }, [value]);
  return null;
}
beforeEach(async () => {
  vi.mocked(storeMedia).mockResolvedValue(true); vi.mocked(updateMedia).mockResolvedValue();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Probe />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it('flushes changed playback progress on backgrounding and avoids redundant writes', async () => {
  await act(async () => current.open(new File(['clip'], 'lesson.mp4')));
  const id = current.active!.item.id;
  current.updateProgress({ lastPage: 1, totalPages: 1, position: 15 });
  await act(async () => window.dispatchEvent(new Event('pagehide')));
  expect(updateMedia).toHaveBeenCalledWith(id, { lastPage: 1, totalPages: 1, position: 15 });
  await act(async () => window.dispatchEvent(new Event('pagehide')));
  expect(updateMedia).toHaveBeenCalledTimes(1);
});
it('does not let an older file finish opening over the latest file', async () => {
  let finish!: (value: boolean) => void;
  vi.mocked(storeMedia).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = current.open(new File(['one'], 'first.mp4')); });
  await act(async () => current.open(new File(['two'], 'second.mp4')));
  await act(async () => { finish(true); await pending; });
  expect(current.active?.file.name).toBe('second.mp4');
  expect(reader.closeDocument).toHaveBeenCalledTimes(1);
});
it('keeps the current media open when a saved PDF cannot be opened', async () => {
  await act(async () => current.open(new File(['clip'], 'lesson.mp4')));
  vi.mocked(reader.openRecent).mockResolvedValueOnce(false);
  await act(async () => current.openRecent({ id: 'missing', name: 'missing.pdf', available: true, lastPage: 1, totalPages: 1, lastOpened: 0, sizeBytes: 10 }));
  expect(current.active?.file.name).toBe('lesson.mp4');
  expect(current.pending).toBe(false);
});
it('does not let a slow Telegram transfer replace a newer manually-opened file', async () => {
  const [incoming, , reading] = vi.mocked(registerIncomingDocumentHandler).mock.calls[0];
  await act(async () => reading!(true, 'telegram-old'));
  expect(current.pending).toBe(true);
  await act(async () => current.open(new File(['clip'], 'newer.mp4')));
  let accepted: unknown;
  await act(async () => { accepted = await incoming({ data: new ArrayBuffer(10), name: 'old.pdf', id: 'telegram-old' }); reading!(false, 'telegram-old'); });
  expect(accepted).toBe(false); expect(reader.loadDocumentBytes).not.toHaveBeenCalled();
  expect(current.active?.file.name).toBe('newer.mp4'); expect(current.pending).toBe(false);
});
