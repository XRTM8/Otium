import type { ThemeMode } from '../../core/types';
import type { BoardBackground, BoardPageData, BoardSnippet, BoardStroke } from '../types';
import { boardAppearance } from './boardAppearance';
import { exportAllPagesToPdf, exportPageToPng, type ExportableBoardPage } from './boardExport';

const EXPORT_WIDTH = 1920;
const EXPORT_HEIGHT = 1080;

export async function exportBoardPagesToPdf({
  pages,
  currentPageIndex,
  strokes,
  background,
  theme,
  boardFollowTheme,
  boardColor,
  snippets,
}: {
  pages: BoardPageData[];
  currentPageIndex: number;
  strokes: BoardStroke[];
  background: BoardBackground;
  theme: ThemeMode;
  boardFollowTheme: boolean;
  boardColor: string;
  snippets: BoardSnippet[];
}): Promise<void> {
  const pagesToExport: ExportableBoardPage[] = pages.map((p, idx) => {
    const activeBg = idx === currentPageIndex ? background : p.background;
    const activeStrokes = idx === currentPageIndex ? strokes : p.strokes;
    return {
      id: p.id,
      strokes: activeStrokes,
      redoStack: p.redoStack,
      undoStack: p.undoStack,
      background: activeBg,
      backgroundColor: boardAppearance(activeBg, theme, boardFollowTheme, boardColor).color,
    };
  });

  await exportAllPagesToPdf(
    pagesToExport,
    EXPORT_WIDTH,
    EXPORT_HEIGHT,
    snippets
  );
}

export async function exportCurrentBoardToPng({
  pages,
  currentPageIndex,
  strokes,
  background,
  backgroundColor,
  snippets,
}: {
  pages: BoardPageData[];
  currentPageIndex: number;
  strokes: BoardStroke[];
  background: BoardBackground;
  backgroundColor: string;
  snippets: BoardSnippet[];
}): Promise<void> {
  const currentPage: ExportableBoardPage = {
    id: pages[currentPageIndex]?.id || 'page-1',
    strokes,
    background,
    backgroundColor,
  };

  await exportPageToPng(currentPage, EXPORT_WIDTH, EXPORT_HEIGHT, snippets, currentPageIndex + 1);
}
