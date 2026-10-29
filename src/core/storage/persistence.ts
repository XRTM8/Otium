/**
 * Storage Persistence Service
 *
 * Requests persistent storage from the host browser/WebView so that IndexedDB,
 * user documents, annotations, bookmarks, and scans are protected against automatic
 * cache/storage eviction under low-disk-space conditions.
 */

export async function requestStoragePersistence(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return false;
  }

  try {
    if (typeof navigator.storage.persisted === 'function') {
      const isPersisted = await navigator.storage.persisted();
      if (isPersisted) {
        return true;
      }
    }

    if (typeof navigator.storage.persist === 'function') {
      return await navigator.storage.persist();
    }
  } catch (err) {
    // Some sandboxed iframes or private modes reject storage requests; fail silently
    console.debug('Storage persistence request could not be completed:', err);
  }

  return false;
}
