import { localStorage } from '../../../platform/storage';
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearActiveSessionPages,
  clearScanSession,
  duplicateStoredPage,
  loadOriginalBlobFromDisk,
  getActiveSessionPages,
  saveActiveSessionPages,
  storePageToDisk,
} from './pageStore';
import type { ScannedPage } from '../types';

vi.mock(import('./pageImageOps'), async (load) => ({
  ...await load(),
  generateThumbnailDataUrl: () => 'data:image/jpeg;base64,YQ==',
}));

describe('pageStore persistence and sessions', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearScanSession();
  });

  it('saves, retrieves, and clears active session pages', () => {
    expect(getActiveSessionPages()).toBeNull();

    const mockPages: ScannedPage[] = [
      {
        id: 'page_1',
        thumbnailDataUrl: 'data:image/jpeg;base64,111',
        quad: {
          topLeft: { x: 0, y: 0 },
          topRight: { x: 100, y: 0 },
          bottomRight: { x: 100, y: 140 },
          bottomLeft: { x: 0, y: 140 },
        },
        filter: 'magic',
        timestamp: 1000,
      },
      {
        id: 'page_2',
        thumbnailDataUrl: 'data:image/jpeg;base64,222',
        quad: {
          topLeft: { x: 0, y: 0 },
          topRight: { x: 100, y: 0 },
          bottomRight: { x: 100, y: 140 },
          bottomLeft: { x: 0, y: 140 },
        },
        filter: 'bw',
        timestamp: 2000,
      },
    ];

    saveActiveSessionPages(mockPages);
    const restored = getActiveSessionPages();
    expect(restored).not.toBeNull();
    expect(restored?.length).toBe(2);
    expect(restored?.[0].id).toBe('page_1');
    expect(restored?.[1].filter).toBe('bw');

    clearActiveSessionPages();
    expect(getActiveSessionPages()).toBeNull();
  });

  it('safely handles duplication of nonexistent page without crash', async () => {
    await expect(duplicateStoredPage('ghost_id', 'new_ghost_id')).resolves.toBeUndefined();
  });

  it('reports an aborted scan write and allows the same image to be saved on retry', async () => {
    const canvas = {
      width: 10,
      height: 10,
      toBlob: (callback: BlobCallback) => callback(new Blob(['image'], { type: 'image/jpeg' })),
    } as Partial<HTMLCanvasElement> as HTMLCanvasElement;
    const source = 'data:image/jpeg;base64,YQ==';
    const add = IDBObjectStore.prototype.add;
    const abort = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementationOnce(function (this: IDBObjectStore, value, key) {
      const request = add.call(this, value, key);
      request.addEventListener('success', () => this.transaction.abort());
      return request;
    });
    await expect(storePageToDisk('retry', source, canvas, canvas, 'magic')).rejects.toThrow('Saving the scan was interrupted');
    abort.mockRestore();
    await expect(storePageToDisk('retry', source, canvas, canvas, 'magic')).resolves.toBe(source);
  });

  it('does not record a thumbnail when encoding the full scan fails', async () => {
    const canvas = { width: 10, height: 10, toBlob: (callback: BlobCallback) => callback(null) } as Partial<HTMLCanvasElement> as HTMLCanvasElement;
    const put = vi.spyOn(IDBObjectStore.prototype, 'add');
    await expect(storePageToDisk('broken', 'data:image/jpeg;base64,YQ==', canvas, canvas, 'magic'))
      .rejects.toThrow('Could not encode the scanned page');
    expect(put).not.toHaveBeenCalled();
  });
  it('replaces the original in storage when a page is redacted', async () => {
    const preview = { width: 100, height: 100 } as HTMLCanvasElement;
    const source = new Blob(['unredacted original'], { type: 'image/jpeg' });
    await storePageToDisk('redact', source, null, null, 'original', preview);
    expect((await loadOriginalBlobFromDisk('redact')).size).toBe(source.size);
    await storePageToDisk('redact', new Blob(['redacted pixels'], { type: 'image/png' }), null, null, 'original', preview, true);
    await expect(loadOriginalBlobFromDisk('redact')).rejects.toThrow('has been redacted');
    await duplicateStoredPage('redact', 'copied');
    await expect(loadOriginalBlobFromDisk('copied')).rejects.toThrow('has been redacted');
  });

});
