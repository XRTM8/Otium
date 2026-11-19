import { appIndexedDB } from '../../platform/storage';

export const DB_NAME = 'otium_reader_db';
export const LEGACY_DB_NAME = 'tirs_reader_db';
export const STORE_NAME = 'documents';
export const FILES_STORE = 'documentFiles';
export const DB_VERSION = 2;

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
  scrollOffsetRatio?: number;
  coverUrl?: string;
}

export interface StoredDocumentRecord {
  id: string;
  name: string;
  lastOpened: number;
  lastPage: number;
  totalPages: number;
  sizeBytes: number;
  scrollOffsetRatio?: number;
  fingerprint?: string;
  hasFile?: boolean;
  metadataOnly?: boolean;
  coverUrl?: string;
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

export function normalizeRecord(raw: StoredDocumentRecord): StoredDocumentRecord {
  const totalPages = Math.max(1, Math.round(Number(raw.totalPages) || 1));
  const lastPage = Math.min(totalPages, Math.max(1, Math.round(Number(raw.lastPage) || 1)));
  const hasFile = raw.hasFile ?? Boolean(raw.data);
  const coverUrl =
    typeof raw.coverUrl === 'string' &&
    (raw.coverUrl.startsWith('data:image/') ||
      raw.coverUrl.startsWith('blob:') ||
      raw.coverUrl.startsWith('http'))
      ? raw.coverUrl
      : undefined;

  return {
    ...raw,
    id: String(raw.id),
    name: String(raw.name || 'document.pdf'),
    lastOpened: Number(raw.lastOpened) || Date.now(),
    lastPage,
    totalPages,
    sizeBytes: Math.max(0, Number(raw.sizeBytes) || (raw.data?.byteLength ?? 0)),
    hasFile,
    metadataOnly: raw.metadataOnly ?? !hasFile,
    coverUrl,
  };
}

export function toRecentDoc(raw: StoredDocumentRecord): RecentDocItem {
  const record = normalizeRecord(raw);
  return {
    id: record.id,
    name: record.name,
    lastOpened: record.lastOpened,
    lastPage: record.lastPage,
    totalPages: record.totalPages,
    sizeBytes: record.sizeBytes,
    available: Boolean(record.hasFile || record.data),
    scrollOffsetRatio: record.scrollOffsetRatio,
    coverUrl: record.coverUrl,
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

      try {
        const cleanup = appIndexedDB.deleteDatabase(LEGACY_DB_NAME);
        cleanup.onsuccess = () => resolve();
        cleanup.onerror = () => resolve();
        cleanup.onblocked = () => resolve();
      } catch {
        resolve();
      }
    };

    const request = appIndexedDB.open(LEGACY_DB_NAME);
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

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      dbPromise = null;
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = appIndexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        db.createObjectStore(FILES_STORE, { keyPath: 'id' });
      }

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
      db.onversionchange = () => {
        try { db.close(); } catch (err) { console.debug('[DocumentsDb] db close skipped:', err); }
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      void migrateLegacyDatabase(db)
        .then(undefined, (err: unknown) => {
          console.warn('[DocumentsDb] Legacy database migration failed:', err);
        })
        .then(() => resolve(db));
    };

    request.onerror = () => {
      const err = request.error;
      dbPromise = null;
      if (err?.name === 'VersionError') {
        console.warn('The document database requires a newer version of Otium.', err);
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

export function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

export function readAllMetadata(db: IDBDatabase): Promise<StoredDocumentRecord[]> {
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

export function readMetadata(db: IDBDatabase, id: string): Promise<StoredDocumentRecord | null> {
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

export function readFile(db: IDBDatabase, id: string): Promise<ArrayBuffer | null> {
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
