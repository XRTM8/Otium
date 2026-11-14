import React from 'react';
import { Move, X } from 'lucide-react';
import type { Language } from '../../core/i18n/translations';
import type { BoardSnippet } from '../types';

interface BoardSnippetOverlayProps {
  lang: Language;
  snippets: BoardSnippet[];
  presentation: boolean;
  onRemoveSnippet: (id: string) => void;
  onPointerDown: (id: string, e: React.PointerEvent) => void;
  onPointerMove: (id: string, e: React.PointerEvent) => void;
  onPointerUp: (id: string, e: React.PointerEvent) => void;
}

export const BoardSnippetOverlay: React.FC<BoardSnippetOverlayProps> = ({
  lang,
  snippets,
  presentation,
  onRemoveSnippet,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}) => (
  <div className="absolute inset-0 pointer-events-none z-15">
    {snippets.map((snip) => (
      <div
        key={snip.id}
        style={{
          left: `${(snip.x / 1920) * 100}%`,
          top: `${(snip.y / 1080) * 100}%`,
          width: `${(snip.width / 1920) * 100}%`,
        }}
        className="absolute top-0 left-0 pointer-events-auto rounded-2xl border border-line bg-surface/95 backdrop-blur-md shadow-xl overflow-hidden transition-shadow hover:shadow-2xl flex flex-col"
      >
        <div
          onPointerDown={(e) => onPointerDown(snip.id, e)}
          onPointerMove={(e) => onPointerMove(snip.id, e)}
          onPointerUp={(e) => onPointerUp(snip.id, e)}
          className="flex items-center justify-between px-3 py-1.5 bg-hover-subtle border-b border-line cursor-grab active:cursor-grabbing text-ink-muted text-xs select-none"
        >
          <div className="flex items-center gap-1.5 font-semibold text-[11px] text-accent">
            <Move className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? `اقتباس صفحة ${snip.pageNumber}` : `Page ${snip.pageNumber} Clip`}</span>
          </div>
          <button
            type="button"
            hidden={presentation}
            onClick={() => onRemoveSnippet(snip.id)}
            className="p-1 rounded-lg hover:bg-hover hover:text-danger-ink text-ink-muted transition-colors cursor-pointer"
            title={lang === 'ar' ? 'إزالة الاقتباس' : 'Remove Snippet'}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-3 text-xs leading-relaxed max-h-72 overflow-y-auto">
          {snip.type === 'image' ? (
            <img
              src={snip.content}
              alt={lang === 'ar' ? 'مخطط من الكتاب' : 'Book Diagram'}
              className="w-full h-auto rounded-lg border border-line-subtle object-contain select-none pointer-events-none"
              draggable={false}
            />
          ) : (
            <blockquote className="border-r-2 rtl:border-r-2 ltr:border-l-2 border-accent/60 pr-2 rtl:pr-2 ltr:pl-2 italic text-ink font-serif">
              {snip.content}
            </blockquote>
          )}
        </div>
      </div>
    ))}
  </div>
);
