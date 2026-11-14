import { appIndexedDB } from '../platform/storage';
import type { RecentDocItem } from '../core/storage/documents';
import { describeFile } from './media';
import { validDrawing, type MediaDrawing } from './drawing';
import { readFavorites } from '../library/model';
export type MediaKind = 'video' | 'audio' | 'image' | 'text' | 'presentation';
export type MediaLibraryItem = RecentDocItem & { mediaKind: MediaKind; position: number };
export type MediaProgress = { lastPage: number; totalPages: number; position: number };
const SINGLE_LIMIT = 128 * 1024 ** 2, TOTAL_LIMIT = 256 * 1024 ** 2, COUNT_LIMIT = 12;
let database: Promise<IDBDatabase> | undefined;
function db() {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const openRequest = appIndexedDB.open('otium_media_library', 2);
    openRequest.onupgradeneeded = () => {
      const connection = openRequest.result;
      if (!connection.objectStoreNames.contains('items')) connection.createObjectStore('items', { keyPath: 'id' });
      if (!connection.objectStoreNames.contains('files')) connection.createObjectStore('files');
      if (!connection.objectStoreNames.contains('drawings')) connection.createObjectStore('drawings');
    };
    openRequest.onsuccess = () => { const value = openRequest.result; value.onversionchange = () => { value.close(); database = undefined; }; resolve(value); };
    openRequest.onerror = () => { database = undefined; reject(openRequest.error); };
    openRequest.onblocked = () => { database = undefined; reject(new Error('Media storage is blocked by another tab.')); };
  });
  return database;
}
function request<T>(value: IDBRequest<T>) { return new Promise<T>((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); }); }
export function mediaKind(file: Pick<File, 'name'>): MediaKind | null {
  const kind = describeFile(file.name).kind;
  return ['video', 'audio', 'image', 'text', 'presentation'].includes(kind) ? kind as MediaKind : null;
}
export function newMediaItem(file: File): MediaLibraryItem {
  const kind = mediaKind(file);
  if (!kind) throw new Error('Unsupported media');
  return { id: `media:${crypto.randomUUID()}`, name: file.name, mediaKind: kind, position: 0,
    lastOpened: Date.now(), lastPage: 1, totalPages: 1, sizeBytes: file.size, available: true };
}
export async function listMedia(): Promise<MediaLibraryItem[]> {
  const connection = await db();
  return (await request(connection.transaction('items').objectStore('items').getAll()) as MediaLibraryItem[])
    .filter(item => item && typeof item.id === 'string' && item.id.startsWith('media:') && typeof item.name === 'string' && mediaKind({ name: item.name }))
    .sort((a, b) => b.lastOpened - a.lastOpened);
}
export async function storeMedia(file: File, item: MediaLibraryItem): Promise<boolean> {
  if (file.size > SINGLE_LIMIT) return false;
  const connection = await db();
  return new Promise<boolean>((resolve, reject) => {
    const tx = connection.transaction(['items', 'files', 'drawings'], 'readwrite');
    let cached = false;
    tx.oncomplete = () => resolve(cached); tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Media storage failed'));
    const items = tx.objectStore('items'), files = tx.objectStore('files');
    items.getAll().onsuccess = event => {
      const previous = (event.target as IDBRequest<MediaLibraryItem[]>).result.sort((a, b) => b.lastOpened - a.lastOpened);
      const drawings = tx.objectStore('drawings').getAllKeys();
      drawings.onsuccess = () => {
        const protectedIds = new Set([...drawings.result, ...readFavorites()]);
        const protectedItems = previous.filter(old => old.id !== item.id && protectedIds.has(old.id));
        let bytes = file.size + protectedItems.reduce((sum, old) => sum + old.sizeBytes, 0), count = 1 + protectedItems.length;
        // A cache limit must never silently erase a teacher's saved annotations.
        if (bytes > TOTAL_LIMIT || count > COUNT_LIMIT) return;
        for (const old of previous) {
          if (old.id === item.id || protectedIds.has(old.id)) continue;
          if (count >= COUNT_LIMIT || bytes + old.sizeBytes > TOTAL_LIMIT) { items.delete(old.id); files.delete(old.id); }
          else { bytes += old.sizeBytes; count++; }
        }
        items.put(item); files.put(file, item.id); cached = true;
      };
    };
  });
}
export async function loadMedia(id: string) {
  const connection = await db(), tx = connection.transaction(['items', 'files']);
  const [item, blob] = await Promise.all([request(tx.objectStore('items').get(id)), request(tx.objectStore('files').get(id))]);
  if (!item || !(blob instanceof Blob)) throw new Error('الملف المحفوظ غير متاح. أعد اختياره من الجهاز.');
  return { item: item as MediaLibraryItem, file: new File([blob], item.name, { type: blob.type }) };
}
export async function updateMedia(id: string, progress: MediaProgress) {
  const connection = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = connection.transaction('items', 'readwrite');
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error);
    const store = tx.objectStore('items'), query = store.get(id);
    query.onsuccess = () => { if (query.result) store.put({ ...query.result, lastOpened: Date.now(),
      lastPage: Math.max(1, Math.min(200, Math.round(progress.lastPage) || 1)), totalPages: Math.max(1, Math.min(200, Math.round(progress.totalPages) || 1)),
      position: Number.isFinite(progress.position) ? Math.max(0, progress.position) : 0 }); };
  });
}
export async function removeMedia(id?: string) {
  const connection = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = connection.transaction(['items', 'files', 'drawings'], 'readwrite');
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error);
    for (const name of ['items', 'files', 'drawings']) { const store = tx.objectStore(name); if (id) store.delete(id); else store.clear(); }
  });
}
export async function loadDrawing(id: string): Promise<MediaDrawing> {
  const connection = await db();
  const value: unknown = await request(connection.transaction('drawings').objectStore('drawings').get(id));
  if (value === undefined) return {};
  if (!validDrawing(value)) throw new Error('تعذر قراءة الشرح المحفوظ.');
  return value;
}
export async function saveDrawing(id: string, value: MediaDrawing): Promise<void> {
  if (!validDrawing(value)) throw new Error('وصل الشرح إلى حد التخزين؛ قلّل عدد الخطوط أو الصفحات المشروحة.');
  const connection = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = connection.transaction(['items', 'drawings'], 'readwrite');
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('تعذر حفظ الشرح.'));
    const item = tx.objectStore('items').get(id);
    item.onsuccess = () => {
      if (!item.result) { tx.abort(); return; }
      tx.objectStore('drawings').put(value, id);
    };
  });
}
export const APP_FILE_ACCEPT = '.pdf,application/pdf,.mp4,.m4v,.webm,.mov,.mkv,.ogv,.mp3,.wav,.m4a,.ogg,.opus,.flac,.png,.jpg,.jpeg,.webp,.gif,.avif,.pptx,.ppsx,.txt,.md';
