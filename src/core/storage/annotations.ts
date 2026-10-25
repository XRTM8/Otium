import type { AnnotationQuad, AnnotationRect, TextAnnotation } from '../types';

interface ColorOption {
  id: string;
  label: string;
  hex: string;
}

export const HIGHLIGHT_COLORS: ColorOption[] = [
  { id: 'yellow', label: 'أصفر', hex: '#fde047' },
  { id: 'green', label: 'أخضر', hex: '#86efac' },
  { id: 'cyan', label: 'سماوي', hex: '#7dd3fc' },
  { id: 'pink', label: 'وردي', hex: '#f472b6' },
  { id: 'orange', label: 'برتقالي', hex: '#fb923c' }
];

export const UNDERLINE_COLORS: ColorOption[] = [
  { id: 'amber', label: 'كهرماني', hex: '#f59e0b' },
  { id: 'red', label: 'أحمر قاني', hex: '#ef4444' },
  { id: 'blue', label: 'أزرق', hex: '#3b82f6' },
  { id: 'emerald', label: 'زمردي', hex: '#10b981' }
];

const STORAGE_PREFIX = 'otium_annos_';
const DB_NAME = 'otium-reader';
const DB_VERSION = 1;
const STORE = 'annotations';

interface StoredRecord {
  /** Document fingerprint (older records use the filename here). */
  docTitle: string;
  annotations: TextAnnotation[];
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

/** Opens the shared IndexedDB database once; every call reuses the handle. */
function openDatabase(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }

    let settled = false;
    const finish = (db: IDBDatabase | null) => {
      if (settled) return;
      settled = true;
      resolve(db);
    };

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'docTitle' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      finish(db);
    };

    request.onerror = () => finish(null);
    request.onblocked = () => finish(null);
  });

  return dbPromise;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function rectFromQuad(quad: AnnotationQuad): AnnotationRect {
  const [x1, y1, x2, y2] = quad;
  return {
    xPct: clamp01(Math.min(x1, x2)),
    yPct: clamp01(Math.min(y1, y2)),
    widthPct: clamp01(Math.abs(x2 - x1)),
    heightPct: clamp01(Math.abs(y2 - y1))
  };
}

/**
 * Repairs records written by older builds. Highlights always expose page
 * relative rects, while quad points remain the portable interchange format.
 */
export function normalizeAnnotation(raw: unknown): TextAnnotation | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<TextAnnotation>;
  if (!value.id || typeof value.id !== 'string') return null;
  if (!Number.isFinite(value.pageNumber) || (value.pageNumber as number) < 1) return null;

  const quads = Array.isArray(value.quadPoints)
    ? value.quadPoints
        .filter(
          (quad): quad is AnnotationQuad =>
            Array.isArray(quad) &&
            quad.length === 4 &&
            quad.every((coordinate) => Number.isFinite(coordinate))
        )
        .map((quad) => quad.map(clamp01) as AnnotationQuad)
    : [];

  const rects = Array.isArray(value.rects)
    ? value.rects
        .filter(
          (rect): rect is AnnotationRect =>
            Boolean(rect) &&
            Number.isFinite(rect.xPct) &&
            Number.isFinite(rect.yPct) &&
            Number.isFinite(rect.widthPct) &&
            Number.isFinite(rect.heightPct)
        )
        .map((rect) => ({
          xPct: clamp01(rect.xPct),
          yPct: clamp01(rect.yPct),
          widthPct: clamp01(rect.widthPct),
          heightPct: clamp01(rect.heightPct)
        }))
    : quads.map(rectFromQuad);

  if (rects.length === 0) return null;

  const type = value.type === 'underline' ? 'underline' : 'highlight';
  const createdAt = Number.isFinite(value.createdAt) ? (value.createdAt as number) : Date.now();

  return {
    id: value.id,
    pageNumber: Math.round(value.pageNumber as number),
    type,
    color: typeof value.color === 'string' && value.color ? value.color : '#fde047',
    rects,
    quadPoints:
      quads.length > 0
        ? quads
        : rects.map<AnnotationQuad>((rect) => [
            rect.xPct,
            rect.yPct,
            rect.xPct + rect.widthPct,
            rect.yPct + rect.heightPct
          ]),
    text: typeof value.text === 'string' ? value.text : '',
    note: typeof value.note === 'string' && value.note.trim() ? value.note : undefined,
    createdAt,
    updatedAt: Number.isFinite(value.updatedAt) ? (value.updatedAt as number) : undefined
  };
}

function readLegacy(docTitle: string): TextAnnotation[] {
  if (!docTitle || typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${docTitle}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeAnnotation)
      .filter((annotation): annotation is TextAnnotation => annotation !== null);
  } catch (error) {
    console.warn('Failed to read legacy annotations:', error);
    return [];
  }
}

function writeLegacy(docTitle: string, annotations: TextAnnotation[]): void {
  if (!docTitle || typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${docTitle}`, JSON.stringify(annotations));
  } catch {
    // Quota or privacy mode: IndexedDB remains the primary store.
  }
}

async function readDatabase(docTitle: string): Promise<TextAnnotation[] | null> {
  const db = await openDatabase();
  if (!db) return null;

  return new Promise<TextAnnotation[] | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(docTitle);
      request.onsuccess = () => {
        const record = request.result as StoredRecord | undefined;
        if (!record || !Array.isArray(record.annotations)) {
          resolve(null);
          return;
        }
        resolve(
          record.annotations
            .map(normalizeAnnotation)
            .filter((annotation): annotation is TextAnnotation => annotation !== null)
        );
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeDatabase(docTitle: string, annotations: TextAnnotation[]): Promise<boolean> {
  const db = await openDatabase();
  if (!db) return false;

  return new Promise<boolean>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const record: StoredRecord = { docTitle, annotations, updatedAt: Date.now() };
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** Loads annotations from IndexedDB, migrating legacy filename-keyed records. */
export async function loadStoredAnnotations(
  docKey: string,
  legacyTitle?: string
): Promise<TextAnnotation[]> {
  if (!docKey || typeof window === 'undefined') return [];

  const fromDb = await readDatabase(docKey);
  if (fromDb !== null) return fromDb;

  const legacyKey = legacyTitle && legacyTitle !== docKey ? legacyTitle : '';
  if (!legacyKey) return [];

  // Pre-1.5 stored annotations in this same database under the filename. Read
  // it before the localStorage fallback, otherwise an upgrade would look like
  // every highlight had vanished until the file was opened from the old app.
  const legacyDatabase = await readDatabase(legacyKey);
  if (legacyDatabase !== null && legacyDatabase.length > 0) {
    void writeDatabase(docKey, legacyDatabase);
    return legacyDatabase;
  }

  const legacy = readLegacy(legacyKey);
  if (legacy.length > 0) {
    void writeDatabase(docKey, legacy);
    return legacy;
  }

  return [];
}

const writeChains = new Map<string, Promise<void>>();

/**
 * Persists annotations without blocking the UI. Writes for one document are
 * serialised so a fast sequence of highlights cannot land out of order.
 */
export function saveStoredAnnotations(
  docKey: string,
  annotations: TextAnnotation[]
): Promise<void> {
  if (!docKey || typeof window === 'undefined') return Promise.resolve();

  const previous = writeChains.get(docKey) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      const stored = await writeDatabase(docKey, annotations);
      writeLegacy(docKey, annotations);
      if (!stored) {
        console.warn('IndexedDB unavailable; annotations kept in localStorage only.');
      }
    })
    .catch((error) => {
      console.warn('Failed to persist annotations:', error);
      writeLegacy(docKey, annotations);
    });

  writeChains.set(docKey, next);
  void next.finally(() => {
    if (writeChains.get(docKey) === next) writeChains.delete(docKey);
  });

  return next;
}

/** Synchronous legacy reader kept for callers that only need a snapshot. */
export function getStoredAnnotations(docTitle: string): TextAnnotation[] {
  return readLegacy(docTitle);
}
