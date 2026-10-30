import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./worker', () => ({ pdfjsLib: { getDocument: vi.fn() } }));
import { pdfjsLib } from './worker';
import { openPdf } from './document';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('PDF resources on deployed application paths', () => {
  it.each([
    ['https://xrtm8.github.io/Otium/#/beam?room=1234', './', 'https://xrtm8.github.io/Otium/'],
    ['http://tauri.localhost/', './', 'http://tauri.localhost/'],
    ['http://localhost:5173/', '/', 'http://localhost:5173/']
  ])('loads decoder and font resources beside the application at %s', async (href, base, expected) => {
    vi.stubGlobal('window', { location: { href } });
    vi.stubEnv('BASE_URL', base);
    const getDocument = vi.mocked(pdfjsLib.getDocument);
    getDocument.mockReturnValue({ promise: Promise.resolve({
      numPages: 1, getPage: async () => ({ getViewport: () => ({ width: 595, height: 842 }), cleanup() {} })
    }) } as any);
    const pdf = new TextEncoder().encode('%PDF-1.4\n').buffer;
    await openPdf(pdf, { onPassword() {} }).promise;
    expect(getDocument).toHaveBeenCalledWith(expect.objectContaining({
      wasmUrl: `${expected}wasm/`, cMapUrl: `${expected}cmaps/`, standardFontDataUrl: `${expected}standard_fonts/`
    }));
  });
});
