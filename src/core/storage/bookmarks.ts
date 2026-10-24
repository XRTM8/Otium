import type { BookmarkItem } from '../types';

const STORAGE_PREFIX = 'otium_bookmarks_';

export function getStoredBookmarks(docTitle: string): BookmarkItem[] {
  if (!docTitle || typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${docTitle}`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load bookmarks:', err);
    return [];
  }
}

export function saveStoredBookmarks(docTitle: string, bookmarks: BookmarkItem[]): void {
  if (!docTitle || typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${docTitle}`, JSON.stringify(bookmarks));
  } catch (err) {
    console.error('Failed to save bookmarks:', err);
  }
}
