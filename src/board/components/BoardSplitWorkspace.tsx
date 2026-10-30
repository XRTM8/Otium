import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ReaderController } from '../../app/useReaderController';
import { ReaderWorkspace } from '../../components/ReaderWorkspace';
import { useTeaching } from '../../components/TeachingContext';
import { BoardCanvas } from './BoardCanvas';
import { ResizeDivider } from './ResizeDivider';
import { AreaSnippetModal } from './AreaSnippetModal';
import type { BoardSnippet } from '../types';
import { computeOptimalPageScale } from '../../core/reader/device';

interface BoardSplitWorkspaceProps {
  reader: ReaderController; isBoardOpen: boolean; onCloseBoard: () => void;
  snippets: BoardSnippet[]; onAddSnippet: (snippet: BoardSnippet) => void;
  onRemoveSnippet: (id: string) => void;
  onUpdateSnippetPosition: (id: string, x: number, y: number) => void;
  onRestoreSnippets: (snippets: BoardSnippet[]) => void;
}
export const BoardSplitWorkspace: React.FC<BoardSplitWorkspaceProps> = ({ reader, snippets, onAddSnippet, onRemoveSnippet, onUpdateSnippetPosition, onRestoreSnippets }) => {
  const teaching = useTeaching();
  const containerRef = useRef<HTMLDivElement>(null);
  const [splitPercent, setSplitPercent] = useState(100);
  const [isDragging, setIsDragging] = useState(false);
  const [isAreaClipOpen, setIsAreaClipOpen] = useState(false);
  const requestAreaClip = useCallback(() => setIsAreaClipOpen(true), []);
  const { layout, setLayout, setTarget } = teaching;
  useEffect(() => {
    setSplitPercent(previous => layout === 'document' ? 100 : layout === 'board' ? 0 : previous > 0 && previous < 100 ? previous : 50);
  }, [layout]);
  useEffect(() => { setLayout('document'); }, [reader.docId, setLayout]);
  const { doc, scrollContainerRef, setZoom, basePageSize, viewMode } = reader;
  useEffect(() => {
    if (isDragging || !doc || splitPercent === 0) return;
    const frame = requestAnimationFrame(() => {
      const viewport = scrollContainerRef.current;
      if (!viewport?.clientWidth || !viewport.clientHeight) return;
      setZoom(computeOptimalPageScale(basePageSize.width, basePageSize.height, viewport.clientWidth, viewport.clientHeight, viewMode));
    });
    return () => cancelAnimationFrame(frame);
  }, [splitPercent, isDragging, doc, scrollContainerRef, setZoom, basePageSize.width, basePageSize.height, viewMode]);
  const finishDrag = (dragging: boolean) => {
    setIsDragging(dragging);
    if (!dragging) {
      if (splitPercent === 0) setLayout('board');
      else if (splitPercent === 100) setLayout('document');
    }
  };
  return <div ref={containerRef} data-board-resizing={isDragging} dir={reader.lang === 'ar' ? 'rtl' : 'ltr'} className="relative flex-1 w-full h-full flex overflow-hidden">
    <div hidden={splitPercent === 0} onPointerDownCapture={() => setTarget('document')} style={{ flex: `0 0 ${splitPercent}%`, width: `${splitPercent}%` }} className="relative h-full overflow-hidden flex-col">
      <ReaderWorkspace reader={reader} />
    </div>
    {((splitPercent > 0 && splitPercent < 100) || isDragging) && <ResizeDivider splitPercent={splitPercent} onSplitChange={setSplitPercent} isDragging={isDragging} setIsDragging={finishDrag} containerRef={containerRef} isRtl={reader.lang === 'ar'} />}
    {/* Switching views never discards a lesson. */}
    <div hidden={splitPercent === 100} onPointerDownCapture={() => setTarget('board')} style={{ flex: `0 0 ${100 - splitPercent}%`, width: `${100 - splitPercent}%` }} className="relative h-full overflow-hidden flex-col">
      <BoardCanvas key={reader.docId} documentId={reader.docId!} theme={reader.theme} lang={reader.lang} snippets={snippets} onRestoreSnippets={onRestoreSnippets} onRemoveSnippet={onRemoveSnippet} onUpdateSnippetPosition={onUpdateSnippetPosition} onRequestAreaClip={requestAreaClip} />
    </div>
    <AreaSnippetModal isOpen={isAreaClipOpen} currentPage={reader.currentPage} lang={reader.lang} onClose={() => setIsAreaClipOpen(false)} onSnippetCaptured={onAddSnippet} />
  </div>;
};
