import type { BoardPageData, BoardSnippet } from '../types';
export interface BoardSnapshot { pages: BoardPageData[]; currentPage: number; snippets: BoardSnippet[] }
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('otium-teaching-board', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Board storage is blocked'));
  });
}
export async function readBoard(id: string): Promise<BoardSnapshot | null> {
  const db = await database();
  try {
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
  } finally { db.close(); }
}
export async function writeBoard(id: string, snapshot: BoardSnapshot): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put(snapshot, id);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Board save interrupted'));
    });
  } finally { db.close(); }
}
