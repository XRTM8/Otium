import { createContext, useContext } from 'react';
import type { InkTool } from './TeacherDock';
import type { InkMark } from '../core/annotations/ink';
import type { AnnotationRect } from '../core/types';

export interface InkContextValue {
  ready: boolean;
  tool: InkTool;
  color: string;
  size: number;
  stylus: boolean;
  marks: InkMark[];
  change: (marks: InkMark[]) => void;
  setTool: (tool: InkTool) => void;
  publishSelection: (selection: { page: number; rects: AnnotationRect[] } | null) => void;
}

export const InkContext = createContext<InkContextValue | null>(null);
const noSelection = () => {};

export function useDocumentInteraction() {
  const context = useContext(InkContext);
  return {
    mode: context?.stylus && context.tool !== 'select' ? 'hand' : context?.tool || 'hand',
    publishSelection: context?.publishSelection || noSelection,
  };
}
