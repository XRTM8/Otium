// Local document storage. Metadata and PDF bytes live in separate object
// stores so listing the library never deserialises hundreds of megabytes.
import { fingerprintDocument } from './documentIdentity';
import {
  FILES_STORE,
  MAX_METADATA_ENTRIES,
  MAX_STORED_BYTES,
  MAX_STORED_PDFS,
  STORE_NAME,
  closeDocumentDatabase,
  normalizeRecord,
  openDB,
  readAllMetadata,
  readFile,
  readMetadata,
  toRecentDoc,
  transactionDone,
  type RecentDocItem,
  type RestorableDocumentMetadata,
  type StorageSummary,
  type StoredDocumentRecord,
} from './documentsDb';

export {
  MAX_METADATA_ENTRIES,
  MAX_STORED_BYTES,
  MAX_STORED_PDFS,
  closeDocumentDatabase,
  type RecentDocItem,
  type RestorableDocumentMetadata,
  type StorageSummary,
  type StoredDocumentRecord,
};

/**
 * Keeps up to `MAX_STORED_PDFS` PDF payloads inside a 1 GB soft budget.
 * Documents beyond the budget become metadata-only entries: their highlights,
 * notes, bookmarks and last page survive, and the PDF can be re-imported later.
 */
async function pruneStorage(protectedId: string): Promise<void> {
  const db = await openDB();
  const all = (await readAllMetadata(db)).map(normalizeRecord);
  if (all.length === 0) return;

  const fileDocs = all
    .filter((record) => record.hasFile || record.data)
    .sort((a, b) => {
      if (a.id === protectedId) return -1;
      if (b.id === protectedId) return 1;
      return b.lastOpened - a.lastOpened;
    });

  let count = 0;
  let bytes = 0;
  const evict = new Set<string>();

  for (const record of fileDocs) {
    const size = record.sizeBytes || record.data?.byteLength || 0;
    const isProtected = record.id === protectedId;
    const fits = count < MAX_STORED_PDFS && bytes + size <= MAX_STORED_BYTES;
    if (isProtected || fits) {
      count += 1;
      bytes += size;
    } else {
      evict.add(record.id);
    }
  }

  const metadataOnly = all
    .filter((record) => !record.hasFile && !record.data)
    .sort((a, b) => b.lastOpened - a.lastOpened);
  const removeMetadata = new Set(metadataOnly.slice(MAX_METADATA_ENTRIES).map((record) => record.id));

  if (evict.size === 0 && removeMetadata.size === 0) return;

  try {
    const tx = db.transaction([STORE_NAME, FILES_STORE], 'readwrite');
    const docs = tx.objectStore(STORE_NAME);
    const files = tx.objectStore(FILES_STORE);

    for (const id of evict) {
      if (id === protectedId) continue;
      const record = all.find((item) => item.id === id);
      if (!record) continue;
      files.delete(id);
      const { data: _data, ...withoutBytes } = record;
      docs.put({ ...withoutBytes, hasFile: false, metadataOnly: true });
    }

    for (const id of removeMetadata) {
      if (id === protectedId) continue;
      docs.delete(id);
      files.delete(id);
    }

    await transactionDone(tx);
  } catch (error) {
    console.warn('Document storage pruning failed:', error);
  }
}

export async function saveDocumentToStorage(
  id: string,
  name: string,
  data: ArrayBuffer,
  totalPages: number,
  page: number = 1
): Promise<void> {
  if (!id) return;

  try {
    if (!data || data.byteLength === 0) {
      await updateDocumentPage(id, page);
      return;
    }

    const db = await openDB();
    const total = Math.max(1, Math.round(totalPages) || 1);
    const lastPage = Math.min(total, Math.max(1, Math.round(page) || 1));
    const metadata = {
      id,
      name,
      lastOpened: Date.now(),
      lastPage,
      totalPages: total,
      sizeBytes: data.byteLength,
      fingerprint: id,
    };

    try {
      const tx = db.transaction([STORE_NAME, FILES_STORE], 'readwrite');
      try {
        tx.objectStore(STORE_NAME).put({ ...metadata, hasFile: true, metadataOnly: false });
        tx.objectStore(FILES_STORE).put({ id, data });
      } catch (error) {
        // Synchronous request errors leave previously queued writes active.
        tx.abort();
        throw error;
      }
      await transactionDone(tx);
      void pruneStorage(id);
    } catch (saveErr) {
      console.warn('Primary file storage failed, attempting quota-safe metadata fallback:', saveErr);
      const fallbackTx = db.transaction(STORE_NAME, 'readwrite');
      const docs = fallbackTx.objectStore(STORE_NAME);
      const existing = docs.get(id);
      existing.onsuccess = () => {
        const record = existing.result as StoredDocumentRecord | undefined;
        if (!record?.hasFile && !record?.data) {
          docs.put({ ...metadata, hasFile: false, metadataOnly: true });
        }
      };
      await transactionDone(fallbackTx);
    }
  } catch (err) {
    console.warn('IndexedDB save failed:', err);
  }
}

export async function updateDocumentPage(
  id: string,
  page: number,
  scrollOffsetRatio?: number
): Promise<void> {
  if (!id) return;
  try {
    const db = await openDB();
    const record = await readMetadata(db, id);
    if (!record) return;

    const normalized = normalizeRecord(record);
    const { data: _data, ...metadata } = normalized;
    const total = Math.max(1, metadata.totalPages);
    const lastPage = Math.min(total, Math.max(1, Math.round(page) || 1));
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      ...metadata,
      lastPage,
      scrollOffsetRatio:
        typeof scrollOffsetRatio === 'number' && Number.isFinite(scrollOffsetRatio)
          ? Math.max(0, Math.min(1, scrollOffsetRatio))
          : metadata.scrollOffsetRatio ?? 0,
      lastOpened: Date.now()
    });
    await transactionDone(tx);
  } catch {
    // Progress is best-effort; the PDF remains readable without it.
  }
}

export async function renameStoredDocument(id: string, newName: string): Promise<void> {
  if (!id || !newName.trim()) return;
  try {
    const db = await openDB();
    const record = await readMetadata(db, id);
    if (!record) return;

    const normalized = normalizeRecord(record);
    const { data: _data, ...metadata } = normalized;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      ...metadata,
      name: newName.trim()
    });
    await transactionDone(tx);
  } catch {
    // Best-effort rename
  }
}

export async function getDocumentFromStorage(id: string): Promise<ArrayBuffer | null> {
  if (!id) return null;
  try {
    const db = await openDB();
    const file = await readFile(db, id);
    if (file) return file;

    // v1 stored bytes inline. Move them once so future library listings stay
    // lightweight, then return the same buffer to the caller.
    const record = await readMetadata(db, id);
    if (!record?.data) return null;

    const data = record.data;
    const { data: _inline, ...metadata } = normalizeRecord(record);
    try {
      const tx = db.transaction([STORE_NAME, FILES_STORE], 'readwrite');
      tx.objectStore(FILES_STORE).put({ id, data });
      tx.objectStore(STORE_NAME).put({ ...metadata, hasFile: true, metadataOnly: false });
      await transactionDone(tx);
    } catch {
      // Returning the inline copy is enough for this session.
    }
    return data;
  } catch {
    return null;
  }
}

export async function getRecentDocumentsList(): Promise<RecentDocItem[]> {
  try {
    const db = await openDB();
    const all = (await readAllMetadata(db)).map(toRecentDoc);
    all.sort((a, b) => b.lastOpened - a.lastOpened);
    return all;
  } catch {
    return [];
  }
}

export async function getStorageSummary(): Promise<StorageSummary> {
  try {
    const db = await openDB();
    const records = (await readAllMetadata(db)).map(normalizeRecord);
    const withFiles = records.filter((record) => record.hasFile || record.data);
    return {
      documents: withFiles.length,
      bytes: withFiles.reduce((total, record) => total + (record.sizeBytes || 0), 0),
      maxDocuments: MAX_STORED_PDFS,
      maxBytes: MAX_STORED_BYTES,
      restoredOnly: records.filter((record) => !record.hasFile && !record.data).length
    };
  } catch {
    return {
      documents: 0,
      bytes: 0,
      maxDocuments: MAX_STORED_PDFS,
      maxBytes: MAX_STORED_BYTES,
      restoredOnly: 0
    };
  }
}

export async function removeDocumentFromStorage(id: string): Promise<void> {
  if (!id) return;
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_NAME, FILES_STORE], 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.objectStore(FILES_STORE).delete(id);
    await transactionDone(tx);
  } catch {
    // ignore
  }
}

export async function clearAllStoredDocuments(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_NAME, FILES_STORE], 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.objectStore(FILES_STORE).clear();
    await transactionDone(tx);
  } catch {
    // ignore
  }
}

/**
 * Restores progress metadata for a document. Existing PDF bytes are preserved;
 * an entry with no local file becomes a re-importable metadata-only record.
 */
export async function restoreDocumentMetadata(
  metadata: RestorableDocumentMetadata
): Promise<boolean> {
  const id = metadata.id;
  if (!id) return false;

  try {
    const db = await openDB();
    const totalPages = Math.max(1, Math.round(metadata.totalPages) || 1);
    const lastPage = Math.min(totalPages, Math.max(1, Math.round(metadata.lastPage) || 1));
    const lastOpened = Number(metadata.lastOpened) || Date.now();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const docs = tx.objectStore(STORE_NAME);
    const existing = docs.get(id);
    existing.onsuccess = () => {
      const record = existing.result as StoredDocumentRecord | undefined;
      const current = record ? normalizeRecord(record) : {
        id, name: 'document.pdf', fingerprint: id, hasFile: false, metadataOnly: true, sizeBytes: 0,
      };
      docs.put({
        ...current,
        name: metadata.name || current.name,
        lastOpened,
        lastPage,
        totalPages,
        sizeBytes: Math.max(current.sizeBytes, Number(metadata.sizeBytes) || 0),
      });
    };
    await transactionDone(tx);
    if (!existing.result) void pruneStorage(id);
    return true;
  } catch (error) {
    console.warn('Could not restore document metadata:', error);
    return false;
  }
}

/**
 * Removes a legacy filename-keyed record once its bytes have been proven to
 * match the fingerprint-keyed record. Progress and annotations are read from
 * their own stores and are not deleted here.
 */
export async function adoptLegacyDocumentRecord(
  legacyId: string,
  documentId: string
): Promise<void> {
  if (!legacyId || !documentId || legacyId === documentId) return;

  try {
    const db = await openDB();
    const legacy = await readMetadata(db, legacyId);
    if (!legacy) return;

    const data = (await readFile(db, legacyId)) ?? legacy.data;
    if (!data) return;

    const fingerprint = await fingerprintDocument(data);
    if (fingerprint !== documentId) return;

    const tx = db.transaction([STORE_NAME, FILES_STORE], 'readwrite');
    const files = tx.objectStore(FILES_STORE);
    const replacement = files.getKey(documentId);
    replacement.onsuccess = () => {
      if (replacement.result === undefined) return;
      tx.objectStore(STORE_NAME).delete(legacyId);
      files.delete(legacyId);
    };
    await transactionDone(tx);
  } catch {
    // Keeping both entries is harmless; the new one is the canonical record.
  }
}
