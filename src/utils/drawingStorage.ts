import type { PageDrawingsMap } from '../types';

const STORAGE_PREFIX = 'otium_drawings_';

export function getStoredDrawings(docTitle: string): PageDrawingsMap {
  if (!docTitle || typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${docTitle}`);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load drawings from localStorage:', err);
    return {};
  }
}

export function saveStoredDrawings(docTitle: string, drawings: PageDrawingsMap): void {
  if (!docTitle || typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${docTitle}`, JSON.stringify(drawings));
  } catch (err) {
    console.error('Failed to save drawings to localStorage:', err);
  }
}

export function clearStoredDrawings(docTitle: string): void {
  if (!docTitle || typeof window === 'undefined') return;
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${docTitle}`);
  } catch (err) {
    console.error('Failed to clear drawings from localStorage:', err);
  }
}
