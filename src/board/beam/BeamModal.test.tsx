// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReaderController } from '../../app/useReaderController';
import { beamService } from './beamService';
import { BeamModal } from './BeamModal';
import { saveRecentLanTarget } from './beamLanTransport';

let host: HTMLDivElement;
let root: Root;

function fakeReader(hasDoc = false): ReaderController {
  return {
    doc: hasDoc ? ({ numPages: 4 } as ReaderController['doc']) : null,
    docId: 'doc-beam-test',
    docTitle: hasDoc ? 'Algebra.pdf' : '',
    currentPage: 2,
    numPages: hasDoc ? 4 : 0,
    theme: 'midnight',
    lang: 'ar',
    beamPeerConnected: false,
    beamRoom: null,
    beamRole: null,
    scrollToPage: vi.fn(),
    changeViewMode: vi.fn(),
    loadDocumentBytes: vi.fn(async () => {}),
    autoBeam: { retry: vi.fn() },
  } as unknown as ReaderController;
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  beamService.disconnect();
  vi.stubGlobal(
    'EventSource',
    class {
      onopen: (() => void) | null = null;
      onmessage: (() => void) | null = null;
      onerror: (() => void) | null = null;
      close = vi.fn();
    }
  );
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '' }));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
  beamService.disconnect();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('BeamModal', () => {
  it('returns null when closed', async () => {
    await act(async () => {
      root.render(
        <BeamModal
          isOpen={false}
          lang="ar"
          reader={fakeReader()}
          formFactor="desktop"
          onSetBoardOpen={vi.fn()}
          onClose={vi.fn()}
        />
      );
    });
    expect(host.innerHTML).toBe('');
  });

  it('auto-starts receiver on desktop without a document and switches across Send/Offline tabs', async () => {
    const startReceiverSpy = vi.spyOn(beamService, 'startReceiver');
    await act(async () => {
      root.render(
        <BeamModal
          isOpen
          lang="ar"
          reader={fakeReader(false)}
          formFactor="desktop"
          onSetBoardOpen={vi.fn()}
          onClose={vi.fn()}
        />
      );
      await new Promise((r) => setTimeout(r, 15));
    });

    expect(startReceiverSpy).toHaveBeenCalledOnce();
    expect(host.textContent).toContain('البث الذكي للسبورة');

    const sendTabBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('بث للسبورة')
    );
    await act(async () => {
      sendTabBtn?.click();
    });
    expect(host.querySelector('input[placeholder="OTM-XXXXXXXXXXXX"]')).not.toBeNull();

    const offlineTabBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('بدون إنترنت')
    );
    await act(async () => {
      offlineTabBtn?.click();
    });
    expect(host.querySelectorAll('input[type="file"]').length).toBe(3);
  });

  it('pairs as sender when room code is entered on handheld/send flow', async () => {
    const startSenderSpy = vi.spyOn(beamService, 'startSender');
    await act(async () => {
      root.render(
        <BeamModal
          isOpen
          lang="ar"
          reader={fakeReader(false)}
          formFactor="mobile"
          preferredRole="sender"
          onSetBoardOpen={vi.fn()}
          onClose={vi.fn()}
        />
      );
    });

    const input = host.querySelector<HTMLInputElement>('input[placeholder="OTM-XXXXXXXXXXXX"]');
    expect(input).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'OTM-ABCD1234EFGH');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const pairBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('كريموت') || b.textContent?.includes('اتصال')
    );
    expect(pairBtn).toBeDefined();
    await act(async () => {
      pairBtn!.click();
    });

    expect(startSenderSpy).toHaveBeenCalledWith('OTM-ABCD1234EFGH');
    expect(beamService.getRole()).toBe('sender');
  });

  it('closes the receiving sheet after pairing and keeps the receiver session', async () => {
    let notifyPeer!: Parameters<typeof beamService.onPeerChange>[0];
    const close = vi.fn();
    vi.spyOn(beamService, 'onPeerChange').mockImplementation(listener => {
      notifyPeer = listener;
      return () => {};
    });
    await act(async () => root.render(<BeamModal isOpen lang="en" reader={fakeReader()}
      formFactor="desktop" onSetBoardOpen={vi.fn()} onClose={close} />));
    expect(close).not.toHaveBeenCalled();
    await act(async () => notifyPeer({ connected: true, peerName: 'Phone', transport: 'p2p',
      docTitle: null, pageNumber: null, totalPages: null }));
    expect(close).toHaveBeenCalledOnce();
    expect(beamService.getRole()).toBe('receiver');
  });

  it('keeps the sending sheet through transfer and closes after the file is confirmed open', async () => {
    let notifyPeer!: Parameters<typeof beamService.onPeerChange>[0];
    let notifyTransfer!: Parameters<typeof beamService.onTransferProgress>[0];
    const close = vi.fn();
    const opened = vi.fn(async () => true);
    vi.spyOn(beamService, 'onPeerChange').mockImplementation(listener => { notifyPeer = listener; return () => {}; });
    vi.spyOn(beamService, 'onTransferProgress').mockImplementation(listener => { notifyTransfer = listener; return () => {}; });
    await act(async () => root.render(<BeamModal isOpen lang="en" reader={fakeReader()}
      formFactor="mobile" preferredRole="sender" onOpenFile={opened} onSetBoardOpen={vi.fn()} onClose={close} />));
    const room = host.querySelector<HTMLInputElement>('input[placeholder="OTM-XXXXXXXXXXXX"]')!;
    const fileInput = host.querySelector<HTMLInputElement>('input[type=file]')!;
    const file = new File(['photo'], 'lecture.png');
    expect(fileInput.accept).toContain('.pptx');
    expect(fileInput.accept).toContain('.mp4');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(room, 'OTM-ABCD1234EFGH');
      room.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      Object.defineProperty(fileInput, 'files', { value: [file] });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(opened).toHaveBeenCalledWith(file);
    await act(async () => notifyPeer({ connected: true, peerName: 'Board', transport: 'p2p',
      docTitle: null, pageNumber: null, totalPages: null }));
    expect(close).not.toHaveBeenCalled();
    const state = { ...beamService.getTransferState(), direction: 'send' as const, mode: 'p2p' as const };
    await act(async () => notifyTransfer({ ...state, active: true, phase: 'transferring' }));
    expect(close).not.toHaveBeenCalled();
    await act(async () => notifyTransfer({ ...state, active: false, phase: 'done', progress: 100 }));
    expect(close).toHaveBeenCalledOnce();
    expect(beamService.getRole()).toBe('sender');
  });

  it('renders recent LAN targets on send tab in LAN mode and connects on click', async () => {
    localStorage.clear();
    const target = { address: '192.168.1.55', port: 52123, key: 'CD'.repeat(32) };
    saveRecentLanTarget(target);

    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {};
    const startLanSpy = vi.spyOn(beamService, 'startLanSender').mockResolvedValue();

    await act(async () => {
      root.render(
        <BeamModal
          isOpen
          lang="ar"
          reader={fakeReader(true)}
          formFactor="mobile"
          preferredRole="sender"
          onSetBoardOpen={vi.fn()}
          onClose={vi.fn()}
        />
      );
      await new Promise((r) => setTimeout(r, 15));
    });

    // Switch to LAN network tab
    const lanTabBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('شبكة محلية')
    );
    expect(lanTabBtn).toBeDefined();
    await act(async () => {
      lanTabBtn!.click();
    });

    // Recent LAN screens list should be rendered
    const recentBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('192.168.1.55:52123')
    );
    expect(recentBtn).toBeDefined();

    await act(async () => {
      recentBtn!.click();
    });

    expect(startLanSpy).toHaveBeenCalledWith(target);
  });
});
