import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { localStorage } from '../../platform/storage';
import type { TextAnnotation } from '../types';
import { loadStoredAnnotations, saveStoredAnnotations } from './annotations';
import { getStoredBookmarks, saveStoredBookmarks } from './bookmarks';
import { applyBackupJson, createBackupJson } from './backupService';
import {
  clearAllStoredDocuments,
  closeDocumentDatabase,
  getDocumentFromStorage,
  getRecentDocumentsList,
  saveDocumentToStorage
} from './documents';
import { STORE_NAME } from './documentsDb';

const DOC_ID = 'sha256:backup-test';

const annotation: TextAnnotation = {
  id: 'anno-1',
  pageNumber: 3,
  type: 'highlight',
  color: '#fde047',
  rects: [{ xPct: 0.1, yPct: 0.2, widthPct: 0.2, heightPct: 0.03 }],
  text: 'اقتباس محفوظ',
  note: 'ملاحظة النسخة الاحتياطية',
  createdAt: 10
};

beforeEach(async () => {
  await closeDocumentDatabase();
  await clearAllStoredDocuments();
  await saveStoredAnnotations(DOC_ID, []);
});

afterAll(async () => {
  await clearAllStoredDocuments();
  await closeDocumentDatabase();
});

describe('backup service', () => {
  it('exports metadata without PDF bytes and restores a metadata-only recents entry', async () => {
    await saveDocumentToStorage(
      DOC_ID,
      'كتاب الاختبار.pdf',
      new TextEncoder().encode('pdf bytes').buffer,
      50,
      9
    );
    await saveStoredAnnotations(DOC_ID, [annotation]);
    saveStoredBookmarks(DOC_ID, [{ id: 'bm-1', pageNumber: 9, createdAt: 20 }]);

    const json = await createBackupJson('1.5.0');
    expect(json).toContain('otium-backup');
    expect(json).not.toContain('pdf bytes');

    await clearAllStoredDocuments();
    await saveStoredAnnotations(DOC_ID, [{ ...annotation, note: 'نسخة محلية أحدث' }]);

    const outcome = await applyBackupJson(json);

    expect(outcome.summary.documents).toBe(1);
    expect(outcome.summary.annotations).toBe(1);
    expect(outcome.summary.bookmarks).toBe(1);

    const recent = (await getRecentDocumentsList()).find((item) => item.id === DOC_ID);
    expect(recent).toMatchObject({
      name: 'كتاب الاختبار.pdf',
      lastPage: 9,
      totalPages: 50,
      available: false
    });

    const annotations = await loadStoredAnnotations(DOC_ID);
    expect(annotations).toHaveLength(1);
    // The backup entry wins an id collision.
    expect(annotations[0].note).toBe('ملاحظة النسخة الاحتياطية');
    expect(getStoredBookmarks(DOC_ID)).toEqual([
      { id: 'bm-1', pageNumber: 9, createdAt: 20 }
    ]);
  });

  it('rejects a file that is not an Otium backup', async () => {
    await expect(applyBackupJson('{"format":"other"}')).rejects.toMatchObject({
      code: 'invalid-format'
    });
  });

  it('validates the entire backup before changing any existing document', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4\nlocal').buffer;
    const bookmarks = [{ id: 'local-bm', pageNumber: 6, createdAt: 1 }];
    await saveDocumentToStorage(DOC_ID, 'local.pdf', bytes, 20, 6);
    await saveStoredAnnotations(DOC_ID, [annotation]);
    saveStoredBookmarks(DOC_ID, bookmarks);
    const previous = await getRecentDocumentsList();
    const backup = JSON.parse(await createBackupJson('1.9.17'));
    backup.documents[0].lastPage = 15;
    backup.documents[0].annotations = [{ ...annotation, note: 'Should never be applied' }];
    backup.documents.push({ name: 'missing-id.pdf' });
    await expect(applyBackupJson(JSON.stringify(backup))).rejects.toMatchObject({ code: 'invalid-document' });
    await expect(applyBackupJson('{"format":')).rejects.toMatchObject({ code: 'invalid-json' });

    await closeDocumentDatabase();
    expect(await getDocumentFromStorage(DOC_ID)).toEqual(bytes);
    expect(await getRecentDocumentsList()).toEqual(previous);
    expect(await loadStoredAnnotations(DOC_ID)).toEqual([expect.objectContaining({ note: annotation.note })]);
    expect(getStoredBookmarks(DOC_ID)).toEqual(bookmarks);
  });

  it.each(['annotations', 'bookmarks', 'document metadata'] as const)(
    'reports a failed %s write and safely retries the restore',
    async (stage) => {
      const bytes = new TextEncoder().encode('%PDF-1.4\nlocal').buffer;
      const bookmarks = [{ id: 'local-bm', pageNumber: 6, createdAt: 1 }];
      await saveDocumentToStorage(DOC_ID, 'local.pdf', bytes, 20, 6);
      await saveStoredAnnotations(DOC_ID, [annotation]);
      saveStoredBookmarks(DOC_ID, bookmarks);
      const backup = await createBackupJson('1.9.17');
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const setItem = localStorage.setItem;
      const localFault = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
        if ((stage === 'bookmarks' && key.startsWith('otium_bookmarks_')) ||
            (stage === 'annotations' && key.startsWith('otium_annos_'))) {
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        }
        setItem(key, value);
      });
      const put = IDBObjectStore.prototype.put;
      const dbFault = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
        const request = put.call(this, value, key);
        if ((stage === 'annotations' && this.name === 'annotations') ||
            (stage === 'document metadata' && this.name === STORE_NAME)) {
          request.addEventListener('success', () => this.transaction.abort());
        }
        return request;
      });

      await expect(applyBackupJson(backup)).rejects.toThrow(`Could not save the restored ${stage}.`);
      localFault.mockRestore();
      dbFault.mockRestore();
      await closeDocumentDatabase();
      expect(await getDocumentFromStorage(DOC_ID)).toEqual(bytes);
      expect(await loadStoredAnnotations(DOC_ID)).toEqual([expect.objectContaining({ id: annotation.id })]);
      expect(getStoredBookmarks(DOC_ID)).toEqual(bookmarks);
      expect((await applyBackupJson(backup)).summary).toMatchObject({ documents: 1, annotations: 1, bookmarks: 1 });
      expect(await loadStoredAnnotations(DOC_ID)).toHaveLength(1);
      expect(getStoredBookmarks(DOC_ID)).toEqual(bookmarks);
    },
  );

  it('preserves existing entries when a backup cannot read the annotations it would merge', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4\nlocal').buffer;
    await saveDocumentToStorage(DOC_ID, 'local.pdf', bytes, 20, 6);
    await saveStoredAnnotations(DOC_ID, [annotation]);
    const backup = await createBackupJson('1.9.17');
    const localOnly = { ...annotation, id: 'local-only', note: 'Added after exporting' };
    await saveStoredAnnotations(DOC_ID, [annotation, localOnly]);
    const get = IDBObjectStore.prototype.get;
    const fault = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, key) {
      if (this.name === 'annotations') throw new DOMException('Database unavailable', 'InvalidStateError');
      return get.call(this, key);
    });

    await expect(applyBackupJson(backup)).rejects.toMatchObject({ name: 'InvalidStateError' });
    fault.mockRestore();
    expect(await loadStoredAnnotations(DOC_ID)).toEqual([
      expect.objectContaining({ id: annotation.id }),
      expect.objectContaining({ id: localOnly.id, note: localOnly.note }),
    ]);
    await applyBackupJson(backup);
    expect(await loadStoredAnnotations(DOC_ID)).toHaveLength(2);
  });
});
