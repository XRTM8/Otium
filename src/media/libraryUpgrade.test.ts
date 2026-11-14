import { expect, it } from 'vitest';
import { appIndexedDB } from '../platform/storage';
import { loadDrawing, loadMedia } from './library';
it('upgrades the first lab database without losing an existing saved file', async () => {
  const file = new File(['original clip'], 'lesson.mp4', { type: 'video/mp4' });
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const query = appIndexedDB.open('otium_media_library', 1);
    query.onupgradeneeded = () => { query.result.createObjectStore('items', { keyPath: 'id' }); query.result.createObjectStore('files'); };
    query.onsuccess = () => resolve(query.result); query.onerror = () => reject(query.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['items', 'files'], 'readwrite');
    tx.objectStore('items').put({ id: 'media:old', name: file.name, position: 2, lastPage: 1, totalPages: 1, mediaKind: 'video' });
    tx.objectStore('files').put(file, 'media:old');
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
  });
  db.close();
  const restored = await loadMedia('media:old');
  expect(await restored.file.text()).toBe('original clip');
  expect(restored.item.position).toBe(2);
  expect(await loadDrawing('media:old')).toEqual({});
});
