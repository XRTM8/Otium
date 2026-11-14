import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readTeaching, saveTeaching, type TeachingPreferences } from '../core/settings/teaching';
import {
  TeachingContext,
  type BoardControls,
  type SaveStatus,
  type TeachingValue,
} from './teachingContextValue';

export type { BoardControls, SaveStatus };

export function TeachingProvider({ children, mobile = false }: { children: ReactNode; mobile?: boolean }) {
  const [rawLayout, setRawLayout] = useState<TeachingValue['layout']>('document');
  const [rawTarget, setRawTarget] = useState<TeachingValue['target']>('document');
  const [prefs, setPrefs] = useState(readTeaching);
  const [presentation, setPresentation] = useState(false);
  // Reading is the calm default: the familiar top toolbar is immediately
  // available. The teacher dock takes over only after the board is opened.
  const [readerTools, setReaderTools] = useState(true);
  const [reachMode, setReachMode] = useState(false);
  const [board, registerBoard] = useState<BoardControls | null>(null);

  const layout = prefs.boardEnabled ? rawLayout : 'document';
  const target = prefs.boardEnabled ? rawTarget : 'document';

  const setLayout = useCallback((next: TeachingValue['layout']) => {
    // The board is opt-in. A stale shortcut or an old saved layout must not
    // surface it on a teacher's phone or computer unexpectedly.
    if (!prefs.boardEnabled) next = 'document';
    setRawLayout(next);
    if (next !== 'split') setRawTarget(next);
  }, [prefs.boardEnabled]);

  const setTarget = useCallback((next: TeachingValue['target']) => {
    setRawTarget(prefs.boardEnabled ? next : 'document');
  }, [prefs.boardEnabled]);

  const updatePrefs = useCallback((patch: Partial<TeachingPreferences>) => {
    setPrefs((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => saveTeaching(prefs), [prefs]);

  const value = useMemo(
    () => ({
      mobile,
      layout,
      setLayout,
      target,
      setTarget,
      prefs,
      updatePrefs,
      presentation,
      setPresentation,
      readerTools,
      setReaderTools,
      reachMode,
      setReachMode,
      board,
      registerBoard,
    }),
    [mobile, layout, setLayout, target, setTarget, prefs, updatePrefs, presentation, readerTools, reachMode, board]
  );

  return <TeachingContext.Provider value={value}>{children}</TeachingContext.Provider>;
}
