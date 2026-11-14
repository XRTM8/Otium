// @vitest-environment happy-dom
import { act, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReaderViewportAndZoom } from './useReaderViewportAndZoom';

describe('useReaderViewportAndZoom', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it('computes optimal fit scale, min/max zoom bounds, and pinch distance transitions cleanly', async () => {
    const ref: { current: ReturnType<typeof useReaderViewportAndZoom> | null } = { current: null };

    function Harness() {
      const currentPageRef = useRef(1);
      const docIdRef = useRef('doc-vp-1');
      const pageSaveTimerRef = useRef<number | null>(null);
      const actionsRef = useRef({
        goToNextPage: vi.fn(),
        goToPrevPage: vi.fn(),
      });
      const hook = useReaderViewportAndZoom({
        doc: null,
        viewMode: 'single',
        basePageSize: { width: 600, height: 800 },
        chromeInset: 0,
        keyboardCapable: true,
        currentPageRef,
        docIdRef,
        pageSaveTimerRef,
        actionsRef,
      });
      useEffect(() => {
        ref.current = hook;
      });
      return <div />;
    }

    await act(async () => {
      root.render(<Harness />);
    });

    act(() => {
      ref.current!.scrollContainerRef.current = host;
    });

    expect(ref.current).not.toBeNull();
    const fit = ref.current!.getFitScale();
    expect(fit).toBeGreaterThan(0);
    expect(ref.current!.getMinZoom()).toBeLessThan(fit);
    expect(ref.current!.getMaxZoom()).toBeGreaterThanOrEqual(3.5);

    await act(async () => {
      ref.current!.setZoom(1.5);
    });
    expect(ref.current!.zoom).toBe(1.5);

    act(() => {
      ref.current!.captureZoomAnchor(10, 10);
      ref.current!.clearZoomAnchor();
    });
  });
});
