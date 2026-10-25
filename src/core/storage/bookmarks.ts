import type { BookmarkItem } from '../types';

const STORAGE_PREFIX = 'otium_bookmarks_';

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${key}`);
  } catch {
    return null;
  }
}

function parse(raw: string | null): BookmarkItem[] | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is BookmarkItem =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        Number.isFinite(item.pageNumber) &&
        item.pageNumber > 0
    );
  } catch {
    return [];
  }
}

/**
 * Bookmarks follow the document fingerprint. `legacyTitle` reads an older
 * filename-keyed snapshot once and copies it to the stable key.
 */
export function getStoredBookmarks(docKey: string, legacyTitle?: string): BookmarkItem[] {
  if (!docKey || typeof window === 'undefined') return [];

  const current = parse(readRaw(docKey));
  if (current !== null) return current;

  const legacyKey = legacyTitle && legacyTitle !== docKey ? legacyTitle : '';
  if (!legacyKey) return [];

  const legacy = parse(readRaw(legacyKey));
  if (legacy === null) return [];

  saveStoredBookmarks(docKey, legacy);
  return legacy;
}

export function saveStoredBookmarks(docKey: string, bookmarks: BookmarkItem[]): void {
  if (!docKey || typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${docKey}`, JSON.stringify(bookmarks));
  } catch (err) {
    console.error('Failed to save bookmarks:', err);
  }
}

/** Union by id; the incoming bookmark wins when both refer to the same entry. */
export function mergeBookmarks(
  existing: BookmarkItem[],
  incoming: BookmarkItem[]
): BookmarkItem[] {
  const byId = new Map<string, BookmarkItem>();
  for (const bookmark of existing) byId.set(bookmark.id, bookmark);
  for (const bookmark of incoming) byId.set(bookmark.id, bookmark);

  const seenPages = new Set<number>();
  return [...byId.values()]
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .filter((bookmark) => {
      if (seenPages.has(bookmark.pageNumber)) return false;
      seenPages.add(bookmark.pageNumber);
      return true;
    });
}
