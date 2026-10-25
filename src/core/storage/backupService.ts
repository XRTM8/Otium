import type { BookmarkItem, TextAnnotation } from '../types';
import { getSavedFont } from '../settings/fonts';
import { loadLanguage, loadTheme, loadViewMode } from '../settings/preferences';
import { loadStoredAnnotations, saveStoredAnnotations } from './annotations';
import {
  mergeBookmarks,
  getStoredBookmarks,
  saveStoredBookmarks
} from './bookmarks';
import {
  buildBackupFile,
  mergeAnnotations,
  parseBackupFile,
  serialiseBackupFile,
  type BackupPreferences,
  type BackupFile,
  type RestoreSummary
} from './backupFormat';
import { getRecentDocumentsList, restoreDocumentMetadata } from './documents';

export interface CurrentDocumentBackup {
  id: string;
  annotations: TextAnnotation[];
  bookmarks: BookmarkItem[];
  lastPage: number;
}

/**
 * Collects metadata, highlights, notes and bookmarks into a portable JSON
 * document. PDF bytes are deliberately excluded: the file stays small and the
 * reader can re-import a book later without duplicating a library.
 */
export async function createBackupJson(
  appVersion: string,
  current?: CurrentDocumentBackup
): Promise<string> {
  const recents = await getRecentDocumentsList();

  const documents = await Promise.all(
    recents.map(async (recent) => {
      const isCurrent = current?.id === recent.id;
      const annotations = isCurrent
        ? current.annotations
        : await loadStoredAnnotations(recent.id, recent.name).catch(() => []);
      const bookmarks = isCurrent
        ? current.bookmarks
        : getStoredBookmarks(recent.id, recent.name);

      return {
        id: recent.id,
        name: recent.name,
        totalPages: recent.totalPages,
        lastPage: isCurrent ? current.lastPage : recent.lastPage,
        lastOpened: recent.lastOpened,
        sizeBytes: recent.sizeBytes,
        annotations,
        bookmarks
      };
    })
  );

  const preferences: BackupPreferences = {
    theme: loadTheme(),
    language: loadLanguage(),
    viewMode: loadViewMode(),
    fontFamily: getSavedFont()
  };

  return serialiseBackupFile(
    buildBackupFile({
      documents,
      preferences,
      appVersion
    })
  );
}

export interface RestoreOutcome {
  summary: RestoreSummary;
  preferences: BackupPreferences | undefined;
  file: BackupFile;
}

/**
 * Merges a backup into local storage. Highlights and bookmarks are keyed by id
 * and the incoming copy wins a collision, so restoring an old backup never
 * creates duplicates and never discards newer local notes.
 */
export async function applyBackupJson(text: string): Promise<RestoreOutcome> {
  const file = parseBackupFile(text);
  let annotationCount = 0;
  let bookmarkCount = 0;

  for (const document of file.documents) {
    if (document.annotations.length > 0) {
      const existing = await loadStoredAnnotations(document.id, document.name).catch(() => []);
      await saveStoredAnnotations(
        document.id,
        mergeAnnotations(existing, document.annotations)
      );
      annotationCount += document.annotations.length;
    }

    if (document.bookmarks.length > 0) {
      const existing = getStoredBookmarks(document.id, document.name);
      saveStoredBookmarks(
        document.id,
        mergeBookmarks(existing, document.bookmarks)
      );
      bookmarkCount += document.bookmarks.length;
    }

    await restoreDocumentMetadata({
      id: document.id,
      name: document.name,
      totalPages: document.totalPages,
      lastPage: document.lastPage,
      lastOpened: document.lastOpened,
      sizeBytes: document.sizeBytes
    });
  }

  return {
    summary: {
      documents: file.documents.length,
      annotations: annotationCount,
      bookmarks: bookmarkCount,
      preferences: file.preferences
    },
    preferences: file.preferences,
    file
  };
}
