// @vitest-environment happy-dom
import { act, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCameraCapture } from './useCameraCapture';
import { analyzeLiveVideoFrame, tryTakeCameraPhoto } from './cameraCaptureHelpers';

vi.mock(import('./cameraCaptureHelpers'), async (load) => ({
  ...await load(),
  analyzeLiveVideoFrame: vi.fn(),
  tryTakeCameraPhoto: vi.fn(),
}));

describe('useCameraCapture', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.spyOn(HTMLMediaElement.prototype, 'srcObject', 'set').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
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

  async function mountCamera(autoCapture = false, onCapture = vi.fn()) {
    const ref: { current: ReturnType<typeof useCameraCapture> | null } = { current: null };
    const setTorchOn = vi.fn();
    function Harness() {
      const fileInputRef = useRef<HTMLInputElement | null>(null);
      const hook = useCameraCapture({
        cropMode: 'auto',
        viewfinderFit: 'cover',
        autoCapture,
        facingMode: 'environment',
        scanMode: 'document',
        idCardStep: 'front',
        setIdCardStep: vi.fn(),
        idFront: null,
        setIdFront: vi.fn(),
        setIdStatusToast: vi.fn(),
        setCaptureToast: vi.fn(),
        setTorchOn,
        triggerHaptic: vi.fn(),
        fileInputRef,
        onCapture,
      });
      useEffect(() => {
        ref.current = hook;
      });
      const { videoRef } = hook;
      return <video ref={videoRef} />;
    }

    await act(async () => {
      root.render(<Harness />);
    });
    return ref;
  }

  it('marks permission denied gracefully when camera mediaDevices API is unavailable', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    const ref = await mountCamera();
    expect(ref.current?.hasPermission).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('stops after a permission denial and recovers on a user retry', async () => {
    const retry = Promise.withResolvers<MediaStream>();
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as Partial<MediaStream> as MediaStream;
    const getUserMedia = vi.fn()
      .mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'))
      .mockReturnValueOnce(retry.promise);
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    const ref = await mountCamera();
    expect(ref.current).toMatchObject({ hasPermission: false, stream: null, capturing: false });
    expect(getUserMedia).toHaveBeenCalledOnce();
    let request: Promise<void> | undefined;
    await act(async () => { request = ref.current?.initCamera(); });
    expect(ref.current?.hasPermission).toBeNull();
    await act(async () => {
      retry.resolve(stream);
      await request;
    });
    expect(ref.current).toMatchObject({ hasPermission: true, stream });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(stop).not.toHaveBeenCalled();
  });

  it('stops the stream returned by an older request after a newer retry succeeds', async () => {
    const initial = Promise.withResolvers<MediaStream>();
    const stopOld = vi.fn();
    const oldStream = { getTracks: () => [{ stop: stopOld }] } as Partial<MediaStream> as MediaStream;
    const newStream = { getTracks: () => [] } as Partial<MediaStream> as MediaStream;
    const getUserMedia = vi.fn().mockReturnValueOnce(initial.promise).mockResolvedValueOnce(newStream);
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    const ref = await mountCamera();
    await act(async () => { await ref.current?.initCamera(); });
    await act(async () => { initial.resolve(oldStream); });
    expect(stopOld).toHaveBeenCalledOnce();
    expect(ref.current?.stream).toBe(newStream);
  });
  it('waits for stable corners and a new page before auto-capturing again', async () => {
    vi.useFakeTimers();
    try {
      const stop = vi.fn();
      const stream = { getTracks: () => [{ stop }] };
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
        configurable: true,
      });
      const image = new Blob(['image'], { type: 'image/jpeg' });
      vi.mocked(tryTakeCameraPhoto).mockResolvedValue(image);
      const frame = {
        quad: { topLeft: { x: 10, y: 10 }, topRight: { x: 100, y: 10 }, bottomLeft: { x: 10, y: 150 }, bottomRight: { x: 100, y: 150 } },
        motionScore: 0,
        reliableCrop: true,
        sharpness: 40,
        nextLum: null,
        pageSignature: new Int8Array(196),
      };
      const analyze = vi.mocked(analyzeLiveVideoFrame);
      analyze.mockResolvedValue({ ...frame, quad: null, pageSignature: null });
      const onCapture = vi.fn().mockResolvedValue(1);
      const ref = await mountCamera(true, onCapture);
      const video = ref.current!.videoRef.current!;
      Object.defineProperties(video, {
        readyState: { value: 4 },
        videoWidth: { value: 200 },
        videoHeight: { value: 300 },
      });
      const ticks = async (count: number) => {
        for (let i = 0; i < count; i++) {
          await act(async () => { await vi.advanceTimersByTimeAsync(220); });
        }
      };
      await ticks(5);
      expect(onCapture).not.toHaveBeenCalled();
      analyze.mockResolvedValue({ ...frame, reliableCrop: false });
      await ticks(5);
      expect(onCapture).not.toHaveBeenCalled();
      analyze.mockResolvedValue({ ...frame, quad: null, pageSignature: null });
      await ticks(1);
      analyze.mockResolvedValue(frame);
      await ticks(3);
      expect(onCapture).not.toHaveBeenCalled();
      await ticks(1);
      expect(onCapture).toHaveBeenCalledExactlyOnceWith([image], true);
      await ticks(6);
      expect(onCapture).toHaveBeenCalledTimes(1);
      const changed = { ...frame, pageSignature: new Int8Array(196).fill(1) };
      analyze.mockResolvedValue(changed);
      await ticks(1);
      analyze.mockResolvedValue(frame);
      await ticks(4);
      expect(onCapture).toHaveBeenCalledTimes(1);
      analyze.mockResolvedValue(changed);
      await ticks(4);
      expect(onCapture).toHaveBeenCalledTimes(2);
      analyze.mockResolvedValue({ ...frame, quad: null, pageSignature: null });
      await ticks(2);
      analyze.mockResolvedValue(frame);
      await ticks(4);
      expect(onCapture).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

});
