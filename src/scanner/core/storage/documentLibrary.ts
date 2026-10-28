/**
 * Persistent Document Library Store for Otium Scan.
 * Saves compiled PDFs and scan sessions so users can access, re-read,
 * and share previous scans days or weeks later.
 */

import type { DocumentCategory } from '../types';

const DB_NAME = 'otium_scan_library';
const STORE_NAME = 'documents';

export interface LibraryDocument {
  id: string;
  title: string;
  pageCount: number;
  thumbnail: string;
  pdfBlob: Blob;
  createdAt: number;
  category?: DocumentCategory;
  ocrText?: string;
}

let dbInstance: IDBDatabase | null = null;

async function getLibraryDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => {
      dbInstance = req.result;
      dbInstance.onversionchange = () => {
        try {
          dbInstance?.close();
        } catch {}
        dbInstance = null;
      };
      dbInstance.onclose = () => {
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    req.onerror = () => {
      dbInstance = null;
      reject(req.error);
    };

    req.onblocked = () => {
      dbInstance = null;
      reject(new Error('IndexedDB blocked'));
    };
  });
}

export async function saveDocumentToLibrary(
  doc: Omit<LibraryDocument, 'createdAt'>
): Promise<void> {
  const db = await getLibraryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const item: LibraryDocument = {
      ...doc,
      createdAt: (doc as any).createdAt ?? Date.now(),
    };
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllLibraryDocuments(): Promise<LibraryDocument[]> {
  const db = await getLibraryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const docs = (req.result as LibraryDocument[]) || [];
      docs.sort((a, b) => b.createdAt - a.createdAt);
      resolve(docs);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteDocumentFromLibrary(id: string): Promise<void> {
  const db = await getLibraryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

interface VaultBackupEnvelope {
  /** New exports say Otium; `Otium Scan` is accepted so old backups still restore. */
  app: 'Otium' | 'Otium Scan';
  version: 1;
  exportedAt: number;
  documents: {
    id: string;
    title: string;
    pageCount: number;
    thumbnail: string;
    pdfBase64: string;
    createdAt: number;
  }[];
}

/**
 * Exports entire document library into an offline portable .otiumvault backup package.
 */
export async function exportVaultBackup(): Promise<Blob> {
  const docs = await getAllLibraryDocuments();

  const serializedDocs = await Promise.all(
    docs.map(async (doc) => {
      const buffer = await doc.pdfBlob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      const pdfBase64 = btoa(binary);

      return {
        id: doc.id,
        title: doc.title,
        pageCount: doc.pageCount,
        thumbnail: doc.thumbnail,
        pdfBase64,
        createdAt: doc.createdAt,
      };
    })
  );

  const envelope: VaultBackupEnvelope = {
    app: 'Otium',
    version: 1,
    exportedAt: Date.now(),
    documents: serializedDocs,
  };

  return new Blob([JSON.stringify(envelope)], { type: 'application/json' });
}

/**
 * Restores document library from an uploaded .otiumvault backup package.
 */
export async function restoreVaultBackup(backupBlob: Blob): Promise<number> {
  const text = await backupBlob.text();
  const envelope = JSON.parse(text) as VaultBackupEnvelope;

  const acceptedApps = ['Otium', 'Otium Scan'];
  if (!acceptedApps.includes(envelope.app) || !Array.isArray(envelope.documents)) {
    throw new Error('Invalid or corrupted .otiumvault backup file');
  }

  let restoredCount = 0;
  for (const item of envelope.documents) {
    const byteChars = atob(item.pdfBase64);
    const byteNumbers = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    const pdfBlob = new Blob([byteNumbers], { type: 'application/pdf' });

    await saveDocumentToLibrary({
      id: item.id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: item.title,
      pageCount: item.pageCount,
      thumbnail: item.thumbnail,
      pdfBlob,
    });
    restoredCount++;
  }

  return restoredCount;
}
