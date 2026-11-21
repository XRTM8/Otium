import { appIndexedDB } from '../../../platform/storage';
import { isTauriRuntime } from '../../../platform/runtime';
import { sealBytesWithRust, unsealBytesWithRust } from '../../../platform/rustEngine';
/**
 * Persistent Document Library Store for Otium Scan.
 * Saves compiled PDFs and scan sessions so users can access, re-read,
 * and share previous scans days or weeks later.
 */

import type { DocumentCategory } from '../types';
import { isPdfBuffer } from '../../../core/pdf/document';
import { stripControlChars } from '../../../core/utils/textSanitize';

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
    const req = appIndexedDB.open(DB_NAME, 1);

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
        } catch (err) {
          console.debug('[ScannerLibrary] db close skipped:', err);
        }
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
  doc: Omit<LibraryDocument, 'createdAt'> & { createdAt?: number }
): Promise<void> {
  const db = await getLibraryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const item: LibraryDocument = {
      ...doc,
      createdAt: doc.createdAt ?? Date.now(),
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

const MAGIC_WEB_SEAL = new Uint8Array([0x4f, 0x54, 0x4d, 0x57, 0x31]); // OTMW1

async function sealWithWebCrypto(bytes: Uint8Array, passphrase: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    aesKey,
    bytes as unknown as BufferSource
  );

  const totalLen = MAGIC_WEB_SEAL.length + salt.length + iv.length + ciphertext.byteLength;
  const result = new Uint8Array(totalLen);
  result.set(MAGIC_WEB_SEAL, 0);
  result.set(salt, MAGIC_WEB_SEAL.length);
  result.set(iv, MAGIC_WEB_SEAL.length + salt.length);
  result.set(new Uint8Array(ciphertext), MAGIC_WEB_SEAL.length + salt.length + iv.length);

  return result;
}

async function unsealWithWebCrypto(sealed: Uint8Array, passphrase: string): Promise<Uint8Array> {
  const headerLen = MAGIC_WEB_SEAL.length;
  const salt = sealed.subarray(headerLen, headerLen + 16);
  const iv = sealed.subarray(headerLen + 16, headerLen + 16 + 12);
  const ciphertext = sealed.subarray(headerLen + 16 + 12);

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase) as unknown as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      aesKey,
      ciphertext as unknown as BufferSource
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new Error('فشل فك تشفير النسخة الاحتياطية. تأكد من صحة كلمة المرور.');
  }
}

/**
 * Exports entire document library into an offline portable .otiumvault backup package.
 * Optionally encrypts with passphrase using Rust Argon2id+ChaCha20 or WebCrypto AES-GCM.
 */
export async function exportVaultBackup(passphrase?: string): Promise<Blob> {
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

  const jsonBytes = new TextEncoder().encode(JSON.stringify(envelope));

  if (passphrase && passphrase.trim().length > 0) {
    if (isTauriRuntime()) {
      const rustSealed = await sealBytesWithRust(jsonBytes, passphrase);
      if (rustSealed) {
        return new Blob([rustSealed.buffer as ArrayBuffer], { type: 'application/octet-stream' });
      }
    }
    const webSealed = await sealWithWebCrypto(jsonBytes, passphrase);
    return new Blob([webSealed.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  }

  return new Blob([jsonBytes.buffer as ArrayBuffer], { type: 'application/json' });
}

/**
 * Restores document library from an uploaded .otiumvault backup package.
 * Implements strict size gating, password decryption for encrypted backups,
 * JSON prototype pollution prevention, and binary PDF magic byte header verification.
 */
export async function restoreVaultBackup(backupBlob: Blob, passphrase?: string): Promise<number> {
  if (backupBlob.size > 200 * 1024 * 1024) {
    throw new Error('حجم ملف النسخة الاحتياطية كبير جداً (الحد الأقصى 200 ميجابايت)');
  }

  const arrayBuffer = await backupBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  let text: string;

  const isRustSealed =
    bytes.length >= 5 &&
    bytes[0] === 0x4f &&
    bytes[1] === 0x54 &&
    bytes[2] === 0x4d &&
    bytes[3] === 0x56 &&
    bytes[4] === 0x31; // OTMV1

  const isWebSealed =
    bytes.length >= 5 &&
    bytes[0] === 0x4f &&
    bytes[1] === 0x54 &&
    bytes[2] === 0x4d &&
    bytes[3] === 0x57 &&
    bytes[4] === 0x31; // OTMW1

  if (isRustSealed || isWebSealed) {
    let pass = passphrase;
    if (!pass && typeof window !== 'undefined' && typeof window.prompt === 'function') {
      const prompted = window.prompt('أدخل كلمة المرور لفك تشفير النسخة الاحتياطية:');
      if (prompted) pass = prompted;
    }
    if (!pass) {
      throw new Error('ملف النسخة الاحتياطية مشفر ويتطلب كلمة مرور');
    }

    let decryptedBytes: Uint8Array | null = null;
    if (isRustSealed) {
      decryptedBytes = await unsealBytesWithRust(bytes, pass);
      if (!decryptedBytes) {
        throw new Error('فشل فك تشفير النسخة الاحتياطية. تأكد من صحة كلمة المرور.');
      }
    } else {
      decryptedBytes = await unsealWithWebCrypto(bytes, pass);
    }
    text = new TextDecoder().decode(decryptedBytes);
  } else {
    text = new TextDecoder().decode(bytes);
  }
  let envelope: VaultBackupEnvelope;
  try {
    envelope = JSON.parse(text, (key, value) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return undefined;
      }
      return value;
    }) as VaultBackupEnvelope;
  } catch {
    throw new Error('ملف النسخة الاحتياطية ليس بتنسيق JSON صالح');
  }

  const acceptedApps = ['Otium', 'Otium Scan'];
  if (
    !envelope ||
    typeof envelope !== 'object' ||
    !acceptedApps.includes(envelope.app) ||
    !Array.isArray(envelope.documents)
  ) {
    throw new Error('Invalid or corrupted .otiumvault backup file');
  }

  if (envelope.documents.length > 500) {
    throw new Error('النسخة الاحتياطية تحتوي على عدد مستندات يتجاوز الحد المسموح به (500 مستند)');
  }

  let restoredCount = 0;
  for (const item of envelope.documents) {
    if (!item || typeof item !== 'object' || typeof item.pdfBase64 !== 'string') {
      continue;
    }

    try {
      const byteChars = atob(item.pdfBase64);
      if (byteChars.length > 100 * 1024 * 1024) {
        continue;
      }

      const byteNumbers = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }

      // Verify PDF magic header
      if (!isPdfBuffer(byteNumbers.buffer)) {
        continue;
      }

      const pdfBlob = new Blob([byteNumbers], { type: 'application/pdf' });
      const safeTitle = stripControlChars(typeof item.title === 'string' ? item.title : 'مستند مستعاد')
        .trim()
        .slice(0, 256) || 'مستند مستعاد';

      const safeId = stripControlChars(
        typeof item.id === 'string' && item.id.trim()
          ? item.id
          : `doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
      )
        .slice(0, 128);

      const safeThumb = typeof item.thumbnail === 'string' && item.thumbnail.startsWith('data:image/')
        ? item.thumbnail
        : '';

      const safePageCount = Number.isFinite(item.pageCount) && item.pageCount > 0
        ? Math.min(10000, Math.round(item.pageCount))
        : 1;

      await saveDocumentToLibrary({
        id: safeId,
        title: safeTitle,
        pageCount: safePageCount,
        thumbnail: safeThumb,
        pdfBlob,
      });
      restoredCount++;
    } catch {
      // Skip invalid or corrupted individual document entry
      continue;
    }
  }

  return restoredCount;
}
