import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractPageTextAndMetadata, performOcr, preloadOcrLanguage, resolveOcrAssetBase, terminateOcrWorker } from './ocrEngine';

const createWorker = vi.hoisted(() => vi.fn());
vi.mock('tesseract.js', () => ({ createWorker }));

afterEach(async () => {
  await terminateOcrWorker();
  createWorker.mockReset();
  vi.unstubAllGlobals();
});

describe('resolveOcrAssetBase', () => {
  it('resolves relative to GitHub Pages subpath without escaping to root origin', () => {
    expect(
      resolveOcrAssetBase(
        'https://xrtm8.github.io/Otium/',
        'https://xrtm8.github.io/Otium/'
      )
    ).toBe('https://xrtm8.github.io/Otium/tesseract');

    expect(
      resolveOcrAssetBase(
        'https://xrtm8.github.io/Otium/index.html?view=scan#ocr',
        'https://xrtm8.github.io/Otium/index.html?view=scan#ocr'
      )
    ).toBe('https://xrtm8.github.io/Otium/tesseract');
  });

  it('resolves cleanly on Tauri desktop and Vite dev URLs', () => {
    expect(
      resolveOcrAssetBase('', 'http://tauri.localhost/index.html')
    ).toBe('http://tauri.localhost/tesseract');

    expect(
      resolveOcrAssetBase('http://localhost:5173/', 'http://localhost:5173/')
    ).toBe('http://localhost:5173/tesseract');
  });
});

const page = { width: 100, height: 200 } as HTMLCanvasElement;

function recognizingWorker(text: string) {
  return {
    terminate: vi.fn(async () => undefined),
    recognize: vi.fn(async () => ({ data: {
      text,
      blocks: [{ paragraphs: [{ lines: [{ words: [{ text: text.trim(), bbox: { x0: 10, y0: 20, x1: 40, y1: 50 } }] }] }] }],
    } })),
  };
}

describe('OCR recovery', () => {
  it('replaces a worker that failed recognition and reads the same page on retry', async () => {
    const broken = recognizingWorker('');
    broken.recognize.mockRejectedValueOnce(new Error('Recognition failed'));
    const recovered = recognizingWorker(' Invoice ');
    createWorker.mockResolvedValueOnce(broken).mockResolvedValueOnce(recovered);
    await expect(extractPageTextAndMetadata(page)).rejects.toThrow('Recognition failed');
    expect(broken.terminate).toHaveBeenCalledOnce();
    await expect(extractPageTextAndMetadata(page)).resolves.toEqual({
      text: 'Invoice', suggestedTitle: 'Invoice',
      words: [{ text: 'Invoice', x: 0.1, y: 0.1, width: 0.3, height: 0.15 }],
    });
    expect(recovered.recognize).toHaveBeenCalledWith(page, {}, { blocks: true });
  });

  it('times out a stalled worker and keeps image-only PDF export available', async () => {
    const stalled = recognizingWorker('');
    stalled.recognize.mockImplementation(() => new Promise(() => {}));
    const recovered = recognizingWorker('Recovered');
    createWorker.mockResolvedValueOnce(stalled).mockResolvedValueOnce(recovered);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(performOcr(page, 'eng', 25)).resolves.toEqual([]);
    expect(stalled.terminate).toHaveBeenCalledOnce();
    await expect(extractPageTextAndMetadata(page, 'eng')).resolves.toMatchObject({ text: 'Recovered' });
  });

  it('reports an uncached language offline and preloads it after reconnecting', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await expect(extractPageTextAndMetadata(page, 'fra')).rejects.toThrow('unavailable offline');
    expect(createWorker).not.toHaveBeenCalled();
    vi.stubGlobal('navigator', { onLine: true });
    const worker = recognizingWorker('Bonjour');
    createWorker.mockResolvedValueOnce(worker);
    expect(await preloadOcrLanguage('fra')).toBe(true);
    await expect(extractPageTextAndMetadata(page, 'fra')).resolves.toMatchObject({ text: 'Bonjour' });
    expect(createWorker).toHaveBeenCalledOnce();
  });
});
