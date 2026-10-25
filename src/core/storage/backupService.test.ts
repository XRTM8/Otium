import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { TextAnnotation } from '../types';
import { loadStoredAnnotations, saveStoredAnnotations } from './annotations';
import { getStoredBookmarks, saveStoredBookmarks } from './bookmarks';
import { applyBackupJson, createBackupJson } from './backupService';
import {
  clearAllStoredDocuments,
  closeDocumentDatabase,
  getRecentDocumentsList,
  saveDocumentToStorage
} from './documents';

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
});
