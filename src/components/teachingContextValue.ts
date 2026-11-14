import { createContext, useContext } from 'react';
import type { TeachingPreferences } from '../core/settings/teaching';
import type { BoardBackground, BoardTool } from '../board/types';

export type SaveStatus = 'loading' | 'saved' | 'saving' | 'error';

export interface BoardControls {
  ready: boolean;
  tool: BoardTool;
  color: string;
  width: number;
  background: BoardBackground;
  isDark?: boolean;
  page: number;
  pages: number;
  canUndo: boolean;
  canRedo: boolean;
  exporting: boolean;
  status: SaveStatus;
  error: string;
  setTool: (tool: BoardTool) => void;
  setColor: (color: string) => void;
  setWidth: (width: number) => void;
  setBackground: (background: BoardBackground) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  addPage: () => void;
  goToPage: (page: number) => void;
  exportPdf: () => void;
  exportPng: () => void;
  clip: () => void;
}

export interface TeachingValue {
  mobile: boolean;
  layout: 'document' | 'split' | 'board';
  setLayout: (layout: 'document' | 'split' | 'board') => void;
  target: 'document' | 'board';
  setTarget: (target: 'document' | 'board') => void;
  prefs: TeachingPreferences;
  updatePrefs: (patch: Partial<TeachingPreferences>) => void;
  presentation: boolean;
  setPresentation: (value: boolean) => void;
  readerTools: boolean;
  setReaderTools: (value: boolean) => void;
  reachMode: boolean;
  setReachMode: (value: boolean) => void;
  board: BoardControls | null;
  registerBoard: (controls: BoardControls | null) => void;
}

export const TeachingContext = createContext<TeachingValue | null>(null);

export function useTeaching() {
  const context = useContext(TeachingContext);
  if (!context) throw new Error('TeachingProvider missing');
  return context;
}
