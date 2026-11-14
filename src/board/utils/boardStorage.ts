import { appIndexedDB } from '../../platform/storage';
import type { BoardPageData, BoardSnippet } from '../types';
export interface BoardSnapshot { pages: BoardPageData[]; currentPage: number; snippets: BoardSnippet[] }
let dbCache: { opener: typeof appIndexedDB; promise: Promise<IDBDatabase> } | null = null;

function database(): Promise<IDBDatabase> {
  if (dbCache && dbCache.opener === appIndexedDB) {
    return dbCache.promise;
  }
  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = appIndexedDB.open('otium-teaching-board', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('documents')) {
        request.result.createObjectStore('documents');
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        try { db.close(); } catch (err) { console.debug('[BoardStorage] db close skipped:', err); }
        if (dbCache?.promise === promise) dbCache = null;
      };
      db.onclose = () => {
        if (dbCache?.promise === promise) dbCache = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      if (dbCache?.promise === promise) dbCache = null;
      reject(request.error);
    };
    request.onblocked = () => {
      if (dbCache?.promise === promise) dbCache = null;
      reject(new Error('Board storage is blocked'));
    };
  });
  dbCache = { opener: appIndexedDB, promise };
  return promise;
}
export async function readBoard(id: string): Promise<BoardSnapshot | null> {
  const db = await database();
  return await new Promise((resolve, reject) => {
    const request = db.transaction('documents').objectStore('documents').get(id);
    request.onsuccess = () => {
      const value = request.result as BoardSnapshot | undefined;
      if (!value) return resolve(null);
      if (!Array.isArray(value.pages) || !value.pages.length || value.pages.length > 10 ||
        !value.pages.every(p => Array.isArray(p.strokes) && Array.isArray(p.redoStack)) || !Array.isArray(value.snippets)) {
        reject(new Error('Saved board is invalid')); return;
      }
      resolve({ ...value, currentPage: Math.max(0, Math.min(value.pages.length - 1, value.currentPage || 0)) });
    };
    request.onerror = () => reject(request.error);
  });
}
export async function writeBoard(id: string, snapshot: BoardSnapshot): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite');
    tx.objectStore('documents').put(snapshot, id);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Board save interrupted'));
  });
}
