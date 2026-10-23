// Industrial-Grade Local Document Storage via IndexedDB (Instant 1-Click Reopen)
const DB_NAME = 'tirs_reader_db';
const STORE_NAME = 'documents';
const DB_VERSION = 1;

export interface RecentDocItem {
  id: string;
  name: string;
  lastOpened: number;
  lastPage: number;
  totalPages: number;
  sizeBytes: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e: any) => {
      const db: IDBDatabase = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDocumentToStorage(
  name: string,
  data: ArrayBuffer,
  totalPages: number,
  page: number = 1
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Save full document ArrayBuffer and metadata locally
    store.put({
      id: name,
      name,
      data,
      lastOpened: Date.now(),
      lastPage: page,
      totalPages,
      sizeBytes: data.byteLength
    });

    // Keep the 6 most recent documents to save hard drive space
    const allReq = store.getAll();
    allReq.onsuccess = () => {
      const all: any[] = allReq.result || [];
      if (all.length > 6) {
        all.sort((a, b) => b.lastOpened - a.lastOpened);
        const toDelete = all.slice(6);
        for (const item of toDelete) {
          store.delete(item.id);
        }
      }
    };
  } catch (err) {
    console.warn('IndexedDB save failed:', err);
  }
}

export async function updateDocumentPage(name: string, page: number): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(name);
    getReq.onsuccess = () => {
      const item = getReq.result;
      if (item) {
        item.lastPage = page;
        item.lastOpened = Date.now();
        store.put(item);
      }
    };
  } catch {
    // ignore
  }
}

export async function getDocumentFromStorage(name: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve) => {
      const req = store.get(name);
      req.onsuccess = () => {
        if (req.result && req.result.data) {
          resolve(req.result.data);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function getRecentDocumentsList(): Promise<RecentDocItem[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const all: any[] = req.result || [];
        all.sort((a, b) => b.lastOpened - a.lastOpened);
        resolve(
          all.map((item) => ({
            id: item.id,
            name: item.name,
            lastOpened: item.lastOpened,
            lastPage: item.lastPage,
            totalPages: item.totalPages,
            sizeBytes: item.sizeBytes || 0
          }))
        );
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function removeDocumentFromStorage(name: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(name);
  } catch {
    // ignore
  }
}

export async function clearAllStoredDocuments(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
  } catch {
    // ignore
  }
}
