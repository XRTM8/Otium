// @vitest-environment happy-dom
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReaderController } from '../app/useReaderController';
import { DocumentInkProvider } from './DocumentInk';
import { PdfPage } from './PdfPage';
import { TeachingProvider } from './TeachingContext';

const pdfMocks = vi.hoisted(() => ({
  failGetPage: false,
  getPageCalls: 0,
  cleanupCalls: 0,
}));

vi.mock('pdfjs-dist', () => ({
  TextLayer: class {
    async render() {}
  },
}));

vi.mock('../core/reader/device', () => ({
  getCanvasPixelRatio: () => 1,
}));

vi.mock('../core/reader/renderScheduler', () => ({
  scheduleRender: (_priority: number, task: () => void) => {
    const id = setTimeout(task, 0);
    return () => clearTimeout(id);
  },
  scheduleIdleWork: (task: () => void) => {
    const id = setTimeout(task, 0);
    return () => clearTimeout(id);
  },
}));

function fakeReader(): ReaderController {
  return {
    doc: {},
    docId: 'doc-pdf-test',
    docTitle: 'Lesson',
    annotations: [],
    annotationSaveStatus: 'saved',
    currentPage: 1,
    numPages: 2,
    theme: 'paper',
    lang: 'ar',
    beamRoom: null,
    beamPeerConnected: false,
    receiveBeamSelection: vi.fn(),
    mergeRemoteAnnotations: vi.fn(),
    scrollContainerRef: { current: null },
    closeDocument: vi.fn(),
    goToPrevPage: vi.fn(),
    goToNextPage: vi.fn(),
    setIsImmersive: vi.fn(),
  } as unknown as ReaderController;
}

function fakePdfDoc(): PDFDocumentProxy {
  return {
    numPages: 2,
    getPage: vi.fn(async () => {
      pdfMocks.getPageCalls += 1;
      if (pdfMocks.failGetPage) {
        throw new Error('corrupt stream');
      }
      return {
        getViewport: ({ scale }: { scale: number }) => ({ width: 595 * scale, height: 842 * scale }),
        render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
        getTextContent: async () => ({ items: [{ str: 'مرحبا' }] }),
        cleanup: () => {
          pdfMocks.cleanupCalls += 1;
        },
      };
    }),
  } as unknown as PDFDocumentProxy;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  pdfMocks.failGetPage = false;
  pdfMocks.getPageCalls = 0;
  pdfMocks.cleanupCalls = 0;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private cb: IntersectionObserverCallback;
      constructor(cb: IntersectionObserverCallback) {
        this.cb = cb;
      }
      observe(target: Element) {
        this.cb(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver
        );
      }
      disconnect() {}
      unobserve() {}
    }
  );
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    filter: 'none',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
    setTransform: vi.fn(),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
  }) as unknown as CanvasRenderingContext2D);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function flushRender() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

describe('PdfPage', () => {
  it('renders page canvas, reveals it after completion, and calls page.cleanup', async () => {
    const doc = fakePdfDoc();
    await act(async () => {
      root.render(
        <TeachingProvider>
          <DocumentInkProvider reader={fakeReader()}>
            <PdfPage
              doc={doc}
              pageNumber={1}
              scale={1}
              theme="paper"
              baseAspectRatio={595 / 842}
              lang="ar"
            />
          </DocumentInkProvider>
        </TeachingProvider>
      );
    });

    await flushRender();
    const canvas = host.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.style.opacity).toBe('1');
    expect(pdfMocks.cleanupCalls).toBeGreaterThanOrEqual(1);
    expect(host.querySelector('[data-page-number="1"]')).not.toBeNull();
  });

  it('shows retry UI on page render error and recovers when retry is clicked', async () => {
    pdfMocks.failGetPage = true;
    const doc = fakePdfDoc();
    await act(async () => {
      root.render(
        <TeachingProvider>
          <DocumentInkProvider reader={fakeReader()}>
            <PdfPage
              doc={doc}
              pageNumber={1}
              scale={1}
              theme="paper"
              baseAspectRatio={595 / 842}
              lang="ar"
            />
          </DocumentInkProvider>
        </TeachingProvider>
      );
    });

    await flushRender();
    expect(host.textContent).toContain('تعذر تحميل صفحة 1');

    const retryBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('إعادة المحاولة')
    );
    expect(retryBtn).toBeDefined();

    pdfMocks.failGetPage = false;
    await act(async () => {
      retryBtn!.click();
    });
    await flushRender();
    expect(host.textContent).not.toContain('تعذر تحميل صفحة 1');
    expect(host.querySelector('canvas')?.style.opacity).toBe('1');
  });
});
