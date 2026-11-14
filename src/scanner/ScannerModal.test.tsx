// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScannedPage } from './core/types';
import { ScannerModal } from './ScannerModal';

const storeMocks = vi.hoisted(() => ({
  draftPages: null as ScannedPage[] | null,
  clearScanSession: vi.fn().mockResolvedValue(undefined),
  clearActiveSessionPages: vi.fn(),
  saveActiveSessionPages: vi.fn(),
}));

vi.mock('./core/storage/pageStore', () => ({
  storePageToDisk: vi.fn().mockResolvedValue('data:image/jpeg;base64,AAAA'),
  clearScanSession: storeMocks.clearScanSession,
  rotateStoredPage: vi.fn().mockResolvedValue(undefined),
  deleteStoredPage: vi.fn().mockResolvedValue(undefined),
  duplicateStoredPage: vi.fn().mockResolvedValue(undefined),
  loadOriginalBlobFromDisk: vi.fn().mockResolvedValue(null),
  loadPageCanvasFromDisk: vi.fn().mockResolvedValue(null),
  saveActiveSessionPages: storeMocks.saveActiveSessionPages,
  getActiveSessionPages: () => storeMocks.draftPages,
  clearActiveSessionPages: storeMocks.clearActiveSessionPages,
}));

vi.mock('./core/wasmEngine', () => ({
  terminateScannerWorker: vi.fn(),
  runWasmMotionAndSharpness: vi.fn().mockResolvedValue(null),
  runWasmFilter: vi.fn().mockResolvedValue(null),
  runWasmPerspectiveWarp: vi.fn().mockResolvedValue(null),
}));

vi.mock('./core/ocr/ocrEngine', () => ({
  terminateOcrWorker: vi.fn().mockResolvedValue(undefined),
}));

let root: Root;
let host: HTMLDivElement;

describe('ScannerModal', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    storeMocks.draftPages = null;
    storeMocks.clearScanSession.mockReset().mockResolvedValue(undefined);
    storeMocks.clearActiveSessionPages.mockClear();
    storeMocks.saveActiveSessionPages.mockReset().mockReturnValue(true);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders nothing when closed and opens dialog on camera step when empty', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <ScannerModal isOpen={false} onClose={onClose} onPdfGenerated={vi.fn()} />
      );
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => {
      root.render(
        <ScannerModal isOpen={true} onClose={onClose} onPdfGenerated={vi.fn()} />
      );
    });

    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-label')).toBe('ماسح المستندات الضوئي');

    const closeBtn = host.querySelector<HTMLButtonElement>('button[aria-label="إغلاق الماسح الضوئي"]');
    if (!closeBtn) throw new Error('Missing close button');
    await act(async () => closeBtn.click());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(storeMocks.clearScanSession).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('restores saved draft pages on review step and prompts before discarding on Escape', async () => {
    storeMocks.draftPages = [
      {
        id: 'draft-1',
        thumbnailDataUrl: 'data:image/jpeg;base64,AAAA',
        quad: {
          topLeft: { x: 0, y: 0 },
          topRight: { x: 100, y: 0 },
          bottomRight: { x: 100, y: 140 },
          bottomLeft: { x: 0, y: 140 },
        },
        filter: 'magic',
        timestamp: 1000,
      },
    ];
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <ScannerModal isOpen={true} lang="ar" onClose={onClose} onPdfGenerated={vi.fn()} />
      );
    });

    expect(host.textContent).toContain('صفحة 1 من 1');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(host.textContent).toContain('إغلاق جلسة المسح؟');
    expect(onClose).not.toHaveBeenCalled();

    const saveDraftBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('حفظ كمسودة ومغادرة')
    );
    if (!saveDraftBtn) throw new Error('Missing save-draft button');
    await act(async () => saveDraftBtn.click());
    expect(storeMocks.saveActiveSessionPages).toHaveBeenCalledWith(storeMocks.draftPages);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
