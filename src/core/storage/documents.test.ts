import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
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
});
