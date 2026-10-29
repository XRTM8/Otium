import React, { useRef, useState } from 'react';
import { BookOpen, PenTool } from 'lucide-react';
import type { ReaderController } from '../../app/useReaderController';
import { ReaderWorkspace } from '../../components/ReaderWorkspace';
import { BoardCanvas } from './BoardCanvas';
import { ResizeDivider } from './ResizeDivider';
import { AreaSnippetModal } from './AreaSnippetModal';
import type { BoardSnippet } from '../types';

interface BoardSplitWorkspaceProps {
  reader: ReaderController;
  isBoardOpen: boolean;
  onCloseBoard: () => void;
  snippets: BoardSnippet[];
  onAddSnippet: (snippet: BoardSnippet) => void;
  onRemoveSnippet: (id: string) => void;
  onUpdateSnippetPosition: (id: string, x: number, y: number) => void;
}

export const BoardSplitWorkspace: React.FC<BoardSplitWorkspaceProps> = ({
  reader,
  isBoardOpen,
  onCloseBoard,
  snippets,
  onAddSnippet,
  onRemoveSnippet,
  onUpdateSnippetPosition
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [splitPercent, setSplitPercent] = useState<number>(50);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isAreaClipOpen, setIsAreaClipOpen] = useState<boolean>(false);

  // If the board is closed, render normal 100% reader workspace with zero overhead
  if (!isBoardOpen) {
    return <ReaderWorkspace reader={reader} />;
  }

  const isRtl = reader.lang === 'ar';
  const showReader = splitPercent > 0;
  const showBoard = splitPercent < 100;

  return (
    <div
      ref={containerRef}
      dir={isRtl ? 'rtl' : 'ltr'}
      className="relative flex-1 w-full h-full flex overflow-hidden select-none"
    >
      {/* Pane 1: PDF Reader View */}
      {showReader && (
        <div
          style={{
            flex: `0 0 ${splitPercent}%`,
            width: `${splitPercent}%`
          }}
          className="relative h-full overflow-hidden flex flex-col transition-all duration-75"
        >
          <ReaderWorkspace reader={reader} />
        </div>
      )}

      {/* Floating edge pill if Reader is collapsed to 0% */}
      {splitPercent === 0 && (
        <button
          type="button"
          onClick={() => setSplitPercent(50)}
          title={reader.lang === 'ar' ? 'إظهار الكتاب' : 'Show PDF'}
          className="absolute top-16 rtl:right-4 ltr:left-4 z-40 flex items-center gap-2 px-3 py-2 rounded-2xl bg-surface/90 border border-line shadow-xl backdrop-blur-md text-ink hover:text-accent cursor-pointer transition-transform hover:scale-105 active:scale-95"
        >
          <BookOpen className="w-4 h-4 text-accent" />
          <span className="text-xs font-semibold">
            {reader.lang === 'ar' ? 'إظهار الكتاب 📖' : 'Show Book 📖'}
          </span>
        </button>
      )}

      {/* Elastic Divider (Visible when both panes are shown) */}
      {showReader && showBoard && (
        <ResizeDivider
          splitPercent={splitPercent}
          onSplitChange={setSplitPercent}
          isDragging={isDragging}
          setIsDragging={setIsDragging}
          containerRef={containerRef}
          isRtl={isRtl}
        />
      )}

      {/* Floating edge pill if Board is collapsed to 0% */}
      {splitPercent === 100 && (
        <button
          type="button"
          onClick={() => setSplitPercent(50)}
          title={reader.lang === 'ar' ? 'إظهار السبورة' : 'Show Board'}
          className="absolute top-16 rtl:left-4 ltr:right-4 z-40 flex items-center gap-2 px-3 py-2 rounded-2xl bg-surface/90 border border-line shadow-xl backdrop-blur-md text-ink hover:text-accent cursor-pointer transition-transform hover:scale-105 active:scale-95"
        >
          <PenTool className="w-4 h-4 text-accent" />
          <span className="text-xs font-semibold">
            {reader.lang === 'ar' ? 'إظهار السبورة 🪄' : 'Show Board 🪄'}
          </span>
        </button>
      )}

      {/* Pane 2: Whiteboard Studio Canvas */}
      {showBoard && (
        <div
          style={{
            flex: `0 0 ${100 - splitPercent}%`,
            width: `${100 - splitPercent}%`
          }}
          className="relative h-full overflow-hidden flex flex-col transition-all duration-75"
        >
          <BoardCanvas
            lang={reader.lang}
            snippets={snippets}
            onRemoveSnippet={onRemoveSnippet}
            onUpdateSnippetPosition={onUpdateSnippetPosition}
            onRequestAreaClip={() => setIsAreaClipOpen(true)}
            onCloseBoard={onCloseBoard}
          />
        </div>
      )}

      {/* Area Snippet Modal for clipping diagrams/equations from PDF */}
      <AreaSnippetModal
        isOpen={isAreaClipOpen}
        currentPage={reader.currentPage}
        lang={reader.lang}
        onClose={() => setIsAreaClipOpen(false)}
        onSnippetCaptured={onAddSnippet}
      />
    </div>
  );
};
