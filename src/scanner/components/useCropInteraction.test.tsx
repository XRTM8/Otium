// @vitest-environment happy-dom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Quad } from '../core/types';
import * as geometry from '../core/geometry';
import { useCropInteraction } from './useCropInteraction';

vi.mock('../core/edgeDetection', () => ({
  detectDocumentCorners: vi.fn(() => null),
  getFullFrameQuad: vi.fn((w: number, h: number): Quad => [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ]),
}));

describe('useCropInteraction', () => {
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

  async function mountCrop(onConfirm = vi.fn()) {
    const ref: { current: ReturnType<typeof useCropInteraction> | null } = { current: null };
    const mockImg = document.createElement('img');
    Object.defineProperty(mockImg, 'naturalWidth', { value: 1000, configurable: true });
    Object.defineProperty(mockImg, 'naturalHeight', { value: 800, configurable: true });
    Object.defineProperty(mockImg, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 500, height: 400, right: 500, bottom: 400 }),
      configurable: true,
    });

    function Harness() {
      const hook = useCropInteraction({
        imageSrc: 'data:image/png;base64,AAAA',
        onConfirm,
      });
      useEffect(() => {
        ref.current = hook;
      });
      return <div />;
    }

    await act(async () => {
      root.render(<Harness />);
    });

    await act(async () => {
      ref.current!.imageRef.current = mockImg;
      ref.current!.handleImageLoad();
    });
    return ref;
  }

  it('initializes quad from loaded image dimensions and supports full-frame selection and undo/redo', async () => {
    const ref = await mountCrop();
    expect(ref.current!.imageSize).toEqual({ width: 1000, height: 800 });
    expect(ref.current!.quad).not.toBeNull();
    const initialQuad = ref.current!.quad;

    await act(async () => { ref.current!.handleSelectFullImage(); });
    expect(ref.current!.undoStack).toEqual([initialQuad]);

    await act(async () => { ref.current!.handleUndo(); });
    expect(ref.current!.quad).toEqual(initialQuad);
    expect(ref.current!.redoStack).toHaveLength(1);

    await act(async () => { ref.current!.handleRedo(); });
    expect(ref.current!.quad).toEqual(initialQuad);
    expect(ref.current!.redoStack).toHaveLength(0);
  });

  it('keeps the source and crop geometry when saving fails, then retries the same image', async () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(geometry, 'warpPerspectiveAsync').mockResolvedValue(canvas);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pending = Promise.withResolvers<void>();
    const confirm = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(undefined);
    const ref = await mountCrop(confirm);
    const { currentSrc, quad } = ref.current!;
    let saving: Promise<void> | undefined;
    await act(async () => { saving = ref.current!.handleApply(); });
    expect(ref.current!.isApplying).toBe(true);
    await act(async () => {
      pending.reject(new Error('Quota exceeded'));
      await saving;
    });
    expect(ref.current).toMatchObject({ currentSrc, quad, isApplying: false, applyError: true });
    await act(async () => { await ref.current!.handleApply(); });
    expect(confirm.mock.calls).toEqual([[canvas, quad, currentSrc], [canvas, quad, currentSrc]]);
    expect(ref.current).toMatchObject({ currentSrc, quad, isApplying: false, applyError: false });
  });
});
