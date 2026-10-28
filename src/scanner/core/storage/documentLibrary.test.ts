import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteDocumentFromLibrary,
  exportVaultBackup,
  getAllLibraryDocuments,
  restoreVaultBackup,
  saveDocumentToLibrary,
} from './documentLibrary';

describe('documentLibrary storage', () => {
  beforeEach(async () => {
    // Clear documents before each test
    const docs = await getAllLibraryDocuments();
    for (const doc of docs) {
      await deleteDocumentFromLibrary(doc.id);
    }
  });

  it('saves and retrieves library documents sorted by createdAt desc', async () => {
    const fakePdf1 = new Blob(['%PDF-1.4 Doc 1'], { type: 'application/pdf' });
    const fakePdf2 = new Blob(['%PDF-1.4 Doc 2'], { type: 'application/pdf' });

    await saveDocumentToLibrary({
      id: 'doc-1',
      title: 'First Invoice',
      pageCount: 2,
      thumbnail: 'data:image/jpeg;base64,123',
      pdfBlob: fakePdf1,
      createdAt: 1000,
    } as any);

    await saveDocumentToLibrary({
      id: 'doc-2',
      title: 'Second Contract',
      pageCount: 5,
      thumbnail: 'data:image/jpeg;base64,456',
      pdfBlob: fakePdf2,
      createdAt: 2000,
    } as any);

    const docs = await getAllLibraryDocuments();
    expect(docs.length).toBe(2);
    expect(docs[0].id).toBe('doc-2');
    expect(docs[1].id).toBe('doc-1');
  });

  it('deletes a document from the library', async () => {
    const fakePdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' });

    await saveDocumentToLibrary({
      id: 'doc-delete-test',
      title: 'Temporary Doc',
      pageCount: 1,
      thumbnail: 'thumb',
      pdfBlob: fakePdf,
    });

    let docs = await getAllLibraryDocuments();
    expect(docs.some((d) => d.id === 'doc-delete-test')).toBe(true);

    await deleteDocumentFromLibrary('doc-delete-test');
    docs = await getAllLibraryDocuments();
    expect(docs.some((d) => d.id === 'doc-delete-test')).toBe(false);
  });

  it('exports and restores a vault backup successfully', async () => {
    const fakePdf = new Blob(['%PDF-1.4 sample content'], { type: 'application/pdf' });

    await saveDocumentToLibrary({
      id: 'doc-backup',
      title: 'Backup Target',
      pageCount: 3,
      thumbnail: 'thumb-data',
      pdfBlob: fakePdf,
    });

    const backupBlob = await exportVaultBackup();
    expect(backupBlob).toBeDefined();

    // Clear library
    await deleteDocumentFromLibrary('doc-backup');
    let docs = await getAllLibraryDocuments();
    expect(docs.length).toBe(0);

    // Restore from backup
    const restoredCount = await restoreVaultBackup(backupBlob);
    expect(restoredCount).toBe(1);

    docs = await getAllLibraryDocuments();
    expect(docs.length).toBe(1);
    expect(docs[0].title).toBe('Backup Target');
  });
});
