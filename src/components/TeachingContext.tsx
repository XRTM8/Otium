import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readTeaching, saveTeaching, type TeachingPreferences } from '../core/settings/teaching';
import type { BoardBackground, BoardTool } from '../board/types';

export type SaveStatus = 'loading' | 'saved' | 'saving' | 'error';
export interface BoardControls {
  ready: boolean; tool: BoardTool; color: string; width: number; background: BoardBackground;
  page: number; pages: number; canUndo: boolean; canRedo: boolean; exporting: boolean; status: SaveStatus; error: string;
  setTool: (tool: BoardTool) => void; setColor: (color: string) => void; setWidth: (width: number) => void;
  setBackground: (background: BoardBackground) => void;
  undo: () => void; redo: () => void; clear: () => void; addPage: () => void; goToPage: (page: number) => void;
  exportPdf: () => void; exportPng: () => void; clip: () => void;
}
interface TeachingValue {
  mobile: boolean; layout: 'document' | 'split' | 'board'; setLayout: (layout: 'document' | 'split' | 'board') => void;
  target: 'document' | 'board'; setTarget: (target: 'document' | 'board') => void;
  prefs: TeachingPreferences; updatePrefs: (patch: Partial<TeachingPreferences>) => void;
  presentation: boolean; setPresentation: (value: boolean) => void;
  readerTools: boolean; setReaderTools: (value: boolean) => void;
  reachMode: boolean; setReachMode: (value: boolean) => void;
  board: BoardControls | null; registerBoard: (controls: BoardControls | null) => void;
}
const TeachingContext = createContext<TeachingValue | null>(null);
export function TeachingProvider({ children, mobile = false }: { children: ReactNode; mobile?: boolean }) {
  const [layout, setLayoutState] = useState<TeachingValue['layout']>('document');
  const [target, setTarget] = useState<TeachingValue['target']>('document');
  const [prefs, setPrefs] = useState(readTeaching);
  const [presentation, setPresentation] = useState(false);
  const [readerTools, setReaderTools] = useState(false);
  const [reachMode, setReachMode] = useState(false);
  const [board, registerBoard] = useState<BoardControls | null>(null);
  const setLayout = useCallback((next: TeachingValue['layout']) => {
    setLayoutState(next); if (next !== 'split') setTarget(next);
  }, []);
  const updatePrefs = useCallback((patch: Partial<TeachingPreferences>) => setPrefs(prev => ({ ...prev, ...patch })), []);
  useEffect(() => saveTeaching(prefs), [prefs]);
  const value = useMemo(() => ({ mobile, layout, setLayout, target, setTarget, prefs, updatePrefs, presentation, setPresentation,
    readerTools, setReaderTools, reachMode, setReachMode, board, registerBoard }), [mobile, layout, setLayout, target, prefs, updatePrefs, presentation, readerTools, reachMode, board]);
  return <TeachingContext.Provider value={value}>{children}</TeachingContext.Provider>;
}
export function useTeaching() {
  const context = useContext(TeachingContext);
  if (!context) throw new Error('TeachingProvider missing');
  return context;
}
