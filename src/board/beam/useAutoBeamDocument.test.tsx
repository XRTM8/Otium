// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useAutoBeamDocument } from './useAutoBeamDocument';

const service = vi.hoisted(() => ({
  getTransferState: vi.fn(() => ({ active: false, progress: 0 })),
  onTransferProgress: vi.fn(() => () => {}), sendDocument: vi.fn(), sendViewMode: vi.fn(), broadcastPageChange: vi.fn()
}));
vi.mock('./beamService', () => ({ beamService: service }));
let root: Root, host: HTMLDivElement, result: ReturnType<typeof useAutoBeamDocument>;
const pdf = () => ({ getData: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }) as unknown as PDFDocumentProxy;
let options: Parameters<typeof useAutoBeamDocument>[0];
function Probe() { result = useAutoBeamDocument(options); return null; }
const render = async () => { await act(async () => root.render(<Probe />)); };
const tick = async () => { await act(async () => { vi.advanceTimersByTime(130); await Promise.resolve(); }); };
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  service.sendDocument.mockReset().mockResolvedValue({ mode: 'local' }); service.sendViewMode.mockClear();
  options = { doc: pdf(), docId: 'a', title: 'A.pdf', page: 4, total: 20, theme: 'paper', viewMode: 'dual', room: 'OTM-1234', role: 'sender', peerConnected: true, loading: false };
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('automatically opens a newly selected file once and syncs its current display mode', async () => {
  options = { ...options, doc: null, docId: '' }; await render(); await tick();
  expect(service.sendDocument).not.toHaveBeenCalled();
  options = { ...options, doc: pdf(), docId: 'a' }; await render(); await tick();
  expect(service.sendDocument).toHaveBeenCalledOnce();
  expect(service.sendDocument.mock.calls[0][0]).toMatchObject({ roomCode: 'OTM-1234', title: 'A.pdf', pageNumber: 4 });
  expect(service.sendViewMode).toHaveBeenCalledWith('dual');
  options = { ...options, page: 8 }; await render(); await tick();
  expect(service.sendDocument).toHaveBeenCalledOnce();
});
it('queues the latest opened file while a previous transfer is still running', async () => {
  let finish!: (value: unknown) => void;
  service.sendDocument.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await render(); await tick();
  options = { ...options, doc: pdf(), docId: 'b', title: 'B.pdf' }; await render(); await tick();
  expect(service.sendDocument).toHaveBeenCalledOnce();
  await act(async () => { finish({ mode: 'local' }); await Promise.resolve(); }); await tick();
  expect(service.sendDocument).toHaveBeenCalledTimes(2);
  expect(service.sendDocument.mock.calls[1][0].title).toBe('B.pdf');
});
it('does not echo received files or send before pairing is ready', async () => {
  options = { ...options, role: 'receiver' }; await render(); await tick();
  options = { ...options, role: 'sender', peerConnected: false }; await render(); await tick();
  expect(service.sendDocument).not.toHaveBeenCalled();
  options = { ...options, peerConnected: true }; await render(); await tick();
  expect(service.sendDocument).toHaveBeenCalledOnce();
});
it('exposes a failed transfer for explicit retry without repeatedly resending', async () => {
  service.sendDocument.mockRejectedValueOnce(new Error('Connection failed'));
  await render(); await tick();
  expect(result.error).toBe('Connection failed'); await tick();
  expect(service.sendDocument).toHaveBeenCalledOnce();
  await act(async () => result.retry()); await tick();
  expect(service.sendDocument).toHaveBeenCalledTimes(2); expect(result.error).toBeNull();
});
