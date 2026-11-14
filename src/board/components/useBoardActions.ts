import { useCallback } from 'react';
import type { SaveStatus } from '../../components/teachingContextValue';
import type { BoardBackground, BoardPageData, BoardSnippet, BoardStroke } from '../types';
import { exportBoardPagesToPdf, exportCurrentBoardToPng } from '../utils/boardCanvasExport';
import type { LaserPoint } from '../utils/laserTrail';
import type { ThemeMode } from '../../core/types';

interface UseBoardActionsArgs {
  pages: BoardPageData[];
  setPages: React.Dispatch<React.SetStateAction<BoardPageData[]>>;
  currentPageIndex: number;
  setCurrentPageIndex: React.Dispatch<React.SetStateAction<number>>;
  strokes: BoardStroke[];
  setStrokes: React.Dispatch<React.SetStateAction<BoardStroke[]>>;
  undoStack: BoardStroke[][];
  setUndoStack: React.Dispatch<React.SetStateAction<BoardStroke[][]>>;
  redoStack: BoardStroke[][];
  setRedoStack: React.Dispatch<React.SetStateAction<BoardStroke[][]>>;
  background: BoardBackground;
  setBackground: React.Dispatch<React.SetStateAction<BoardBackground>>;
  laserTrailRef: React.MutableRefObject<LaserPoint[]>;
  theme: ThemeMode;
  boardFollowTheme: boolean;
  boardColor: string;
  appearanceColor: string;
  snippets: BoardSnippet[];
  setIsExporting: React.Dispatch<React.SetStateAction<boolean>>;
  setStatus: (status: SaveStatus) => void;
  setError: (error: string) => void;
}

export function useBoardActions({
  pages,
  setPages,
  currentPageIndex,
  setCurrentPageIndex,
  strokes,
  setStrokes,
  undoStack,
  setUndoStack,
  redoStack,
  setRedoStack,
  background,
  setBackground,
  laserTrailRef,
  theme,
  boardFollowTheme,
  boardColor,
  appearanceColor,
  snippets,
  setIsExporting,
  setStatus,
  setError,
}: UseBoardActionsArgs) {
  // Full snapshots make erasing and clear-all undoable as one action.
  const handleUndo = useCallback(() => {
    const prevStrokes = undoStack[undoStack.length - 1];
    if (!prevStrokes) return;
    setStatus('saving');
    setRedoStack((prev) => [strokes, ...prev].slice(0, 60));
    setStrokes(prevStrokes);
    setUndoStack((prev) => prev.slice(0, -1));
  }, [setStatus, strokes, undoStack, setRedoStack, setStrokes, setUndoStack]);

  const handleRedo = useCallback(() => {
    const nextStrokes = redoStack[0];
    if (!nextStrokes) return;
    setStatus('saving');
    setUndoStack((prev) => [...prev, strokes].slice(-60));
    setStrokes(nextStrokes);
    setRedoStack((prev) => prev.slice(1));
  }, [setStatus, redoStack, strokes, setUndoStack, setStrokes, setRedoStack]);

  const handleClearAll = useCallback(() => {
    if (!strokes.length) return;
    setStatus('saving');
    setUndoStack((prev) => [...prev, strokes].slice(-60));
    setRedoStack([]);
    setStrokes([]);
  }, [setStatus, strokes, setUndoStack, setRedoStack, setStrokes]);

  const handleSwitchPage = useCallback((targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= pages.length || targetIndex === currentPageIndex) return;

    const currentPage = pages[currentPageIndex];
    if (!currentPage) return;

    const updatedPages = [...pages];
    updatedPages[currentPageIndex] = {
      ...currentPage,
      strokes,
      redoStack,
      undoStack,
      background,
    };
    setPages(updatedPages);

    const nextPage = updatedPages[targetIndex];
    if (!nextPage) return;
    setStrokes(nextPage.strokes);
    setRedoStack(nextPage.redoStack);
    setUndoStack(nextPage.undoStack || []);
    setBackground(nextPage.background);
    setCurrentPageIndex(targetIndex);
    laserTrailRef.current = [];
  }, [pages, currentPageIndex, strokes, redoStack, undoStack, background, setPages, setStrokes, setRedoStack, setUndoStack, setBackground, setCurrentPageIndex, laserTrailRef]);

  const handleAddPage = useCallback(() => {
    if (pages.length >= 10) return;

    const currentPage = pages[currentPageIndex];
    if (!currentPage) return;

    const updatedPages = [...pages];
    updatedPages[currentPageIndex] = {
      ...currentPage,
      strokes,
      redoStack,
      undoStack,
      background,
    };

    const newPage: BoardPageData = {
      id: `page-${Date.now()}`,
      strokes: [],
      redoStack: [],
      background,
    };

    updatedPages.push(newPage);
    setPages(updatedPages);
    setCurrentPageIndex(updatedPages.length - 1);
    setStrokes([]);
    setUndoStack([]);
    setRedoStack([]);
    laserTrailRef.current = [];
  }, [pages, currentPageIndex, strokes, redoStack, undoStack, background, setPages, setCurrentPageIndex, setStrokes, setUndoStack, setRedoStack, laserTrailRef]);

  const handleExportPdf = useCallback(async () => {
    setIsExporting(true);
    try {
      await exportBoardPagesToPdf({
        pages,
        currentPageIndex,
        strokes,
        background,
        theme,
        boardFollowTheme,
        boardColor,
        snippets,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF export failed');
    } finally {
      setIsExporting(false);
    }
  }, [pages, currentPageIndex, strokes, background, theme, boardFollowTheme, boardColor, snippets, setIsExporting, setError]);

  const handleExportPng = useCallback(async () => {
    setIsExporting(true);
    try {
      await exportCurrentBoardToPng({
        pages,
        currentPageIndex,
        strokes,
        background,
        backgroundColor: appearanceColor,
        snippets,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image export failed');
    } finally {
      setIsExporting(false);
    }
  }, [pages, currentPageIndex, strokes, background, appearanceColor, snippets, setIsExporting, setError]);

  return {
    handleUndo,
    handleRedo,
    handleClearAll,
    handleSwitchPage,
    handleAddPage,
    handleExportPdf,
    handleExportPng,
  };
}
