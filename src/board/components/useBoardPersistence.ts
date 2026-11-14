import { useCallback, useEffect, useRef, useState } from 'react';
import type { SaveStatus } from '../../components/teachingContextValue';
import { readBoard, writeBoard } from '../utils/boardStorage';
import type { BoardBackground, BoardPageData, BoardSnippet, BoardStroke } from '../types';
import type { Language } from '../../core/i18n/translations';

interface UseBoardPersistenceArgs {
  documentId: string;
  lang: Language;
  snippets: BoardSnippet[];
  syncedPages: BoardPageData[];
  currentPageIndex: number;
  drawingRevision: number;
  isDrawingRef: React.MutableRefObject<boolean>;
  draggingSnippetId: string | null;
  onRestoreSnippets: (snippets: BoardSnippet[]) => void;
  setPages: React.Dispatch<React.SetStateAction<BoardPageData[]>>;
  setCurrentPageIndex: React.Dispatch<React.SetStateAction<number>>;
  setStrokes: React.Dispatch<React.SetStateAction<BoardStroke[]>>;
  setRedoStack: React.Dispatch<React.SetStateAction<BoardStroke[][]>>;
  setUndoStack: React.Dispatch<React.SetStateAction<BoardStroke[][]>>;
  setBackground: React.Dispatch<React.SetStateAction<BoardBackground>>;
}

export function useBoardPersistence({
  documentId,
  lang,
  snippets,
  syncedPages,
  currentPageIndex,
  drawingRevision,
  isDrawingRef,
  draggingSnippetId,
  onRestoreSnippets,
  setPages,
  setCurrentPageIndex,
  setStrokes,
  setRedoStack,
  setUndoStack,
  setBackground,
}: UseBoardPersistenceArgs) {
  const [docSync, setDocSync] = useState<{ docId: string; ready: boolean; status: SaveStatus; error: string }>({
    docId: documentId,
    ready: false,
    status: 'loading',
    error: '',
  });
  const activeDocSync =
    docSync.docId === documentId ? docSync : { docId: documentId, ready: false, status: 'loading' as SaveStatus, error: '' };
  const ready = activeDocSync.ready;
  const status = activeDocSync.status;
  const error = activeDocSync.error;

  const setStatus = useCallback(
    (nextStatus: SaveStatus) => {
      setDocSync((prev) => ({
        docId: documentId,
        ready: prev.docId === documentId ? prev.ready : false,
        status: nextStatus,
        error: '',
      }));
    },
    [documentId]
  );

  const setError = useCallback(
    (nextError: string) => {
      setDocSync((prev) => ({
        docId: documentId,
        ready: prev.docId === documentId ? prev.ready : false,
        status: 'error',
        error: nextError,
      }));
    },
    [documentId]
  );

  const saveQueue = useRef(Promise.resolve());

  useEffect(() => {
    let alive = true;
    void readBoard(documentId)
      .then((snapshot) => {
        if (!alive) return;
        if (snapshot) {
          const current = snapshot.pages[snapshot.currentPage] ?? snapshot.pages[0];
          setPages(snapshot.pages);
          setCurrentPageIndex(snapshot.currentPage);
          if (current) {
            setStrokes(current.strokes);
            setRedoStack(current.redoStack);
            setUndoStack(current.undoStack || []);
            setBackground(current.background);
          }
        }
        onRestoreSnippets(snapshot?.snippets || []);
        setDocSync({ docId: documentId, ready: true, status: 'saved', error: '' });
      })
      .catch(() => {
        if (alive) {
          setDocSync({
            docId: documentId,
            ready: false,
            status: 'error',
            error:
              lang === 'ar'
                ? 'تعذر تحميل السبورة المحفوظة. أعد فتح الملف.'
                : 'Saved board could not be loaded. Reopen the document.',
          });
        }
      });
    return () => {
      alive = false;
    };
  }, [documentId, onRestoreSnippets, lang, setPages, setCurrentPageIndex, setStrokes, setRedoStack, setUndoStack, setBackground]);

  useEffect(() => {
    if (!ready || drawingRevision < 0 || isDrawingRef.current || draggingSnippetId) return;
    let alive = true;
    const snapshot = { pages: syncedPages, currentPage: currentPageIndex, snippets };
    saveQueue.current = saveQueue.current
      .then(undefined, (err: unknown) => {
        console.warn('[BoardCanvas] Previous board save failed:', err);
      })
      .then(() => {
        if (alive) setStatus('saving');
        return writeBoard(documentId, snapshot);
      });
    void saveQueue.current
      .then(() => {
        if (alive) setDocSync({ docId: documentId, ready: true, status: 'saved', error: '' });
      })
      .catch(() => {
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [ready, documentId, syncedPages, currentPageIndex, snippets, drawingRevision, draggingSnippetId, setStatus, isDrawingRef]);

  return { ready, status, error, setStatus, setError };
}
