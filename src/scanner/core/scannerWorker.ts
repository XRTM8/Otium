/// <reference lib="webworker" />

import { applyAdaptiveBwFilter } from './filterPresets';

export type ScannerWorkerRequest =
  | {
      id: number;
      type: 'applyFilter';
      wasmUrl: string;
      buffer: ArrayBuffer;
      width: number;
      height: number;
      filterId: number;
    }
  | {
      id: number;
      type: 'warpPerspective';
      wasmUrl: string;
      srcBuffer: ArrayBuffer;
      srcW: number;
      srcH: number;
      dstW: number;
      dstH: number;
      corners: [number, number, number, number, number, number, number, number];
    }
  | {
      id: number;
      type: 'dewarpSpine';
      wasmUrl: string;
      srcBuffer: ArrayBuffer;
      width: number;
      height: number;
      curvature: number;
      spinePos: number;
    }
  | {
      id: number;
      type: 'motionAndSharpness';
      wasmUrl: string;
      rgbaBuffer: ArrayBuffer;
      width: number;
      height: number;
      resetPrev?: boolean;
    };

export type ScannerWorkerResponse =
  | {
      id: number;
      ok: true;
      buffer?: ArrayBuffer;
      width?: number;
      height?: number;
      motion?: number;
      sharpness?: number;
    }
  | {
      id: number;
      ok: false;
      error: string;
    };

interface OtiumWasmExports {
  memory: WebAssembly.Memory;
  otium_alloc(size: number): number;
  otium_dealloc(ptr: number, size: number): void;
  otium_apply_filter_rgba(ptr: number, width: number, height: number, filterId: number): number;
  otium_warp_perspective_rgba(
    srcPtr: number,
    srcW: number,
    srcH: number,
    dstPtr: number,
    dstW: number,
    dstH: number,
    cornersPtr: number
  ): number;
  otium_dewarp_spine_rgba(
    srcPtr: number,
    width: number,
    height: number,
    dstPtr: number,
    curvature: number,
    spinePos: number
  ): number;
  otium_motion_and_sharpness_rgba(
    rgbaPtr: number,
    prevLumPtr: number,
    hasPrev: number,
    width: number,
    height: number,
    outPtr: number
  ): number;
}

let wasmUrlLoaded = '';
let wasmPromise: Promise<OtiumWasmExports | null> | null = null;
let retryWasmAt = 0;

// Persistent previous-frame luminance buffer kept inside WASM memory across camera ticks.
let prevLumPtr = 0;
let prevLumPixels = 0;
let hasPrevFrame = false;

async function instantiateOtiumWasm(wasmUrl: string): Promise<OtiumWasmExports | null> {
  if (typeof WebAssembly === 'undefined') return null;
  try {
    const response = await fetch(wasmUrl, { cache: 'force-cache' });
    if (!response.ok) return null;

    let instance: WebAssembly.Instance;
    if (typeof WebAssembly.instantiateStreaming === 'function') {
      try {
        const result = await WebAssembly.instantiateStreaming(response.clone(), {});
        instance = result.instance;
      } catch {
        const bytes = await response.arrayBuffer();
        const result = await WebAssembly.instantiate(bytes, {});
        instance = result.instance;
      }
    } else {
      const bytes = await response.arrayBuffer();
      const result = await WebAssembly.instantiate(bytes, {});
      instance = result.instance;
    }

    const exp = instance.exports;
    const {
      memory,
      otium_alloc,
      otium_dealloc,
      otium_apply_filter_rgba,
      otium_warp_perspective_rgba,
      otium_dewarp_spine_rgba,
      otium_motion_and_sharpness_rgba,
    } = exp;
    if (
      !(memory instanceof WebAssembly.Memory) ||
      typeof otium_alloc !== 'function' ||
      typeof otium_dealloc !== 'function' ||
      typeof otium_apply_filter_rgba !== 'function' ||
      typeof otium_warp_perspective_rgba !== 'function' ||
      typeof otium_dewarp_spine_rgba !== 'function' ||
      typeof otium_motion_and_sharpness_rgba !== 'function'
    ) {
      return null;
    }
    return {
      memory,
      otium_alloc: otium_alloc as OtiumWasmExports['otium_alloc'],
      otium_dealloc: otium_dealloc as OtiumWasmExports['otium_dealloc'],
      otium_apply_filter_rgba: otium_apply_filter_rgba as OtiumWasmExports['otium_apply_filter_rgba'],
      otium_warp_perspective_rgba: otium_warp_perspective_rgba as OtiumWasmExports['otium_warp_perspective_rgba'],
      otium_dewarp_spine_rgba: otium_dewarp_spine_rgba as OtiumWasmExports['otium_dewarp_spine_rgba'],
      otium_motion_and_sharpness_rgba: otium_motion_and_sharpness_rgba as OtiumWasmExports['otium_motion_and_sharpness_rgba'],
    };
  } catch {
    return null;
  }
}

function getWasm(wasmUrl: string): Promise<OtiumWasmExports | null> {
  if (!wasmPromise && wasmUrlLoaded === wasmUrl && Date.now() < retryWasmAt) {
    return Promise.resolve(null);
  }
  if (!wasmPromise || wasmUrlLoaded !== wasmUrl) {
    wasmUrlLoaded = wasmUrl;
    prevLumPtr = 0;
    prevLumPixels = 0;
    hasPrevFrame = false;
    const attempt = instantiateOtiumWasm(wasmUrl).then((exports) => {
      if (!exports && wasmPromise === attempt) {
        wasmPromise = null;
        retryWasmAt = Date.now() + 1000;
      }
      return exports;
    });
    wasmPromise = attempt;
  }
  return wasmPromise;
}

function allocOrThrow(exports: OtiumWasmExports, byteSize: number): number {
  const ptr = exports.otium_alloc(byteSize);
  if (!ptr) {
    throw new Error(`WASM allocation failed (${byteSize} bytes)`);
  }
  return ptr;
}

function postFailure(id: number, error: string): void {
  const msg: ScannerWorkerResponse = { id, ok: false, error };
  self.postMessage(msg);
}

self.onmessage = async (event: MessageEvent<ScannerWorkerRequest>) => {
  const req = event.data;
  try {
    if (req.type === 'applyFilter' && req.filterId === 4) {
      const expected = req.width * req.height * 4;
      if (req.buffer.byteLength !== expected) {
        postFailure(req.id, 'Invalid RGBA buffer length');
        return;
      }
      applyAdaptiveBwFilter(new Uint8ClampedArray(req.buffer), req.width, req.height);
      const response: ScannerWorkerResponse = { id: req.id, ok: true, buffer: req.buffer, width: req.width, height: req.height };
      self.postMessage(response, [req.buffer]);
      return;
    }
    const wasm = await getWasm(req.wasmUrl);
    if (!wasm) {
      postFailure(req.id, 'WASM engine unavailable');
      return;
    }

    if (req.type === 'applyFilter') {
      const byteLen = req.width * req.height * 4;
      if (req.buffer.byteLength < byteLen) {
        postFailure(req.id, 'Invalid RGBA buffer length');
        return;
      }
      const ptr = allocOrThrow(wasm, byteLen);
      try {
        new Uint8Array(wasm.memory.buffer, ptr, byteLen).set(
          new Uint8Array(req.buffer, 0, byteLen)
        );
        const rc = wasm.otium_apply_filter_rgba(ptr, req.width, req.height, req.filterId);
        if (rc !== 0) {
          postFailure(req.id, `Filter kernel failed (${rc})`);
          return;
        }
        const out = new Uint8Array(byteLen);
        out.set(new Uint8Array(wasm.memory.buffer, ptr, byteLen));
        const res: ScannerWorkerResponse = {
          id: req.id,
          ok: true,
          buffer: out.buffer,
          width: req.width,
          height: req.height,
        };
        self.postMessage(res, [out.buffer]);
      } finally {
        wasm.otium_dealloc(ptr, byteLen);
      }
      return;
    }

    if (req.type === 'warpPerspective') {
      const srcByteLen = req.srcW * req.srcH * 4;
      const dstByteLen = req.dstW * req.dstH * 4;
      if (req.srcBuffer.byteLength < srcByteLen) {
        postFailure(req.id, 'Invalid source buffer length');
        return;
      }
      const cornersByteLen = 8 * 4;
      const srcPtr = allocOrThrow(wasm, srcByteLen);
      let dstPtr = 0;
      let cornersPtr = 0;
      try {
        dstPtr = allocOrThrow(wasm, dstByteLen);
        cornersPtr = allocOrThrow(wasm, cornersByteLen);

        // Re-read memory.buffer after all allocations complete (memory.grow safety).
        new Uint8Array(wasm.memory.buffer, srcPtr, srcByteLen).set(
          new Uint8Array(req.srcBuffer, 0, srcByteLen)
        );
        new Float32Array(wasm.memory.buffer, cornersPtr, 8).set(req.corners);

        const rc = wasm.otium_warp_perspective_rgba(
          srcPtr,
          req.srcW,
          req.srcH,
          dstPtr,
          req.dstW,
          req.dstH,
          cornersPtr
        );
        if (rc !== 0) {
          postFailure(req.id, `Warp kernel failed (${rc})`);
          return;
        }

        const out = new Uint8Array(dstByteLen);
        out.set(new Uint8Array(wasm.memory.buffer, dstPtr, dstByteLen));
        const res: ScannerWorkerResponse = {
          id: req.id,
          ok: true,
          buffer: out.buffer,
          width: req.dstW,
          height: req.dstH,
        };
        self.postMessage(res, [out.buffer]);
      } finally {
        if (cornersPtr) wasm.otium_dealloc(cornersPtr, cornersByteLen);
        if (dstPtr) wasm.otium_dealloc(dstPtr, dstByteLen);
        wasm.otium_dealloc(srcPtr, srcByteLen);
      }
      return;
    }

    if (req.type === 'dewarpSpine') {
      const byteLen = req.width * req.height * 4;
      if (req.srcBuffer.byteLength < byteLen) {
        postFailure(req.id, 'Invalid dewarp buffer length');
        return;
      }
      const srcPtr = allocOrThrow(wasm, byteLen);
      let dstPtr = 0;
      try {
        dstPtr = allocOrThrow(wasm, byteLen);
        new Uint8Array(wasm.memory.buffer, srcPtr, byteLen).set(
          new Uint8Array(req.srcBuffer, 0, byteLen)
        );
        const rc = wasm.otium_dewarp_spine_rgba(
          srcPtr,
          req.width,
          req.height,
          dstPtr,
          req.curvature,
          req.spinePos
        );
        if (rc !== 0) {
          postFailure(req.id, `Dewarp kernel failed (${rc})`);
          return;
        }
        const out = new Uint8Array(byteLen);
        out.set(new Uint8Array(wasm.memory.buffer, dstPtr, byteLen));
        const res: ScannerWorkerResponse = {
          id: req.id,
          ok: true,
          buffer: out.buffer,
          width: req.width,
          height: req.height,
        };
        self.postMessage(res, [out.buffer]);
      } finally {
        if (dstPtr) wasm.otium_dealloc(dstPtr, byteLen);
        wasm.otium_dealloc(srcPtr, byteLen);
      }
      return;
    }

    if (req.type === 'motionAndSharpness') {
      const pixels = req.width * req.height;
      const rgbaByteLen = pixels * 4;
      if (req.rgbaBuffer.byteLength < rgbaByteLen) {
        postFailure(req.id, 'Invalid camera frame buffer');
        return;
      }
      if (req.resetPrev || prevLumPixels !== pixels || !prevLumPtr) {
        if (prevLumPtr && prevLumPixels > 0) {
          wasm.otium_dealloc(prevLumPtr, prevLumPixels);
        }
        prevLumPtr = allocOrThrow(wasm, pixels);
        prevLumPixels = pixels;
        hasPrevFrame = false;
      }

      const outByteLen = 2 * 4;
      const rgbaPtr = allocOrThrow(wasm, rgbaByteLen);
      let outPtr = 0;
      try {
        outPtr = allocOrThrow(wasm, outByteLen);
        new Uint8Array(wasm.memory.buffer, rgbaPtr, rgbaByteLen).set(
          new Uint8Array(req.rgbaBuffer, 0, rgbaByteLen)
        );

        const rc = wasm.otium_motion_and_sharpness_rgba(
          rgbaPtr,
          prevLumPtr,
          hasPrevFrame ? 1 : 0,
          req.width,
          req.height,
          outPtr
        );
        if (rc !== 0) {
          postFailure(req.id, `CV kernel failed (${rc})`);
          return;
        }
        hasPrevFrame = true;
        const metrics = new Float32Array(wasm.memory.buffer, outPtr, 2);
        const res: ScannerWorkerResponse = {
          id: req.id,
          ok: true,
          motion: metrics[0],
          sharpness: metrics[1],
        };
        self.postMessage(res);
      } finally {
        if (outPtr) wasm.otium_dealloc(outPtr, outByteLen);
        wasm.otium_dealloc(rgbaPtr, rgbaByteLen);
      }
    }
  } catch (err) {
    postFailure(req.id, err instanceof Error ? err.message : 'Worker error');
  }
};
