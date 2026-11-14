// @vitest-environment happy-dom
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePdfPageRender } from './usePdfPageRender';

const hookMocks = vi.hoisted(() => ({
  shouldFail: false,
  renderCalls: 0,
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

describe('usePdfPageRender', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    hookMocks.shouldFail = false;
    hookMocks.renderCalls = 0;
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
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      filter: 'none',
      setTransform: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      clearRect: vi.fn(),
    }) as unknown as CanvasRenderingContext2D);
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

  it('probes page dimensions, renders when visible, and clears errors on retryRender', async () => {
    const doc = {
      numPages: 1,
      getPage: vi.fn(async () => {
        hookMocks.renderCalls += 1;
        if (hookMocks.shouldFail) {
          throw new Error('decode failed');
        }
        return {
          getViewport: ({ scale }: { scale: number }) => ({ width: 612 * scale, height: 792 * scale }),
          render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
          getTextContent: async () => ({ items: [] }),
          cleanup: vi.fn(),
        };
      }),
    } as unknown as PDFDocumentProxy;

    const apiRef: { current: Omit<ReturnType<typeof usePdfPageRender>, 'containerRef' | 'canvasRef' | 'textLayerRef' | 'annotationCanvasRef'> | null } = { current: null };

    function Harness() {
      const {
        containerRef,
        canvasRef,
        textLayerRef,
        annotationCanvasRef,
        isVisible,
        hasRenderedOnce,
        renderError,
        dimensions,
        pageSize,
        isDark,
        cssThemeFilter,
        retryRender,
      } = usePdfPageRender({
        doc,
        pageNumber: 1,
        scale: 1,
        theme: 'paper',
        baseAspectRatio: 612 / 792,
        renderPriority: 1,
      });

      useEffect(() => {
        apiRef.current = {
          isVisible,
          hasRenderedOnce,
          renderError,
          dimensions,
          pageSize,
          isDark,
          cssThemeFilter,
          retryRender,
        };
      }, [isVisible, hasRenderedOnce, renderError, dimensions, pageSize, isDark, cssThemeFilter, retryRender]);

      return (
        <div ref={containerRef}>
          <canvas ref={canvasRef} />
          <div ref={textLayerRef} />
          <canvas ref={annotationCanvasRef} />
        </div>
      );
    }

    hookMocks.shouldFail = true;
    await act(async () => {
      root.render(<Harness />);
    });
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 15));
      });
    }

    expect(apiRef.current?.renderError).toBeTruthy();

    hookMocks.shouldFail = false;
    await act(async () => {
      apiRef.current?.retryRender();
    });
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 15));
      });
    }

    expect(apiRef.current?.renderError).toBeNull();
    expect(apiRef.current?.hasRenderedOnce).toBe(true);
    expect(apiRef.current?.pageSize.width).toBeGreaterThan(0);
    expect(apiRef.current?.dimensions.height).toBeGreaterThan(0);
  });

  it('updates unscaled pageSize from doc.getPage viewport', async () => {
    const doc = {
      numPages: 1,
      getPage: vi.fn(async () => ({
        getViewport: ({ scale }: { scale: number }) => ({ width: 612 * scale, height: 792 * scale }),
        render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
        getTextContent: async () => ({ items: [] }),
        cleanup: vi.fn(),
      })),
    } as unknown as PDFDocumentProxy;

    let latestSize = { width: 0, height: 0 };
    function SizeHarness() {
      const { containerRef, canvasRef, textLayerRef, annotationCanvasRef, pageSize } = usePdfPageRender({
        doc,
        pageNumber: 1,
        scale: 1,
        theme: 'paper',
        baseAspectRatio: 595 / 842,
        renderPriority: 1,
      });
      useEffect(() => {
        latestSize = pageSize;
      }, [pageSize]);
      return (
        <div ref={containerRef}>
          <canvas ref={canvasRef} />
          <div ref={textLayerRef} />
          <canvas ref={annotationCanvasRef} />
        </div>
      );
    }

    await act(async () => {
      root.render(<SizeHarness />);
    });
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 15));
      });
    }
    expect(latestSize).toEqual({ width: 612, height: 792 });
  });
});
