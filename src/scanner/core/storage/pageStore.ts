/**
 * IndexedDB Page Storage Engine.
 * Swaps high-resolution raw images and canvases to local disk storage,
 * keeping only lightweight thumbnails in RAM.
 * Prevents mobile Out-Of-Memory (OOM) crashes during large 50+ page scanning sessions.
 */

import type { FilterType } from '../types';
import { applyFilterAsync } from '../filters';

const DB_NAME = 'otium_scan_storage';
const DB_VERSION = 1;
const STORE_NAME = 'scanned_pages';

let dbInstance: IDBDatabase | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onversionchange = () => {
        try {
          dbInstance?.close();
        } catch {}
        dbInstance = null;
      };
      dbInstance.onclose = () => {
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onerror = () => {
      dbInstance = null;
      reject(request.error);
    };

    request.onblocked = () => {
      dbInstance = null;
      reject(new Error('IndexedDB blocked'));
    };
  });
}

interface StoredPageRecord {
  id: string;
  originalBlob: Blob;
  warpedBlob: Blob;
  filteredBlob: Blob;
  thumbnailDataUrl: string;
  filter: string;
  timestamp: number;
}

function base64ToBlob(dataUrl: string): Blob {
  try {
    const parts = dataUrl.split(',');
    const mime = parts[0]?.match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(parts[1] || '');
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (err) {
    console.warn('base64ToBlob conversion error:', err);
    return new Blob([], { type: 'image/jpeg' });
  }
}

/**
 * Saves a scanned page to local disk cache and returns its thumbnail
 */
export async function storePageToDisk(
  id: string,
  originalDataUrl: string,
  warpedCanvas: HTMLCanvasElement,
  filteredCanvas: HTMLCanvasElement,
  filter: string
): Promise<string> {
  const originalBlob = base64ToBlob(originalDataUrl);

  // Convert warped and filtered canvases to compact Blobs
  const [warpedBlob, filteredBlob] = await Promise.all([
    new Promise<Blob>((resolve) =>
      warpedCanvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.88)
    ),
    new Promise<Blob>((resolve) =>
      filteredCanvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.88)
    ),
  ]);

  // Create ultra-compact 120px thumbnail for RAM
  const thumbCanvas = document.createElement('canvas');
  const aspect = filteredCanvas.width / Math.max(1, filteredCanvas.height);
  thumbCanvas.width = 120;
  thumbCanvas.height = Math.round(120 / aspect);
  const tCtx = thumbCanvas.getContext('2d');
  if (tCtx) {
    tCtx.drawImage(filteredCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
  }
  const thumbnailDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.65);

  const record: StoredPageRecord = {
    id,
    originalBlob,
    warpedBlob,
    filteredBlob,
    thumbnailDataUrl,
    filter,
    timestamp: Date.now(),
  };

  try {
    const db = await getDB();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(record);
        req.onsuccess = () => resolve(thumbnailDataUrl);
        req.onerror = () => {
          console.warn('IndexedDB put error, falling back:', req.error);
          resolve(thumbnailDataUrl);
        };
      } catch (e) {
        console.warn('IDB transaction error, falling back:', e);
        resolve(thumbnailDataUrl);
      }
    });
  } catch (e) {
    console.warn('getDB failed, falling back to memory thumbnail:', e);
    return thumbnailDataUrl;
  }
}

/**
 * Loads a filtered canvas for a specific page from disk
 */
export async function loadOriginalDataUrlFromDisk(id: string): Promise<string> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => {
      const record = req.result as StoredPageRecord | undefined;
      if (!record) {
        reject(new Error(`Page not found: ${id}`));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(record.originalBlob);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function loadPageCanvasFromDisk(id: string): Promise<HTMLCanvasElement> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);

    req.onsuccess = () => {
      const record = req.result as StoredPageRecord | undefined;
      if (!record) {
        reject(new Error(`Page not found: ${id}`));
        return;
      }

      const img = new Image();
      const url = URL.createObjectURL(record.filteredBlob);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to decode cached page blob'));
      };
      img.src = url;
    };

    req.onerror = () => reject(req.error);
  });
}

/**
 * Rotates a stored page 90 degrees clockwise and updates cache and thumbnail
 */
export async function rotateStoredPage(id: string): Promise<string> {
  const db = await getDB();
  const record: StoredPageRecord = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (!record) throw new Error('Page not found');

  const rotateBlob = async (blob: Blob): Promise<Blob> => {
    const img = await createImageFromBlob(blob);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalHeight;
    canvas.height = img.naturalWidth;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    }
    return new Promise((res) => canvas.toBlob((b) => res(b || new Blob()), 'image/jpeg', 0.9));
  };

  const [newFilteredBlob, newWarpedBlob] = await Promise.all([
    rotateBlob(record.filteredBlob),
    rotateBlob(record.warpedBlob),
  ]);

  const thumbImg = await createImageFromBlob(newFilteredBlob);
  const thumbCanvas = document.createElement('canvas');
  const aspect = thumbImg.naturalWidth / thumbImg.naturalHeight;
  thumbCanvas.width = 120;
  thumbCanvas.height = Math.round(120 / aspect);
  const tCtx = thumbCanvas.getContext('2d');
  if (tCtx) tCtx.drawImage(thumbImg, 0, 0, thumbCanvas.width, thumbCanvas.height);
  const newThumbDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.6);

  record.filteredBlob = newFilteredBlob;
  record.warpedBlob = newWarpedBlob;
  record.thumbnailDataUrl = newThumbDataUrl;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  return newThumbDataUrl;
}

function createImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load blob as image'));
    };
    img.src = url;
  });
}

/**
 * Updates the enhancement filter for a stored page using the background Web Worker,
 * updating the high-res filtered blob and thumbnail data url.
 */
export async function updateStoredPageFilter(id: string, filter: FilterType): Promise<string> {
  const db = await getDB();
  const record: StoredPageRecord = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (!record) throw new Error('Page not found');

  const warpedImg = await createImageFromBlob(record.warpedBlob);
  const warpedCanvas = document.createElement('canvas');
  warpedCanvas.width = warpedImg.naturalWidth;
  warpedCanvas.height = warpedImg.naturalHeight;
  const ctx = warpedCanvas.getContext('2d');
  if (ctx) ctx.drawImage(warpedImg, 0, 0);

  const filteredCanvas = await applyFilterAsync(warpedCanvas, filter);

  const newFilteredBlob = await new Promise<Blob>((resolve) =>
    filteredCanvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.88)
  );

  const thumbCanvas = document.createElement('canvas');
  const aspect = filteredCanvas.width / filteredCanvas.height;
  thumbCanvas.width = 120;
  thumbCanvas.height = Math.round(120 / aspect);
  const tCtx = thumbCanvas.getContext('2d');
  if (tCtx) tCtx.drawImage(filteredCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
  const newThumbDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.6);

  record.filteredBlob = newFilteredBlob;
  record.thumbnailDataUrl = newThumbDataUrl;
  record.filter = filter;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  return newThumbDataUrl;
}

/**
 * Deletes a stored page record from IndexedDB disk cache
 */
export async function deleteStoredPage(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Duplicates a stored page record in IndexedDB under a new page ID
 */
export async function duplicateStoredPage(sourceId: string, newId: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(sourceId);
    getReq.onsuccess = () => {
      const record = getReq.result as StoredPageRecord | undefined;
      if (!record) {
        resolve();
        return;
      }
      const duplicatedRecord: StoredPageRecord = {
        ...record,
        id: newId,
        timestamp: Date.now(),
      };
      const putReq = store.put(duplicatedRecord);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Clears current scan session from disk cache
 */
export async function clearScanSession(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Checks available storage quota to prevent out-of-disk crashes during large scan sessions
 */
export async function checkStorageQuota(): Promise<{ hasLowStorage: boolean; freeBytesEstimate?: number }> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const { quota, usage } = await navigator.storage.estimate();
      if (typeof quota === 'number' && typeof usage === 'number') {
        const freeBytes = quota - usage;
        const hasLowStorage = freeBytes < 45 * 1024 * 1024; // Less than 45MB free
        return { hasLowStorage, freeBytesEstimate: freeBytes };
      }
    } catch {}
  }
  return { hasLowStorage: false };
}

const SESSION_PAGES_KEY = 'otium_scan_active_session_pages';

export function saveActiveSessionPages(pages: import('../types').ScannedPage[]): void {
  try {
    if (pages.length === 0) {
      localStorage.removeItem(SESSION_PAGES_KEY);
    } else {
      localStorage.setItem(SESSION_PAGES_KEY, JSON.stringify(pages));
    }
  } catch {}
}

export function getActiveSessionPages(): import('../types').ScannedPage[] | null {
  try {
    const raw = localStorage.getItem(SESSION_PAGES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function clearActiveSessionPages(): void {
  try {
    localStorage.removeItem(SESSION_PAGES_KEY);
  } catch {}
}
