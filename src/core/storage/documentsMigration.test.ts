import { describe, expect, it } from 'vitest';
import {
  getDocumentFromStorage,
  getRecentDocumentsList
} from './documents';

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function openVersionOne(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('otium_reader_db', 1);
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
});
