import React, { useState, useEffect } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { X, BookOpen, Layers } from 'lucide-react';
import type { TocItem } from '../types';
import type { Language } from '../utils/translations';
import { translations } from '../utils/translations';

interface SidebarProps {
  isOpen: boolean;
  doc: PDFDocumentProxy | null;
  totalPages: number;
  currentPage: number;
  lang?: Language;
  onSelectPage: (page: number) => void;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  doc,
  totalPages,
  currentPage,
  lang = 'ar',
  onSelectPage,
  onClose
}) => {
  const [tab, setTab] = useState<'pages' | 'toc'>('pages');
  const [toc, setToc] = useState<TocItem[]>([]);
  const t = translations[lang];

  useEffect(() => {
    if (!doc) return;
    const loadOutline = async () => {
      try {
        const outline = await doc.getOutline();
        if (outline && outline.length > 0) {
          const items: TocItem[] = [];
          for (const item of outline) {
            let pageNum = 1;
            if (typeof item.dest === 'string') {
              const dest = await doc.getDestination(item.dest);
              if (dest) {
                const ref = dest[0];
                pageNum = (await doc.getPageIndex(ref)) + 1;
              }
            } else if (Array.isArray(item.dest)) {
              pageNum = (await doc.getPageIndex(item.dest[0])) + 1;
            }
            items.push({
              title: item.title,
              pageNumber: pageNum
            });
          }
          setToc(items);
        } else {
          setToc([]);
        }
      } catch (err) {
        console.warn('Could not extract outline:', err);
      }
    };

    loadOutline();
  }, [doc]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 left-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-80 max-w-[85vw] h-full bg-neutral-900/95 text-neutral-200 border-r border-white/10 shadow-2xl backdrop-blur-2xl flex flex-col z-10 animate-in slide-in-from-left duration-300">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab('pages')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === 'pages' ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{t.pagesTab} ({totalPages})</span>
            </button>
            <button
              onClick={() => setTab('toc')}
              disabled={toc.length === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-30 ${
                tab === 'toc' ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{t.outlineTab} {toc.length > 0 && `(${toc.length})`}</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {tab === 'pages' ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                const isCurrent = pageNum === currentPage;
                return (
                  <button
                    key={pageNum}
                    onClick={() => {
                      onSelectPage(pageNum);
                      onClose();
                    }}
                    className={`group flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-mono transition-all ${
                      isCurrent
                        ? 'border-amber-500 bg-amber-500/15 text-amber-300 shadow-md ring-1 ring-amber-500/50'
                        : 'border-white/5 bg-white/5 hover:border-white/20 hover:bg-white/10 text-neutral-300'
                    }`}
                  >
                    <div className="w-12 h-16 rounded border border-white/10 bg-neutral-800 flex items-center justify-center mb-1 group-hover:scale-105 transition-transform shadow">
                      <span className="text-[11px] opacity-60">{pageNum}</span>
                    </div>
                    <span className="text-[11px]">صفحة {pageNum}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1">
              {toc.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-500">لا يحتوي هذا المستند على فهرس عناوين</div>
              ) : (
                toc.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      onSelectPage(item.pageNumber);
                      onClose();
                    }}
                    className="w-full text-right px-3 py-2 rounded-lg text-xs hover:bg-white/10 transition-colors flex items-center justify-between group"
                  >
                    <span className="truncate flex-1 group-hover:text-amber-300 transition-colors">{item.title}</span>
                    <span className="font-mono text-[10px] opacity-40 ml-2 group-hover:opacity-80">
                      ص {item.pageNumber}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
