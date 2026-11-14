import { localStorage } from '../../../platform/storage';
import type { ScannedPage } from '../types';

const SESSION_PAGES_KEY = 'otium_scan_active_session_pages';

/** Checks available storage quota to prevent out-of-disk crashes during large scan sessions. */
export async function checkStorageQuota(): Promise<{ hasLowStorage: boolean; freeBytesEstimate?: number }> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const { quota, usage } = await navigator.storage.estimate();
      if (typeof quota === 'number' && typeof usage === 'number') {
        const freeBytes = quota - usage;
        return { hasLowStorage: freeBytes < 45 * 1024 * 1024, freeBytesEstimate: freeBytes };
      }
    } catch (err) {
      console.warn('[PageStore] Storage quota estimate failed:', err);
    }
  }
  return { hasLowStorage: false };
}

export function saveActiveSessionPages(pages: ScannedPage[]): boolean {
  try {
    if (pages.length === 0) {
      localStorage.removeItem(SESSION_PAGES_KEY);
    } else {
      localStorage.setItem(SESSION_PAGES_KEY, JSON.stringify(pages));
    }
    return true;
  } catch (err) {
    console.warn('[PageStore] Failed to persist active session pages:', err);
    return false;
  }
}

export function getActiveSessionPages(): ScannedPage[] | null {
  try {
    const raw = localStorage.getItem(SESSION_PAGES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function clearActiveSessionPages(): void {
  try {
    localStorage.removeItem(SESSION_PAGES_KEY);
  } catch (err) {
    console.warn('[PageStore] Failed to clear active session pages:', err);
  }
}
