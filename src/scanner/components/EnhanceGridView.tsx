import React from 'react';
import { CheckSquare, Square, Trash2 } from 'lucide-react';
import type { Language } from '../../core/i18n/translations';
import type { ScannedPage } from '../core/types';

export interface EnhanceGridViewProps {
  lang: Language;
  pages: ScannedPage[];
  safeIndex: number;
  selectedPages: Set<string>;
  setIsGridView: (open: boolean) => void;
  setCurrentPageIndex: (idx: number) => void;
  handleBulkDelete: () => void;
  handleTogglePageSelect: (pageId: string) => void;
  onMovePage: (fromIndex: number, toIndex: number) => void;
}

export const EnhanceGridView: React.FC<EnhanceGridViewProps> = ({
  lang,
  pages,
  safeIndex,
  selectedPages,
  setIsGridView,
  setCurrentPageIndex,
  handleBulkDelete,
  handleTogglePageSelect,
  onMovePage,
}) => {
  const ar = lang === 'ar';
  return (
    <div className="relative flex-1 w-full h-full flex flex-col p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-xs text-gray-400 font-semibold">
          {ar ? `${pages.length} صفحة · ${selectedPages.size} محدّدة` : `${pages.length} pages · ${selectedPages.size} selected`}
        </span>

        <div className="flex items-center gap-2">
          {selectedPages.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="px-3 py-1.5 rounded-xl bg-red-500/20 text-red-400 font-semibold text-xs border border-red-500/30 flex items-center gap-1 active:scale-95"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{ar ? 'حذف' : 'Delete'} ({selectedPages.size})</span>
            </button>
          )}

          <button
            onClick={() => setIsGridView(false)}
            className="px-3.5 py-1.5 rounded-xl bg-accent text-on-accent font-bold text-xs shadow-lg shadow-accent/25 active:scale-95"
          >
            {ar ? 'تم' : 'Done'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 pb-8">
        {pages.map((p, idx) => {
          const isSelected = selectedPages.has(p.id);
          const isCurrent = idx === safeIndex;
          return (
            <div
              key={p.id}
              onClick={() => {
                setCurrentPageIndex(idx);
                setIsGridView(false);
              }}
              className={`relative rounded-xl overflow-hidden border-2 bg-black/40 flex flex-col group cursor-pointer transition-all ${
                isSelected
                  ? 'border-accent ring-2 ring-accent/40 shadow-lg'
                  : isCurrent
                    ? 'border-accent/70'
                    : 'border-white/10 hover:border-white/30'
              }`}
            >
              <div className="aspect-[3/4] w-full relative">
                <img src={p.thumbnailDataUrl} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTogglePageSelect(p.id);
                  }}
                  className="absolute top-1.5 left-1.5 p-1 rounded-md bg-black/70 text-white shadow"
                >
                  {isSelected ? (
                    <CheckSquare className="w-4 h-4 text-accent" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-400" />
                  )}
                </button>
                <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] text-white font-bold">
                  #{idx + 1}
                </span>
              </div>

              <div
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-between p-1 bg-white/5 border-t border-white/5"
              >
                <button
                  aria-label={ar ? 'نقل للأمام' : 'Move earlier'}
                  disabled={idx === 0}
                  onClick={() => onMovePage(idx, idx - 1)}
                  className="px-2 py-0.5 text-[10px] text-gray-300 disabled:opacity-20 hover:text-white"
                >
                  ◀
                </button>
                <span className="text-[9px] text-gray-500 font-semibold">{ar ? 'ترتيب' : 'Move'}</span>
                <button
                  aria-label={ar ? 'نقل للخلف' : 'Move later'}
                  disabled={idx === pages.length - 1}
                  onClick={() => onMovePage(idx, idx + 1)}
                  className="px-2 py-0.5 text-[10px] text-gray-300 disabled:opacity-20 hover:text-white"
                >
                  ▶
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
