import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fingerprintDocument } from './documentIdentity';
import { FILES_STORE } from './documentsDb';
import {
  adoptLegacyDocumentRecord,
  clearAllStoredDocuments,
  closeDocumentDatabase,
  getDocumentFromStorage,
  getRecentDocumentsList,
  getStorageSummary,
  removeDocumentFromStorage,
  restoreDocumentMetadata,
  saveDocumentToStorage,
  updateDocumentPage
} from './documents';

const bytes = (text: string) => new TextEncoder().encode(text).buffer;

beforeEach(async () => {
  await closeDocumentDatabase();
  await clearAllStoredDocuments();
});

afterAll(async () => {
  await clearAllStoredDocuments();
  await closeDocumentDatabase();
});

describe('document storage', () => {
  it('stores metadata and bytes separately and lists recents', async () => {
    await saveDocumentToStorage('sha256:one', 'one.pdf', bytes('first book'), 20, 4);
    await saveDocumentToStorage('sha256:two', 'two.pdf', bytes('second book'), 10, 1);

    const recents = await getRecentDocumentsList();
    expect(recents).toHaveLength(2);
    const one = recents.find((item) => item.id === 'sha256:one');
    expect(one).toMatchObject({
      name: 'one.pdf',
      totalPages: 20,
      lastPage: 4,
      available: true
    });

    const stored = await getDocumentFromStorage('sha256:one');
    expect(new TextDecoder().decode(stored ?? new ArrayBuffer(0))).toBe('first book');

    await updateDocumentPage('sha256:one', 9);
    const updated = (await getRecentDocumentsList()).find((item) => item.id === 'sha256:one');
    expect(updated?.lastPage).toBe(9);

    const summary = await getStorageSummary();
    expect(summary.documents).toBe(2);
    expect(summary.bytes).toBeGreaterThan(0);
  });

  it('keeps a metadata-only entry after its PDF is evicted', async () => {
    await saveDocumentToStorage('sha256:gone', 'gone.pdf', bytes('gone book'), 40, 12);

    await restoreDocumentMetadata({
      id: 'sha256:gone',
      name: 'gone.pdf',
      totalPages: 40,
      lastPage: 27
    });

    await removeDocumentFromStorage('sha256:gone');
    expect(await getDocumentFromStorage('sha256:gone')).toBeNull();

    await restoreDocumentMetadata({
      id: 'sha256:gone',
      name: 'gone.pdf',
      totalPages: 40,
      lastPage: 27,
      sizeBytes: 10
    });

    const recent = (await getRecentDocumentsList()).find((item) => item.id === 'sha256:gone');
    expect(recent).toMatchObject({
      name: 'gone.pdf',
      lastPage: 27,
      totalPages: 40,
      available: false
    });
    expect(await getDocumentFromStorage('sha256:gone')).toBeNull();
  });

  it('does not overwrite stored bytes when restoring older metadata', async () => {
    await saveDocumentToStorage('sha256:keep', 'keep.pdf', bytes('kept book'), 30, 15);

    await restoreDocumentMetadata({
      id: 'sha256:keep',
      name: 'renamed.pdf',
      totalPages: 30,
      lastPage: 20,
      lastOpened: 1
    });

    const visible = await getDocumentFromStorage('sha256:keep');
    expect(new TextDecoder().decode(visible ?? new ArrayBuffer(0))).toBe('kept book');

    const recent = (await getRecentDocumentsList()).find((item) => item.id === 'sha256:keep');
    expect(recent).toMatchObject({ name: 'renamed.pdf', lastPage: 20, available: true });
  });

  it.each(['throws before queuing file bytes', 'aborts after queuing file bytes'] as const)(
    'keeps a previously stored PDF available after a replacement %s',
    async (failure) => {
      const id = 'sha256:previous-copy';
      const original = bytes('%PDF-1.4\nprevious');
      await saveDocumentToStorage(id, 'original.pdf', original, 30, 15);
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const put = IDBObjectStore.prototype.put;
      const fault = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
        if (this.name !== FILES_STORE) return put.call(this, value, key);
        if (failure === 'throws before queuing file bytes') throw new DOMException('Quota exceeded', 'QuotaExceededError');
        const request = put.call(this, value, key);
        request.addEventListener('success', () => this.transaction.abort());
        return request;
      });
      await saveDocumentToStorage(id, 'replacement.pdf', bytes('%PDF-1.4\nreplacement'), 2);
      fault.mockRestore();

      await closeDocumentDatabase();
      expect(await getDocumentFromStorage(id)).toEqual(original);
      expect(await getRecentDocumentsList()).toEqual([
        expect.objectContaining({ id, name: 'original.pdf', available: true, totalPages: 30, lastPage: 15 }),
      ]);

      const replacement = bytes('%PDF-1.4\nreplacement');
      await saveDocumentToStorage(id, 'replacement.pdf', replacement, 2);
      await closeDocumentDatabase();
      expect(await getDocumentFromStorage(id)).toEqual(replacement);
    },
  );

  it('keeps the only legacy PDF copy when the new entry has only metadata', async () => {
    const original = bytes('%PDF-1.4\nlegacy');
    const id = await fingerprintDocument(original);
    await saveDocumentToStorage('legacy.pdf', 'legacy.pdf', original, 10, 4);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const put = IDBObjectStore.prototype.put;
    const fault = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name === FILES_STORE) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return put.call(this, value, key);
    });
    await saveDocumentToStorage(id, 'legacy.pdf', original, 10, 4);
    fault.mockRestore();
    await adoptLegacyDocumentRecord('legacy.pdf', id);
    await closeDocumentDatabase();

    expect(await getDocumentFromStorage('legacy.pdf')).toEqual(original);
    expect(await getDocumentFromStorage(id)).toBeNull();
    expect(await getRecentDocumentsList()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id, available: false, lastPage: 4 }),
    ]));

    await saveDocumentToStorage(id, 'legacy.pdf', original, 10, 4);
    await adoptLegacyDocumentRecord('legacy.pdf', id);
    expect(await getDocumentFromStorage(id)).toEqual(original);
    expect(await getDocumentFromStorage('legacy.pdf')).toBeNull();
  });
});
