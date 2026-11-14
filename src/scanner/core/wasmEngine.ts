import type { FilterType, Quad } from './types';
import type { ScannerWorkerRequest, ScannerWorkerResponse } from './scannerWorker';

const FILTER_IDS: Record<Exclude<FilterType, 'original'>, number> = {
  magic: 1,
  clean: 2,
  vibrant: 3,
  bw: 4,
  grayscale: 5,
  vintage: 6,
};

const WORKER_TIMEOUT_MS = 12000;
const CV_TIMEOUT_MS = 1500;
const WORKER_RETRY_DELAY_MS = 1000;

interface PendingJob {
  resolve: (response: ScannerWorkerResponse | null) => void;
  timer: number;
}

let scannerWorker: Worker | null = null;
let retryWorkerAt = 0;
let nextRequestId = 1;
const pendingJobs = new Map<number, PendingJob>();

/**
 * Resolves the absolute URL to `public/wasm/otium_wasm.wasm` relative to the
 * active document/page base so subpath deployments (e.g. GitHub Pages `/Otium/`)
 * work cleanly from inside a module Web Worker.
 */
export function resolveWasmAssetUrl(
  baseURI: string = typeof document !== 'undefined' ? document.baseURI : '',
  locationHref: string = typeof window !== 'undefined' ? window.location?.href ?? '' : ''
): string {
  const anchor = baseURI || locationHref;
  if (anchor) {
    try {
      return new URL('./wasm/otium_wasm.wasm', anchor).href;
    } catch {
      // Fall through to relative path.
    }
  }
  return './wasm/otium_wasm.wasm';
}

function rejectAllPending(): void {
  for (const job of pendingJobs.values()) {
    window.clearTimeout(job.timer);
    job.resolve(null);
  }
  pendingJobs.clear();
}

function ensureWorker(): Worker | null {
  if (
    Date.now() < retryWorkerAt ||
    typeof window === 'undefined' ||
    typeof Worker === 'undefined' ||
    typeof WebAssembly === 'undefined'
  ) {
    return null;
  }
  if (scannerWorker) return scannerWorker;

  try {
    const worker = new Worker(new URL('./scannerWorker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<ScannerWorkerResponse>) => {
      const payload = event.data;
      const pending = pendingJobs.get(payload.id);
      if (!pending) return;
      pendingJobs.delete(payload.id);
      window.clearTimeout(pending.timer);
      pending.resolve(payload);
    };
    const recover = () => {
      if (scannerWorker !== worker) return;
      terminateScannerWorker();
      retryWorkerAt = Date.now() + WORKER_RETRY_DELAY_MS;
    };
    worker.onerror = recover;
    worker.onmessageerror = recover;
    scannerWorker = worker;
    return worker;
  } catch (error) {
    console.debug('[Scanner] WASM worker start failed:', error);
    retryWorkerAt = Date.now() + WORKER_RETRY_DELAY_MS;
    return null;
  }
}

export function terminateScannerWorker(): void {
  retryWorkerAt = 0;
  if (scannerWorker) {
    try {
      scannerWorker.terminate();
    } catch {
      // Ignore terminate errors.
    }
    scannerWorker = null;
  }
  rejectAllPending();
}

function toTransferableBuffer(data: Uint8ClampedArray): ArrayBuffer {
  if (
    data.byteOffset === 0 &&
    data.byteLength === data.buffer.byteLength &&
    data.buffer instanceof ArrayBuffer
  ) {
    return data.buffer;
  }
  return data.slice().buffer;
}

function postWorkerRequest(
  requestFactory: (id: number, wasmUrl: string) => {
    message: ScannerWorkerRequest;
    transfer: Transferable[];
  },
  timeoutMs: number = WORKER_TIMEOUT_MS
): Promise<ScannerWorkerResponse | null> {
  const worker = ensureWorker();
  if (!worker) return Promise.resolve(null);

  const id = nextRequestId++;
  const wasmUrl = resolveWasmAssetUrl();
  const { message, transfer } = requestFactory(id, wasmUrl);

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      pendingJobs.delete(id);
      resolve(null);
      if (timeoutMs === WORKER_TIMEOUT_MS && scannerWorker === worker) terminateScannerWorker();
    }, timeoutMs);

    pendingJobs.set(id, { resolve, timer });
    try {
      worker.postMessage(message, transfer);
    } catch {
      pendingJobs.delete(id);
      window.clearTimeout(timer);
      resolve(null);
    }
  });
}

export async function runWasmFilter(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  filter: FilterType
): Promise<Uint8ClampedArray | null> {
  if (filter === 'original') return null;
  const filterId = FILTER_IDS[filter];
  if (!filterId || width <= 0 || height <= 0) return null;

  const buffer = toTransferableBuffer(rgba);
  const res = await postWorkerRequest((id, wasmUrl) => ({
    message: { id, type: 'applyFilter', wasmUrl, buffer, width, height, filterId },
    transfer: [buffer],
  }));

  if (!res || !res.ok || !res.buffer) return null;
  return new Uint8ClampedArray(res.buffer);
}

export async function runWasmWarpPerspective(
  srcRgba: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  quad: Quad
): Promise<Uint8ClampedArray | null> {
  if (srcW < 2 || srcH < 2 || dstW <= 0 || dstH <= 0) return null;

  const srcBuffer = toTransferableBuffer(srcRgba);
  const corners: [number, number, number, number, number, number, number, number] = [
    quad.topLeft.x,
    quad.topLeft.y,
    quad.topRight.x,
    quad.topRight.y,
    quad.bottomRight.x,
    quad.bottomRight.y,
    quad.bottomLeft.x,
    quad.bottomLeft.y,
  ];

  const res = await postWorkerRequest((id, wasmUrl) => ({
    message: {
      id,
      type: 'warpPerspective',
      wasmUrl,
      srcBuffer,
      srcW,
      srcH,
      dstW,
      dstH,
      corners,
    },
    transfer: [srcBuffer],
  }));

  if (!res || !res.ok || !res.buffer) return null;
  return new Uint8ClampedArray(res.buffer);
}

export async function runWasmDewarpSpine(
  srcRgba: Uint8ClampedArray,
  width: number,
  height: number,
  curvature: number,
  spinePos: number
): Promise<Uint8ClampedArray | null> {
  if (width <= 0 || height < 2 || curvature <= 0.02) return null;

  const srcBuffer = toTransferableBuffer(srcRgba);
  const res = await postWorkerRequest((id, wasmUrl) => ({
    message: {
      id,
      type: 'dewarpSpine',
      wasmUrl,
      srcBuffer,
      width,
      height,
      curvature,
      spinePos,
    },
    transfer: [srcBuffer],
  }));

  if (!res || !res.ok || !res.buffer) return null;
  return new Uint8ClampedArray(res.buffer);
}

export async function runWasmMotionAndSharpness(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  resetPrev: boolean = false
): Promise<{ motion: number; sharpness: number } | null> {
  if (width < 3 || height < 3) return null;

  const rgbaBuffer = toTransferableBuffer(rgba);
  const res = await postWorkerRequest(
    (id, wasmUrl) => ({
      message: {
        id,
        type: 'motionAndSharpness',
        wasmUrl,
        rgbaBuffer,
        width,
        height,
        resetPrev,
      },
      transfer: [rgbaBuffer],
    }),
    CV_TIMEOUT_MS
  );

  if (
    !res ||
    !res.ok ||
    typeof res.motion !== 'number' ||
    typeof res.sharpness !== 'number'
  ) {
    return null;
  }
  return { motion: res.motion, sharpness: Math.round(res.sharpness) };
}
