// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeIdCardSidesToA4 } from './idCard';

const engineMocks = vi.hoisted(() => ({
  canvasToPngBytes: vi.fn<() => Promise<Uint8Array | null>>(),
  stitchIdCardWithRust: vi.fn<() => Promise<Uint8Array | null>>(),
  drawPngBytesOnCanvas: vi.fn<() => Promise<boolean>>(),
}));

vi.mock('../../platform/rustEngine', () => ({
  canvasToPngBytes: engineMocks.canvasToPngBytes,
  stitchIdCardWithRust: engineMocks.stitchIdCardWithRust,
  drawPngBytesOnCanvas: engineMocks.drawPngBytesOnCanvas,
}));

function makeFakeContext() {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
    fillRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    clip: vi.fn(),
    roundRect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arcTo: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
  };
}

describe('mergeIdCardSidesToA4', () => {
  let fakeCtx: ReturnType<typeof makeFakeContext>;

  beforeEach(() => {
    fakeCtx = makeFakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      fakeCtx as unknown as CanvasRenderingContext2D
    );
    engineMocks.canvasToPngBytes.mockReset();
    engineMocks.stitchIdCardWithRust.mockReset();
    engineMocks.drawPngBytesOnCanvas.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses native Rust stitcher when available in desktop/Android runtime', async () => {
    const front = document.createElement('canvas');
    front.width = 600;
    front.height = 400;
    const back = document.createElement('canvas');
    back.width = 600;
    back.height = 400;

    engineMocks.canvasToPngBytes
      .mockResolvedValueOnce(new Uint8Array([1, 2, 3]))
      .mockResolvedValueOnce(new Uint8Array([4, 5, 6]));
    engineMocks.stitchIdCardWithRust.mockResolvedValueOnce(new Uint8Array([9, 8, 7]));
    engineMocks.drawPngBytesOnCanvas.mockResolvedValueOnce(true);

    const out = await mergeIdCardSidesToA4(front, back);
    expect(out.width).toBe(2480);
    expect(out.height).toBe(3508);
    expect(engineMocks.stitchIdCardWithRust).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4, 5, 6])
    );
    expect(engineMocks.drawPngBytesOnCanvas).toHaveBeenCalledTimes(1);
    expect(fakeCtx.fillText).not.toHaveBeenCalled();
  });

  it('falls back cleanly to Canvas 2D compositor when Rust bridge returns null', async () => {
    const front = document.createElement('canvas');
    front.width = 800;
    front.height = 500;
    const back = document.createElement('canvas');
    back.width = 800;
    back.height = 500;

    engineMocks.canvasToPngBytes.mockResolvedValue(new Uint8Array([1, 2]));
    engineMocks.stitchIdCardWithRust.mockResolvedValueOnce(null);

    const out = await mergeIdCardSidesToA4(front, back);
    expect(out.width).toBe(2480);
    expect(out.height).toBe(3508);
    expect(fakeCtx.fillRect).toHaveBeenCalledWith(0, 0, 2480, 3508);
    expect(fakeCtx.drawImage).toHaveBeenCalledTimes(2);
    expect(fakeCtx.drawImage).toHaveBeenCalledWith(front, 735, expect.any(Number), 1010, 631.25);
    expect(fakeCtx.drawImage).toHaveBeenCalledWith(back, 735, expect.any(Number), 1010, 631.25);
  });

  it('catches native stitcher errors and renders via Canvas 2D fallback', async () => {
    const front = document.createElement('canvas');
    front.width = 400;
    front.height = 250;
    const back = document.createElement('canvas');
    back.width = 400;
    back.height = 250;

    engineMocks.canvasToPngBytes.mockRejectedValueOnce(new Error('IPC unavailable'));

    const out = await mergeIdCardSidesToA4(front, back);
    expect(out.width).toBe(2480);
    expect(out.height).toBe(3508);
    expect(fakeCtx.drawImage).toHaveBeenCalledTimes(2);
  });
});
