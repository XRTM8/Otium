import React, { useState, useEffect } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  X,
  BookOpen,
  Layers,
  Bookmark,
  Trash2,
  Copy,
  Check,
  Download,
  Plus
} from 'lucide-react';
import type { TocItem, BookmarkItem, TextAnnotation } from '../types';
import type { Language } from '../utils/translations';
import { getTranslations } from '../utils/translations';

interface SidebarProps {
  isOpen: boolean;
  doc: PDFDocumentProxy | null;
  totalPages: number;
  currentPage: number;
  lang?: Language;
  bookmarks?: BookmarkItem[];
  annotations?: TextAnnotation[];
  onSelectPage: (page: number) => void;
  onToggleBookmark?: (pageNumber: number) => void;
  onDeleteAnnotation?: (id: string) => void;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  doc,
  totalPages,
  currentPage,
  lang = 'ar',
  bookmarks = [],
  annotations = [],
  onSelectPage,
  onToggleBookmark,
  onDeleteAnnotation,
  onClose
}) => {
  const [tab, setTab] = useState<'pages' | 'toc' | 'notes'>('pages');
  const [toc, setToc] = useState<TocItem[]>([]);
  const [copiedAll, setCopiedAll] = useState(false);
  const t = getTranslations(lang);

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

  const isCurrentPageBookmarked = bookmarks.some((b) => b.pageNumber === currentPage);
  const totalNotesCount = bookmarks.length + annotations.length;

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="fixed inset-y-0 right-0 sm:right-auto sm:left-0 z-50 flex"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-84 max-w-[90vw] h-full bg-neutral-900/98 text-neutral-200 border-x border-white/10 shadow-2xl backdrop-blur-2xl flex flex-col z-10 animate-in slide-in-from-right sm:slide-in-from-left duration-300">
        
        {/* Header Tabs (3 Clean Tabs) */}
        <div className="p-3 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setTab('pages')}
              className={`p-1.5 px-2.5 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                tab === 'pages' ? 'bg-amber-400/20 text-amber-300 font-semibold' : 'text-neutral-400 hover:text-white'
              }`}
              title={t.pagesTab}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{t.pagesTab}</span>
            </button>

            <button
              onClick={() => setTab('toc')}
              disabled={toc.length === 0}
              className={`p-1.5 px-2.5 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-30 ${
                tab === 'toc' ? 'bg-amber-400/20 text-amber-300 font-semibold' : 'text-neutral-400 hover:text-white'
              }`}
              title={t.outlineTab}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{t.outlineTab}</span>
            </button>

            <button
              onClick={() => setTab('notes')}
              className={`p-1.5 px-2.5 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                tab === 'notes' ? 'bg-amber-400/20 text-amber-300 font-semibold' : 'text-neutral-400 hover:text-white'
              }`}
              title="الملاحظات والفواصل"
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>الملاحظات</span>
              {totalNotesCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-amber-400 text-black text-[10px] font-mono flex items-center justify-center font-bold">
                  {totalNotesCount}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          
          {/* TAB 1: Pages Grid */}
          {tab === 'pages' && (
            <div className="grid grid-cols-2 gap-2.5">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                const isCurrent = pageNum === currentPage;
                const isBookmarked = bookmarks.some((b) => b.pageNumber === pageNum);
                return (
                  <button
                    key={pageNum}
                    onClick={() => {
                      onSelectPage(pageNum);
                      onClose();
                    }}
                    className={`group relative flex flex-col items-center justify-center p-2.5 rounded-2xl border text-xs font-mono transition-all cursor-pointer ${
                      isCurrent
                        ? 'border-amber-400 bg-amber-400/15 text-amber-300 shadow-md ring-1 ring-amber-400/40'
                        : 'border-white/5 bg-white/5 hover:border-white/20 hover:bg-white/10 text-neutral-300'
                    }`}
                  >
                    {isBookmarked && (
                      <Bookmark className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    )}
                    <div className="w-12 h-16 rounded-lg border border-white/10 bg-neutral-800 flex items-center justify-center mb-1 group-hover:scale-105 transition-transform shadow-xs">
                      <span className="text-[11px] opacity-60">{pageNum}</span>
                    </div>
                    <span className="text-[11px]">صفحة {pageNum}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* TAB 2: Table of Contents */}
          {tab === 'toc' && (
            <div className="space-y-1">
              {toc.length === 0 ? (
                <div className="py-12 text-center text-xs text-neutral-500 font-sans">
                  لا يحتوي هذا المستند على فهرس عناوين مدمج
                </div>
              ) : (
                toc.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      onSelectPage(item.pageNumber);
                      onClose();
                    }}
                    className="w-full text-right px-3 py-2.5 rounded-xl text-xs hover:bg-white/10 transition-colors flex items-center justify-between group cursor-pointer"
                  >
                    <span className="truncate flex-1 group-hover:text-amber-300 transition-colors font-sans">
                      {item.title}
                    </span>
                    <span className="font-mono text-[10px] opacity-40 group-hover:opacity-80 shrink-0">
                      ص {item.pageNumber}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {/* TAB 3: Notes & Bookmarks (Unified & Clean) */}
          {tab === 'notes' && (
            <div className="space-y-4">
              {/* Quick Add Bookmark for Current Page */}
              <button
                onClick={() => onToggleBookmark?.(currentPage)}
                className="w-full py-2.5 px-3 rounded-2xl bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/30 text-amber-300 font-sans text-xs flex items-center justify-center gap-2 transition-all cursor-pointer font-medium"
              >
                {isCurrentPageBookmarked ? (
                  <>
                    <Bookmark className="w-4 h-4 fill-amber-400 text-amber-400" />
                    <span>{t.removeBookmark} (صفحة {currentPage})</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>{t.addBookmark} (صفحة {currentPage})</span>
                  </>
                )}
              </button>

              {/* Bookmarks Section */}
              {bookmarks.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-neutral-400 font-sans px-1 flex items-center gap-1.5">
                    <Bookmark className="w-3 h-3 text-amber-400" />
                    <span>فواصل القراءة ({bookmarks.length})</span>
                  </div>
                  {bookmarks.map((bm) => (
                    <div
                      key={bm.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-all text-xs"
                    >
                      <button
                        onClick={() => {
                          onSelectPage(bm.pageNumber);
                          onClose();
                        }}
                        className="flex items-center gap-2 text-right flex-1 truncate cursor-pointer hover:text-amber-300 transition-colors"
                      >
                        <Bookmark className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                        <span className="font-sans font-medium">
                          صفحة {bm.pageNumber}
                        </span>
                      </button>

                      <button
                        onClick={() => onToggleBookmark?.(bm.pageNumber)}
                        title="حذف الإشارة"
                        className="p-1 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Highlights & Quotes Section */}
              {annotations.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-medium text-neutral-400 font-sans">
                      الاقتباسات ({annotations.length})
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          const content = annotations
                            .map((a, i) => `${i + 1}. [صفحة ${a.pageNumber}] "${a.text}"`)
                            .join('\n\n');
                          await navigator.clipboard.writeText(content);
                          setCopiedAll(true);
                          setTimeout(() => setCopiedAll(false), 2000);
                        }}
                        className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer font-sans"
                        title="نسخ جميع الاقتباسات إلى الحافظة"
                      >
                        {copiedAll ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-300">تم النسخ</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>نسخ الكل</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => {
                          const content = `# مقتطفات وملاحظات القراءة\n\n` +
                            annotations.map((a) => `> "${a.text}"\n— **صفحة ${a.pageNumber}** (${a.type === 'highlight' ? 'تظليل' : 'تسطير'})\n`).join('\n');
                          const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = 'ملاحظات_القراءة.md';
                          link.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="text-[10px] text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer font-sans"
                        title="تنزيل كملف Markdown (.md)"
                      >
                        <Download className="w-3 h-3" />
                        <span>تحميل .md</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {annotations.map((anno) => (
                      <div
                        key={anno.id}
                        className="p-2.5 rounded-xl bg-white/5 border border-white/5 hover:border-white/15 transition-all text-right space-y-1 group"
                      >
                        <div className="flex items-center justify-between text-[10px] text-neutral-400 font-mono">
                          <button
                            onClick={() => {
                              onSelectPage(anno.pageNumber);
                              onClose();
                            }}
                            className="flex items-center gap-1.5 hover:text-amber-300 transition-colors cursor-pointer"
                          >
                            <span
                              className="w-2 h-2 rounded-full border border-black/30"
                              style={{ backgroundColor: anno.color }}
                            />
                            <span>ص {anno.pageNumber}</span>
                          </button>
                          <button
                            onClick={() => onDeleteAnnotation?.(anno.id)}
                            title="حذف"
                            className="opacity-0 group-hover:opacity-100 hover:text-rose-400 transition-opacity cursor-pointer p-0.5"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <p
                          onClick={() => {
                            onSelectPage(anno.pageNumber);
                            onClose();
                          }}
                          className="text-[11px] text-neutral-200 leading-relaxed font-sans line-clamp-3 cursor-pointer hover:text-amber-200"
                        >
                          "{anno.text}"
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {bookmarks.length === 0 && annotations.length === 0 && (
                <div className="py-12 text-center text-xs text-neutral-500 font-sans">
                  لا توجد فواصل أو اقتباسات محفوظة في هذا المستند
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
