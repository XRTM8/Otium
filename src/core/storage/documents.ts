// Local document storage. Metadata and PDF bytes live in separate object
// stores so listing the library never deserialises hundreds of megabytes.
import { fingerprintDocument } from './documentIdentity';

const DB_NAME = 'otium_reader_db';
const LEGACY_DB_NAME = 'tirs_reader_db';
const STORE_NAME = 'documents';
const FILES_STORE = 'documentFiles';
const DB_VERSION = 2;

/** Keep at most this many actual PDF payloads on the device. */
export const MAX_STORED_PDFS = 12;
/** Soft byte budget for stored PDFs. A single larger PDF is still kept. */
export const MAX_STORED_BYTES = 1024 * 1024 * 1024;
/** Restored metadata is tiny, but it should not grow without a bound. */
export const MAX_METADATA_ENTRIES = 50;

export interface RecentDocItem {
  id: string;
  name: string;
  lastOpened: number;
  lastPage: number;
  totalPages: number;
  sizeBytes: number;
  /** False for a restored entry whose PDF has not been re-imported yet. */
  available: boolean;
}

export interface StoredDocumentRecord {
  id: string;
  name: string;
  lastOpened: number;
  lastPage: number;
  totalPages: number;
  sizeBytes: number;
  fingerprint?: string;
  hasFile?: boolean;
  metadataOnly?: boolean;
  /** Legacy v1 records kept their bytes inline. Read lazily and migrated. */
  data?: ArrayBuffer;
}

export interface RestorableDocumentMetadata {
  id: string;
  name: string;
  lastOpened?: number;
  lastPage: number;
  totalPages: number;
  sizeBytes: number;
}

export interface StorageSummary {
  documents: number;
  bytes: number;
  maxDocuments: number;
  maxBytes: number;
  restoredOnly: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let migrationPromise: Promise<void> | null = null;

function normalizeRecord(raw: StoredDocumentRecord): StoredDocumentRecord {
  const totalPages = Math.max(1, Math.round(Number(raw.totalPages) || 1));
  const lastPage = Math.min(totalPages, Math.max(1, Math.round(Number(raw.lastPage) || 1)));
  const hasFile = raw.hasFile ?? Boolean(raw.data);

  return {
    ...raw,
    id: String(raw.id),
    name: String(raw.name || 'document.pdf'),
    lastOpened: Number(raw.lastOpened) || Date.now(),
    lastPage,
    totalPages,
    sizeBytes: Math.max(0, Number(raw.sizeBytes) || (raw.data?.byteLength ?? 0)),
    hasFile,
    metadataOnly: raw.metadataOnly ?? !hasFile
  };
}

function toRecentDoc(raw: StoredDocumentRecord): RecentDocItem {
  const record = normalizeRecord(raw);
  return {
    id: record.id,
    name: record.name,
    lastOpened: record.lastOpened,
    lastPage: record.lastPage,
    totalPages: record.totalPages,
    sizeBytes: record.sizeBytes,
    available: Boolean(record.hasFile || record.data)
  };
}

async function migrateLegacyDatabase(targetDb: IDBDatabase): Promise<void> {
  if (migrationPromise) return migrationPromise;

  migrationPromise = new Promise<void>((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve();
      return;
    }

    let settled = false;
    const finish = (legacyDb: IDBDatabase | null, removeLegacy: boolean) => {
      if (settled) return;
      settled = true;

      try {
        legacyDb?.close();
      } catch {
        // Already closed.
      }

      if (!removeLegacy) {
        resolve();
        return;
      }

      // Once its records are copied, the old database must go. Leaving it in
      // place would re-import stale progress on every launch and overwrite the
      // current library.
      try {
        const cleanup = indexedDB.deleteDatabase(LEGACY_DB_NAME);
        cleanup.onsuccess = () => resolve();
        cleanup.onerror = () => resolve();
        cleanup.onblocked = () => resolve();
      } catch {
        resolve();
      }
    };

    const request = indexedDB.open(LEGACY_DB_NAME);
    request.onerror = () => finish(null, false);
    request.onblocked = () => finish(null, false);
    request.onsuccess = () => {
      const legacyDb = request.result;
      try {
        if (!legacyDb.objectStoreNames.contains(STORE_NAME)) {
          finish(legacyDb, true);
          return;
        }

        const tx = legacyDb.transaction(STORE_NAME, 'readonly');
        const getAll = tx.objectStore(STORE_NAME).getAll();
        getAll.onerror = () => finish(legacyDb, false);
        getAll.onsuccess = () => {
          const records = (getAll.result || []) as StoredDocumentRecord[];
          if (records.length === 0) {
            finish(legacyDb, true);
            return;
          }

          const targetTx = targetDb.transaction([STORE_NAME, FILES_STORE], 'readwrite');
          const docs = targetTx.objectStore(STORE_NAME);
          const files = targetTx.objectStore(FILES_STORE);

          for (const record of records) {
            if (!record?.id) continue;

            // The v2 record is authoritative. Legacy data only fills gaps, so
            // an old database can never roll back newer reading progress.
            const existing = docs.get(record.id);
            existing.onsuccess = () => {
              if (existing.result) return;

              const data = record.data;
              const { data: _data, ...metadata } = record;
              docs.put({
                ...metadata,
                hasFile: Boolean(data),
                metadataOnly: !data
              });
              if (data) files.put({ id: record.id, data });
            };
          }

          targetTx.oncomplete = () => finish(legacyDb, true);
          targetTx.onerror = () => finish(legacyDb, false);
          targetTx.onabort = () => finish(legacyDb, false);
        };
      } catch {
        finish(legacyDb, false);
      }
    };
  });

  return migrationPromise;
}

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      dbPromise = null;
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        db.createObjectStore(FILES_STORE, { keyPath: 'id' });
      }

      // Version 1 kept the entire PDF inside each metadata record. Move those
      // buffers into the files store during the upgrade so listing recents no
      // longer deserialises every stored book.
      if (event.oldVersion < 2 && tx && db.objectStoreNames.contains(STORE_NAME)) {
        const docs = tx.objectStore(STORE_NAME);
        const files = tx.objectStore(FILES_STORE);
        const cursorRequest = docs.openCursor();

        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;

          const record = cursor.value as StoredDocumentRecord;
          if (record?.id && record.data) {
            const { data: _data, ...metadata } = record;
            files.put({ id: record.id, data: record.data });
            cursor.update({ ...metadata, hasFile: true, metadataOnly: false });
          }

          cursor.continue();
        };
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      void migrateLegacyDatabase(db)
        .catch(() => {})
        .then(() => resolve(db));
    };

    request.onerror = () => {
      const err = request.error;
      dbPromise = null;
      if (err?.name === 'VersionError') {
        console.warn('IndexedDB version error. Resetting database to recover...', err);
        try {
          indexedDB.deleteDatabase(DB_NAME);
        } catch {
          // ignore
        }
      }
      reject(err);
    };
    request.onblocked = () => {
      dbPromise = null;
      reject(new Error('IndexedDB blocked'));
    };
  });

  return dbPromise;
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

function readAllMetadata(db: IDBDatabase): Promise<StoredDocumentRecord[]> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result || []) as StoredDocumentRecord[]);
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function readMetadata(db: IDBDatabase, id: string): Promise<StoredDocumentRecord | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve((request.result as StoredDocumentRecord | undefined) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function readFile(db: IDBDatabase, id: string): Promise<ArrayBuffer | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(FILES_STORE, 'readonly');
      const request = tx.objectStore(FILES_STORE).get(id);
      request.onsuccess = () => {
        const record = request.result as { id: string; data?: ArrayBuffer } | undefined;
        resolve(record?.data ?? null);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

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
    const tx = db.transaction([STORE_NAME, FILES_STORE], 'readwrite');

    tx.objectStore(STORE_NAME).put({
      id,
      name,
      lastOpened: Date.now(),
      lastPage,
      totalPages: total,
      sizeBytes: data.byteLength,
      fingerprint: id,
      hasFile: true,
      metadataOnly: false
    });
    tx.objectStore(FILES_STORE).put({ id, data });

    await transactionDone(tx);
    void pruneStorage(id);
  } catch (err) {
    console.warn('IndexedDB save failed:', err);
  }
}

export async function updateDocumentPage(id: string, page: number): Promise<void> {
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
      lastOpened: Date.now()
    });
    await transactionDone(tx);
  } catch {
    // Progress is best-effort; the PDF remains readable without it.
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
): Promise<void> {
  const id = metadata.id;
  if (!id) return;

  try {
    const db = await openDB();
    const existing = await readMetadata(db, id);
    const totalPages = Math.max(1, Math.round(metadata.totalPages) || 1);
    const lastPage = Math.min(totalPages, Math.max(1, Math.round(metadata.lastPage) || 1));
    const lastOpened = Number(metadata.lastOpened) || Date.now();

    if (existing) {
      const current = normalizeRecord(existing);
      const { data: _data, ...currentMetadata } = current;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({
        ...currentMetadata,
        name: metadata.name || current.name,
        lastOpened,
        lastPage,
        totalPages,
        sizeBytes: Math.max(current.sizeBytes, Number(metadata.sizeBytes) || 0)
      });
      await transactionDone(tx);
      return;
    }

    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      id,
      name: metadata.name || 'document.pdf',
      lastOpened,
      lastPage,
      totalPages,
      sizeBytes: Math.max(0, Number(metadata.sizeBytes) || 0),
      fingerprint: id,
      hasFile: false,
      metadataOnly: true
    });
    await transactionDone(tx);
    void pruneStorage(id);
  } catch (error) {
    console.warn('Could not restore document metadata:', error);
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
    tx.objectStore(STORE_NAME).delete(legacyId);
    tx.objectStore(FILES_STORE).delete(legacyId);
    await transactionDone(tx);
  } catch {
    // Keeping both entries is harmless; the new one is the canonical record.
  }
}

/** Closes the cached handle. Used by tests and by full storage resets. */
export async function closeDocumentDatabase(): Promise<void> {
  if (!dbPromise) return;
  try {
    const db = await dbPromise;
    db.close();
  } catch {
    // ignore
  } finally {
    dbPromise = null;
    migrationPromise = null;
  }
}
