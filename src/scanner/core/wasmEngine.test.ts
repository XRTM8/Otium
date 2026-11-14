import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resolveWasmAssetUrl,
  runWasmDewarpSpine,
  runWasmFilter,
  runWasmMotionAndSharpness,
  runWasmWarpPerspective,
  terminateScannerWorker,
} from './wasmEngine';

afterEach(() => {
  terminateScannerWorker();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Rust scanner WASM engine helpers', () => {
  it('resolves subpath-safe WASM URLs for GitHub Pages and local origins', () => {
    expect(resolveWasmAssetUrl('https://xrtm8.github.io/Otium/', '')).toBe(
      'https://xrtm8.github.io/Otium/wasm/otium_wasm.wasm'
    );
    expect(resolveWasmAssetUrl('https://xrtm8.github.io/Otium/?room=OTM-1234', '')).toBe(
      'https://xrtm8.github.io/Otium/wasm/otium_wasm.wasm'
    );
    expect(resolveWasmAssetUrl('', 'http://localhost:4173/index.html')).toBe(
      'http://localhost:4173/wasm/otium_wasm.wasm'
    );
    expect(resolveWasmAssetUrl('', '')).toBe('./wasm/otium_wasm.wasm');
  });

  it('falls back to null safely in headless Node without Web Workers', async () => {
    const rgba = new Uint8ClampedArray(16 * 16 * 4).fill(200);
    expect(await runWasmFilter(rgba, 16, 16, 'original')).toBeNull();
    expect(await runWasmFilter(rgba, 16, 16, 'clean')).toBeNull();
    expect(
      await runWasmWarpPerspective(rgba, 16, 16, 8, 8, {
        topLeft: { x: 0, y: 0 },
        topRight: { x: 16, y: 0 },
        bottomRight: { x: 16, y: 16 },
        bottomLeft: { x: 0, y: 16 },
      })
    ).toBeNull();
    expect(await runWasmDewarpSpine(rgba, 16, 16, 0.5, 0.5)).toBeNull();
    expect(await runWasmMotionAndSharpness(rgba, 16, 16)).toBeNull();
  });

  it('falls back after a worker crash and creates a new worker for a later scan', async () => {
    const workers: TestWorker[] = [];
    class TestWorker {
      onerror?: () => void;
      onmessage?: (event: { data: { id: number; ok: boolean; buffer: ArrayBuffer } }) => void;
      terminate = vi.fn();
      postMessage = vi.fn<(request: { id: number }) => void>();
      constructor() { workers.push(this); }
    }
    vi.stubGlobal('Worker', TestWorker);
    vi.useFakeTimers({ toFake: ['Date'] });
    const first = runWasmFilter(new Uint8ClampedArray(16), 2, 2, 'magic');
    const crashed = workers[0];
    if (!crashed) throw new Error('Worker did not start');
    crashed.onerror?.();
    expect(await first).toBeNull();
    expect(crashed.terminate).toHaveBeenCalledOnce();
    expect(await runWasmFilter(new Uint8ClampedArray(16), 2, 2, 'magic')).toBeNull();
    expect(workers).toHaveLength(1);

    vi.setSystemTime(Date.now() + 1000);
    const retry = runWasmFilter(new Uint8ClampedArray(16), 2, 2, 'magic');
    const replacement = workers[1];
    const request = replacement?.postMessage.mock.calls[0]?.[0];
    if (!replacement || !request) throw new Error('Replacement did not receive the scan');
    const pixels = new Uint8ClampedArray(16).fill(200);
    replacement.onmessage?.({ data: { id: request.id, ok: true, buffer: pixels.buffer } });
    expect(await retry).toEqual(pixels);
  });
});
