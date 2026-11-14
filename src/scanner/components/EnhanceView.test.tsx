// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScannedPage } from '../core/types';
import { extractPageTextAndMetadata } from '../core/ocr/ocrEngine';
import { loadPageCanvasFromDisk } from '../core/storage/pageStore';
import { EnhanceView } from './EnhanceView';

vi.mock('../core/storage/pageStore', () => ({
  loadPageCanvasFromDisk: vi.fn().mockResolvedValue(null),
}));

vi.mock('../core/ocr/ocrEngine', () => ({
  extractPageTextAndMetadata: vi.fn(),
  terminateOcrWorker: vi.fn().mockResolvedValue(undefined),
}));

let root: Root;
let host: HTMLDivElement;

const samplePages: ScannedPage[] = [
  {
    id: 'page-1',
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
  {
    id: 'page-2',
    thumbnailDataUrl: 'data:image/jpeg;base64,BBBB',
    quad: {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 100, y: 0 },
      bottomRight: { x: 100, y: 140 },
      bottomLeft: { x: 0, y: 140 },
    },
    filter: 'magic',
    timestamp: 2000,
  },
];

function makeEnhanceProps(pages: ScannedPage[] = samplePages) {
  return {
    pages,
    onBackToCamera: vi.fn(),
    onAddMorePages: vi.fn(),
    onDeletePage: vi.fn(),
    onMovePage: vi.fn(),
    onRetakePage: vi.fn(),
    onRotatePage: vi.fn().mockResolvedValue(undefined),
    onResetAll: vi.fn(),
  };
}

describe('EnhanceView', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders empty state gracefully when no scanned pages exist', async () => {
    await act(async () => {
      root.render(<EnhanceView {...makeEnhanceProps([])} />);
    });
    expect(host.textContent).toContain('No scanned pages available');
  });

  it('displays page counter, toggles grid view, edits document title, and confirms reset-all', async () => {
    const props = makeEnhanceProps();
    await act(async () => {
      root.render(<EnhanceView {...props} />);
    });

    expect(host.textContent).toContain('صفحة 1 من 2');

    // Rename document title inline
    const titleBtn = host.querySelector<HTMLButtonElement>('button[title="تعديل اسم المستند"]');
    if (!titleBtn) throw new Error('Missing rename button');
    await act(async () => titleBtn.click());
    const input = host.querySelector<HTMLInputElement>('input[type="text"]');
    if (!input) throw new Error('Missing title input');
    expect(input.value).toContain('Otium_Doc_');

    // Toggle grid view and confirm bottom dock hides
    const gridBtn = host.querySelector<HTMLButtonElement>('button[title="عرض شبكي"]');
    if (!gridBtn) throw new Error('Missing grid toggle button');
    await act(async () => gridBtn.click());
    await act(async () => gridBtn.click());

    // Back to camera
    const backBtn = host.querySelector<HTMLButtonElement>('button[title="رجوع للكاميرا"]');
    if (!backBtn) throw new Error('Missing back button');
    await act(async () => backBtn.click());
    expect(props.onBackToCamera).toHaveBeenCalledTimes(1);

    // Open cancel-all modal and confirm reset
    const cancelAllBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('إلغاء الكل')
    );
    if (!cancelAllBtn) throw new Error('Missing cancel-all button');
    await act(async () => cancelAllBtn.click());
    expect(host.textContent).toContain('حذف كافة الصور والعودة للرئيسية؟');

    const confirmReset = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('نعم، حذف الكل')
    );
    if (!confirmReset) throw new Error('Missing confirm reset button');
    await act(async () => confirmReset.click());
    expect(props.onResetAll).toHaveBeenCalledTimes(1);
  });

  it('keeps the scan visible and allows another OCR attempt after recognition fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const canvas = document.createElement('canvas');
    const preview = 'data:image/jpeg;base64,AAAA';
    vi.spyOn(canvas, 'toDataURL').mockReturnValue(preview);
    const loadPage = vi.mocked(loadPageCanvasFromDisk).mockResolvedValue(canvas);
    const recognition = Promise.withResolvers<Awaited<ReturnType<typeof extractPageTextAndMetadata>>>();
    vi.mocked(extractPageTextAndMetadata)
      .mockReturnValueOnce(recognition.promise)
      .mockResolvedValueOnce({ text: 'Recovered text', words: [] });
    try {
      await act(async () => root.render(<EnhanceView {...makeEnhanceProps(samplePages.slice(0, 1))} />));
      const ocr = host.querySelector<HTMLButtonElement>('button[title*="(OCR)"]');
      if (!ocr) throw new Error('Missing OCR button');
      await act(async () => ocr.click());
      expect(ocr.disabled).toBe(true);
      await act(async () => { recognition.reject(new Error('Worker failed')); });
      expect(ocr.disabled).toBe(false);
      expect(host.textContent).toContain('تعذّر استخراج النص');
      expect(host.querySelector('img')?.getAttribute('src')).toBe(preview);
      await act(async () => ocr.click());
      expect(host.textContent).toContain('Recovered text');
      expect(ocr.disabled).toBe(false);
      expect(extractPageTextAndMetadata).toHaveBeenCalledTimes(2);
    } finally {
      loadPage.mockReset();
    }
  });
});
