import type { FilterType } from '../types';
import { applyFilterAsync } from '../filters';

export interface StoredPageRecord {
  id: string;
  originalBlob: Blob;
  warpedBlob: Blob;
  filteredBlob: Blob;
  thumbnailDataUrl: string;
  filter: string;
  timestamp: number;
  redacted?: boolean;
  revision?: number;
}

export function generateThumbnailDataUrl(
  source: HTMLCanvasElement | HTMLImageElement,
  aspect: number,
  quality = 0.6
): string {
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = Math.max(1, Math.round(160 * Math.min(1, aspect)));
  thumbCanvas.height = Math.max(1, Math.round(160 / Math.max(1, aspect)));
  const ctx = thumbCanvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(source, 0, 0, thumbCanvas.width, thumbCanvas.height);
  }
  return thumbCanvas.toDataURL('image/jpeg', quality);
}

export function createImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
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

async function rotateBlob90(blob: Blob): Promise<Blob> {
  const img = await createImageFromBlob(blob);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalHeight;
  canvas.height = img.naturalWidth;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not rotate the scan');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((90 * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  try {
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (result) => result?.size ? resolve(result) : reject(new Error('Could not encode the rotated scan')), 'image/jpeg', 0.96,
    ));
  } finally {
    canvas.width = canvas.height = 1;
  }
}

export async function transformRotatedRecord(record: StoredPageRecord): Promise<StoredPageRecord> {
  const [newFilteredBlob, newWarpedBlob] = await Promise.all([
    rotateBlob90(record.filteredBlob),
    record.warpedBlob === record.filteredBlob ? Promise.resolve(null) : rotateBlob90(record.warpedBlob),
  ]);
  const thumbImg = await createImageFromBlob(newFilteredBlob);
  const aspect = thumbImg.naturalWidth / Math.max(1, thumbImg.naturalHeight);
  return {
    ...record,
    filteredBlob: newFilteredBlob,
    warpedBlob: newWarpedBlob ?? newFilteredBlob,
    thumbnailDataUrl: generateThumbnailDataUrl(thumbImg, aspect, 0.6),
  };
}

export async function transformFilteredRecord(
  record: StoredPageRecord,
  filter: FilterType
): Promise<StoredPageRecord> {
  const warpedImg = await createImageFromBlob(record.warpedBlob);
  if (filter === 'original') {
    return {
      ...record,
      filteredBlob: record.warpedBlob,
      thumbnailDataUrl: generateThumbnailDataUrl(warpedImg, warpedImg.naturalWidth / warpedImg.naturalHeight),
      filter,
    };
  }
  const warpedCanvas = document.createElement('canvas');
  warpedCanvas.width = warpedImg.naturalWidth;
  warpedCanvas.height = warpedImg.naturalHeight;
  let filteredCanvas: HTMLCanvasElement | undefined;
  try {
    const ctx = warpedCanvas.getContext('2d');
    if (!ctx) throw new Error('Could not prepare the scan for filtering');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, warpedCanvas.width, warpedCanvas.height);
    ctx.drawImage(warpedImg, 0, 0);

    const result = await applyFilterAsync(warpedCanvas, filter);
    if (result === warpedCanvas) throw new Error('Could not apply the requested scan filter');
    filteredCanvas = result;
    const filteredBlob = await new Promise<Blob>((resolve, reject) =>
      result.toBlob((blob) => blob?.size ? resolve(blob) : reject(new Error('Could not encode the filtered scan')), 'image/jpeg', 0.96)
    );
    return {
      ...record,
      filteredBlob,
      thumbnailDataUrl: generateThumbnailDataUrl(result, result.width / result.height),
      filter,
    };
  } finally {
    warpedCanvas.width = warpedCanvas.height = 1;
    if (filteredCanvas) filteredCanvas.width = filteredCanvas.height = 1;
  }
}
