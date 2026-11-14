import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from './runtime';

export interface RustEngineStatus {
  version: string;
  isActive: boolean;
  modules: string[];
}

function toUint8Array(payload: ArrayBuffer | number[]): Uint8Array {
  return payload instanceof ArrayBuffer ? new Uint8Array(payload) : new Uint8Array(payload);
}

/**
 * Encodes an HTMLCanvasElement to raw PNG bytes for native binary IPC transfer.
 */
export async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array | null> {
  if (typeof canvas.toBlob !== 'function') return null;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Decodes raw PNG bytes returned from Rust IPC onto a destination canvas context.
 */
export async function drawPngBytesOnCanvas(
  pngBytes: Uint8Array,
  target: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  resizeToImage = false
): Promise<boolean> {
  if (typeof URL === 'undefined' || typeof Image === 'undefined') return false;
  const copy = new Uint8Array(pngBytes.byteLength);
  copy.set(pngBytes);
  const url = URL.createObjectURL(new Blob([copy.buffer], { type: 'image/png' }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('PNG decode failed'));
      el.src = url;
    });
    if (resizeToImage) {
      target.width = img.naturalWidth || target.width;
      target.height = img.naturalHeight || target.height;
    }
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(img, 0, 0, target.width, target.height);
    return true;
  } catch (error) {
    console.warn('Rust canvas PNG decode failed:', error);
    return false;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function fetchRustEngineStatus(): Promise<RustEngineStatus> {
  if (!isTauriRuntime()) {
    return {
      version: '2.0.0-lab (Rust WASM / Web Mode)',
      isActive: true,
      modules: [
        'otium-core (Bilingual Typography, Search Normalization & 8 OLED Themes)',
        'otium-wasm (Web Worker Perspective Warp, Document Filters, Camera CV & RDP Ink)',
        'otium-slides (PPTX Slide Presentation Engine)',
        'otium-beam (Smart Beam P2P Sync)',
      ],
    };
  }

  try {
    const raw = await invoke<{ version: string; is_active: boolean; modules: string[] }>('get_rust_engine_status');
    return {
      version: raw.version,
      isActive: raw.is_active,
      modules: raw.modules,
    };
  } catch (error) {
    console.warn('Failed to query native Rust engine status:', error);
    return {
      version: '2.0.0-lab (Core Native)',
      isActive: true,
      modules: ['otium-core', 'otium-wasm', 'otium-slides'],
    };
  }
}

/**
 * Fast native Rust PPTX parsing via otium-slides (raw binary IPC)
 */
export async function parsePptxWithRust(bytes: Uint8Array): Promise<unknown | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invoke('rust_parse_pptx', bytes);
  } catch (error) {
    console.warn('Rust PPTX parser fallback:', error);
    return null;
  }
}

/**
 * Native Rust QR code SVG generation via otium-beam
 */
export async function generateQrWithRust(payload: string): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invoke<string>('rust_generate_beam_qr', { payload });
  } catch (error) {
    console.warn('Rust QR generator fallback:', error);
    return null;
  }
}

/**
 * Native Rust Document Cleaner via raw binary IPC (Integer BT.601 + Otsu Adaptive Binarization)
 */
export async function cleanDocumentWithRust(bytes: Uint8Array, contrastBoost = 1.2): Promise<Uint8Array | null> {
  if (!isTauriRuntime()) return null;
  try {
    const cleaned = await invoke<ArrayBuffer | number[]>(
      'rust_clean_document_image',
      bytes,
      { headers: { 'x-contrast-boost': String(contrastBoost) } }
    );
    return toUint8Array(cleaned);
  } catch (error) {
    console.warn('Rust document cleaner fallback:', error);
    return null;
  }
}

/**
 * Native Rust ID Card Stitcher via raw binary IPC (Combines Front + Back on A4 300 DPI)
 */
export async function stitchIdCardWithRust(frontBytes: Uint8Array, backBytes: Uint8Array): Promise<Uint8Array | null> {
  if (!isTauriRuntime()) return null;
  try {
    const combined = new Uint8Array(frontBytes.byteLength + backBytes.byteLength);
    combined.set(frontBytes, 0);
    combined.set(backBytes, frontBytes.byteLength);
    const stitched = await invoke<ArrayBuffer | number[]>(
      'rust_stitch_id_cards',
      combined,
      { headers: { 'x-front-length': String(frontBytes.byteLength) } }
    );
    return toUint8Array(stitched);
  } catch (error) {
    console.warn('Rust ID card stitcher fallback:', error);
    return null;
  }
}

/**
 * Native cached multi-page Arabic Trigram Index search returning 1-based matching page numbers.
 */
export async function searchDocumentPagesWithRust(
  docKey: string,
  query: string,
  pages: string[] | null
): Promise<number[] | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invoke<number[]>('rust_search_document_pages_arabic', {
      docKey,
      pages,
      query,
    });
  } catch (error) {
    console.warn('Rust Arabic search fallback:', error);
    return null;
  }
}

export interface RustPdfPageInfo {
  page_number: number;
  width_pt: number;
  height_pt: number;
  rotation: number;
}

export interface RustPdfDocumentInfo {
  title: string | null;
  author: string | null;
  page_count: number;
  version: string;
  pages: RustPdfPageInfo[];
}

export interface RustInkPoint {
  x: number;
  y: number;
  pressure: number;
  timestamp_ms: number;
}

export interface RustInkStroke {
  id: string;
  tool: 'pen' | 'highlighter' | 'eraser';
  color_hex: string;
  base_width: number;
  opacity: number;
  points: RustInkPoint[];
}

/**
 * Inspects PDF structure, version, and page boxes natively via otium-pdf raw binary IPC.
 */
export async function inspectPdfWithRust(bytes: Uint8Array): Promise<RustPdfDocumentInfo | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invoke<RustPdfDocumentInfo>('rust_inspect_pdf_bytes', bytes);
  } catch (error) {
    console.warn('Rust PDF inspector fallback:', error);
    return null;
  }
}

/**
 * Decimates high-frequency 120Hz ink trajectories natively via otium-ink RDP simplifier.
 */
export async function simplifyInkWithRust(
  points: RustInkPoint[],
  tolerance = 0.75
): Promise<RustInkPoint[] | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invoke<RustInkPoint[]>('rust_simplify_ink_points', { points, tolerance });
  } catch (error) {
    console.warn('Rust ink simplifier fallback:', error);
    return null;
  }
}

/**
 * Renders vector strokes to standalone SVG markup via otium-ink.
 */
export async function exportInkSvgWithRust(
  width: number,
  height: number,
  strokes: RustInkStroke[]
): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invoke<string>('rust_export_ink_svg', { width, height, strokes });
  } catch (error) {
    console.warn('Rust ink SVG export fallback:', error);
    return null;
  }
}

/**
 * Encrypts binary backup/document payloads via Argon2id + ChaCha20-Poly1305 (otium-vault).
 */
export async function sealBytesWithRust(bytes: Uint8Array, passphrase: string): Promise<Uint8Array | null> {
  if (!isTauriRuntime() || !passphrase.trim()) return null;
  try {
    const sealed = await invoke<ArrayBuffer | number[]>('rust_vault_seal_bytes', bytes, {
      headers: { 'x-vault-passphrase': passphrase },
    });
    return toUint8Array(sealed);
  } catch (error) {
    console.warn('Rust vault seal fallback:', error);
    return null;
  }
}

/**
 * Decrypts payloads produced by `sealBytesWithRust` via otium-vault.
 */
export async function unsealBytesWithRust(sealed: Uint8Array, passphrase: string): Promise<Uint8Array | null> {
  if (!isTauriRuntime() || !passphrase.trim()) return null;
  try {
    const opened = await invoke<ArrayBuffer | number[]>('rust_vault_unseal_bytes', sealed, {
      headers: { 'x-vault-passphrase': passphrase },
    });
    return toUint8Array(opened);
  } catch (error) {
    console.warn('Rust vault unseal fallback:', error);
    return null;
  }
}
