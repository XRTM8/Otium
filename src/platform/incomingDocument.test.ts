// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { MAX_INCOMING_PDF_BYTES, registerIncomingDocumentHandler } from './incomingDocument';
vi.mock('./runtime', () => ({ getPlatformId: () => 'android', isTauriRuntime: () => true }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
let dispose = () => {};
const nativeWindow = window as any;
afterEach(() => { dispose(); delete nativeWindow.OtiumFile; });
function bridge(size = 300_000) {
  let id = 'first';
  const bytes = new Uint8Array(size); bytes.set(new TextEncoder().encode('%PDF-1.7\n'));
  const result = {
    getPendingDocumentInfo: vi.fn(() => JSON.stringify({ id, hasDocument: true, size, name: 'telegram.pdf' })),
    readPendingDocumentChunkV2: vi.fn((_id: string, offset: number, count: number) => {
      let value = ''; for (const byte of bytes.subarray(offset, offset + count)) value += String.fromCharCode(byte);
      return btoa(value);
    }),
    acknowledgeDocument: vi.fn(() => true),
    replace: () => { id = 'second'; }
  };
  nativeWindow.OtiumFile = result;
  return result;
}
it('reads after a cold launch in bounded chunks, yields to UI, and acknowledges after acceptance', async () => {
  const native = bridge(), accepted = vi.fn(async () => true), error = vi.fn();
  dispose = registerIncomingDocumentHandler(accepted, error);
  expect(accepted).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(accepted).toHaveBeenCalledOnce());
  expect(error).not.toHaveBeenCalled();
  expect(accepted.mock.calls[0][0].data.byteLength).toBe(300_000);
  expect(native.acknowledgeDocument).toHaveBeenCalledWith('first');
  expect(native.readPendingDocumentChunkV2.mock.calls.every(call => call[2] <= 128 * 1024)).toBe(true);
});
it('never acknowledges an incomplete read or a reader rejection', async () => {
  const native = bridge(); native.readPendingDocumentChunkV2.mockReturnValue('');
  const handler = vi.fn(), error = vi.fn();
  dispose = registerIncomingDocumentHandler(handler, error);
  await vi.waitFor(() => expect(error).toHaveBeenCalledOnce());
  expect(handler).not.toHaveBeenCalled(); expect(native.acknowledgeDocument).not.toHaveBeenCalled();
});
it('does not allocate an advertised oversized document', async () => {
  const native = bridge(100); native.getPendingDocumentInfo.mockReturnValue(JSON.stringify({ id: 'huge', hasDocument: true, size: MAX_INCOMING_PDF_BYTES + 1 }));
  const error = vi.fn(); dispose = registerIncomingDocumentHandler(vi.fn(), error);
  expect(error).toHaveBeenCalledOnce(); expect(native.readPendingDocumentChunkV2).not.toHaveBeenCalled();
});
it('does not deliver or clear a cancelled read after unmount', async () => {
  const native = bridge(), handler = vi.fn();
  dispose = registerIncomingDocumentHandler(handler); dispose();
  await new Promise(resolve => setTimeout(resolve, 30));
  expect(handler).not.toHaveBeenCalled(); expect(native.acknowledgeDocument).not.toHaveBeenCalled();
});
it('discards the old buffer when a different Telegram document replaces it', async () => {
  const native = bridge(), handler = vi.fn();
  dispose = registerIncomingDocumentHandler(handler); native.replace();
  await new Promise(resolve => setTimeout(resolve, 30));
  expect(handler).not.toHaveBeenCalled(); expect(native.acknowledgeDocument).not.toHaveBeenCalled();
});
it('waits for a late bridge and reports a provider permission error without a black screen', async () => {
  const error = vi.fn(); dispose = registerIncomingDocumentHandler(vi.fn(), error);
  nativeWindow.OtiumFile = { getPendingDocumentInfo: () => JSON.stringify({ id: 'denied', error: 'Permission denied' }), acknowledgeDocument: vi.fn() };
  await nativeWindow.__OTIUM_CHECK_INCOMING_PDF__();
  expect(error).toHaveBeenCalledWith('Permission denied');
});
it('keeps native data until the PDF reader has accepted it', async () => {
  const native = bridge(30); let finish!: (value: boolean) => void;
  const handler = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
  dispose = registerIncomingDocumentHandler(handler);
  await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
  expect(native.acknowledgeDocument).not.toHaveBeenCalled();
  finish(false); await new Promise(resolve => setTimeout(resolve, 10));
  expect(native.acknowledgeDocument).not.toHaveBeenCalled();
});
