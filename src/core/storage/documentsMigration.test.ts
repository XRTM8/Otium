import { appIndexedDB } from '../../platform/storage';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import {
  closeDocumentDatabase,
  getDocumentFromStorage,
  getRecentDocumentsList
} from './documents';
import { DB_NAME, DB_VERSION, openDB, STORE_NAME, transactionDone } from './documentsDb';

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = appIndexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function openVersionOne(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = appIndexedDB.open('otium_reader_db', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('documents', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

describe('document storage upgrade', () => {
  it('moves inline v1 PDF bytes into the files store', async () => {
    await deleteDatabase('otium_reader_db');
    const legacy = await openVersionOne();
    const bytes = new TextEncoder().encode('inline v1 pdf').buffer;

    await new Promise<void>((resolve, reject) => {
      const tx = legacy.transaction('documents', 'readwrite');
      tx.objectStore('documents').put({
        id: 'legacy.pdf',
        name: 'legacy.pdf',
        lastOpened: 1,
        lastPage: 3,
        totalPages: 9,
        sizeBytes: bytes.byteLength,
        data: bytes
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    legacy.close();

    const recents = await getRecentDocumentsList();
    expect(recents[0]).toMatchObject({ id: 'legacy.pdf', available: true, lastPage: 3 });

    const stored = await getDocumentFromStorage('legacy.pdf');
    expect(new TextDecoder().decode(stored ?? new ArrayBuffer(0))).toBe('inline v1 pdf');
  });

  it('preserves a newer database when an older app attempts to open it', async () => {
    await closeDocumentDatabase();
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const openNewer = () => new Promise<IDBDatabase>((resolve, reject) => {
      const request = appIndexedDB.open(DB_NAME, DB_VERSION + 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const newer = await openNewer();
      const tx = newer.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ id: 'saved', name: 'saved.pdf' });
      await transactionDone(tx);
      newer.close();

      await expect(openDB()).rejects.toMatchObject({ name: 'VersionError' });
      const reopened = await openNewer();
      const record = await new Promise((resolve, reject) => {
        const request = reopened.transaction(STORE_NAME).objectStore(STORE_NAME).get('saved');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      reopened.close();
      expect(record).toEqual({ id: 'saved', name: 'saved.pdf' });
    } finally {
      await closeDocumentDatabase();
      vi.unstubAllGlobals();
    }
  });
});
