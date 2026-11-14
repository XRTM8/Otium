import { useCallback, useEffect, useRef, useState } from 'react';
import type { FontFamilyId, TextAnnotation, BookmarkItem, ThemeMode, ViewMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { mergeTextAnnotations } from '../core/annotations/textSync';
import { saveStoredAnnotations } from '../core/storage/annotations';
import { mergeBookmarks, saveStoredBookmarks } from '../core/storage/bookmarks';
import { applyBackupJson, createBackupJson } from '../core/storage/backupService';
import { mergeAnnotations, type RestoreSummary } from '../core/storage/backupFormat';
import { saveLanguage } from '../core/settings/preferences';
import { triggerHaptic } from '../core/utils/haptics';
import { saveTextFile, type SaveTextOutcome } from '../platform/saveFile';

interface UseReaderBookmarksAndAnnotationsOptions {
  docId: string;
  currentPage: number;
  changeTheme: (nextTheme: ThemeMode, persistDocument?: boolean) => void;
  changeViewMode: (nextMode: ViewMode) => void;
  changeFont: (nextFont: FontFamilyId) => void;
  setLang: (lang: Language) => void;
}

/**
 * Manages persisted reader annotations, bookmarks, debounced storage flushes,
 * and JSON backup export/restore.
 */
export function useReaderBookmarksAndAnnotations({
  docId,
  currentPage,
  changeTheme,
  changeViewMode,
  changeFont,
  setLang,
}: UseReaderBookmarksAndAnnotationsOptions) {
  const [annotations, setAnnotations] = useState<TextAnnotation[]>([]);
  const [annotationSaveStatus, setAnnotationSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);

  const annotationsGenerationRef = useRef(0);
  const annotationsHydratedRef = useRef(false);
  const bookmarksHydratedRef = useRef(false);

  const mergeRemoteAnnotations = useCallback((updates: TextAnnotation[], deleted: string[]) => {
    setAnnotations((current) => mergeTextAnnotations(current, updates, deleted));
  }, []);

  useEffect(() => {
    if (!docId || !annotationsHydratedRef.current) return;
    let alive = true;
    let dirty = true;
    setAnnotationSaveStatus('saving');
    const save = () => {
      if (!dirty) return;
      dirty = false;
      void saveStoredAnnotations(docId, annotations).then((ok) => {
        if (alive) setAnnotationSaveStatus(ok ? 'saved' : 'error');
      });
    };
    const timer = window.setTimeout(save, 240);
    window.addEventListener('pagehide', save);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener('pagehide', save);
      if (dirty) {
        dirty = false;
        void saveStoredAnnotations(docId, annotations);
      }
    };
  }, [annotations, docId]);

  useEffect(() => {
    if (!docId || !bookmarksHydratedRef.current) return;
    saveStoredBookmarks(docId, bookmarks);
  }, [bookmarks, docId]);

  const toggleBookmark = useCallback((pageNumber: number) => {
    triggerHaptic('light');
    setBookmarks((current) => {
      const exists = current.some((bookmark) => bookmark.pageNumber === pageNumber);
      if (exists) {
        return current.filter((bookmark) => bookmark.pageNumber !== pageNumber);
      }
      return [...current, { id: `bm_${Date.now()}`, pageNumber, createdAt: Date.now() }];
    });
  }, []);

  const addAnnotation = useCallback((annotation: TextAnnotation) => {
    setAnnotations((current) => [...current, annotation]);
  }, []);

  const deleteAnnotation = useCallback((annotationId: string) => {
    setAnnotations((current) => current.filter((annotation) => annotation.id !== annotationId));
  }, []);

  const updateAnnotationNote = useCallback((annotationId: string, note: string) => {
    const trimmed = note.trim();
    setAnnotations((current) =>
      current.map((annotation) =>
        annotation.id === annotationId
          ? { ...annotation, note: trimmed ? trimmed.slice(0, 4000) : undefined, updatedAt: Date.now() }
          : annotation
      )
    );
  }, []);

  const exportBackup = useCallback(async (): Promise<SaveTextOutcome> => {
    const json = await createBackupJson(__APP_VERSION__, {
      id: docId,
      annotations,
      bookmarks,
      lastPage: currentPage,
    });
    const date = new Date().toISOString().slice(0, 10);
    return saveTextFile(`otium-backup-${date}.json`, json, 'application/json;charset=utf-8');
  }, [annotations, bookmarks, currentPage, docId]);

  const importBackup = useCallback(
    async (text: string): Promise<RestoreSummary> => {
      const outcome = await applyBackupJson(text);

      if (docId) {
        const restored = outcome.file.documents.find((document) => document.id === docId);
        if (restored) {
          setAnnotations((current) => mergeAnnotations(current, restored.annotations));
          setBookmarks((current) => mergeBookmarks(current, restored.bookmarks));
        }
      }

      const preferences = outcome.preferences;
      if (preferences?.theme) changeTheme(preferences.theme);
      if (preferences?.viewMode) changeViewMode(preferences.viewMode);
      if (preferences?.fontFamily) changeFont(preferences.fontFamily);
      if (preferences?.language) {
        setLang(preferences.language);
        saveLanguage(preferences.language);
      }

      return outcome.summary;
    },
    [changeFont, changeTheme, changeViewMode, docId, setLang]
  );

  return {
    annotations,
    setAnnotations,
    annotationSaveStatus,
    bookmarks,
    setBookmarks,
    annotationsGenerationRef,
    annotationsHydratedRef,
    bookmarksHydratedRef,
    mergeRemoteAnnotations,
    toggleBookmark,
    addAnnotation,
    deleteAnnotation,
    updateAnnotationNote,
    exportBackup,
    importBackup,
  };
}
