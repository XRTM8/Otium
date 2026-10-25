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
import type { TocItem, BookmarkItem, TextAnnotation } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { getTranslations } from '../core/i18n/translations';

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
  const ar = lang === 'ar';

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
        className="fixed inset-0 bg-scrim backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="chrome-surface relative z-10 flex h-full w-[21rem] max-w-[90vw] flex-col border-x-0 border-l border-line text-ink animate-in slide-in-from-right sm:slide-in-from-left duration-300">
        
        {/* Header Tabs */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line-subtle p-3">
          <div className="segmented min-w-0 flex-1">
            <button
              onClick={() => setTab('pages')}
              data-active={tab === 'pages'}
              className="flex-1 justify-center py-1.5 text-xs"
              title={t.pagesTab}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{t.pagesTab}</span>
            </button>

            <button
              onClick={() => setTab('toc')}
              disabled={toc.length === 0}
              data-active={tab === 'toc'}
              className="flex-1 justify-center py-1.5 text-xs disabled:opacity-30"
              title={t.outlineTab}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{t.outlineTab}</span>
            </button>

            <button
              onClick={() => setTab('notes')}
              data-active={tab === 'notes'}
              className="flex-1 justify-center py-1.5 text-xs"
              title={ar ? 'Notes & Bookmarks' : 'الملاحظات والفواصل'}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>{ar ? 'Notes' : 'الملاحظات'}</span>
              {totalNotesCount > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent font-mono text-[10px] font-bold text-on-accent">
                  {totalNotesCount}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={onClose}
            aria-label={ar ? 'إغلاق' : 'Close'}
            className="toolbar-icon"
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
                        ? 'border-accent bg-accent/15 text-accent shadow-md ring-1 ring-accent/40'
                        : 'border-line-subtle bg-hover-subtle hover:border-line-strong hover:bg-hover text-ink-muted'
                    }`}
                  >
                    {isBookmarked && (
                      <Bookmark className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-highlight fill-highlight" />
                    )}
                    <div className="w-12 h-16 rounded-lg border border-line bg-surface-2 flex items-center justify-center mb-1 group-hover:scale-105 transition-transform shadow-xs">
                      <span className="text-[11px] opacity-60">{pageNum}</span>
                    </div>
                    <span className="text-[11px]">{ar ? `صفحة ${pageNum}` : `Page ${pageNum}`}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* TAB 2: Table of Contents */}
          {tab === 'toc' && (
            <div className="space-y-1">
              {toc.length === 0 ? (
                <div className="py-12 text-center text-xs text-ink-faint font-sans">
                  {ar ? 'لا يحتوي هذا المستند على فهرس عناوين مدمج' : 'This document has no embedded outline'}
                </div>
              ) : (
                toc.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      onSelectPage(item.pageNumber);
                      onClose();
                    }}
                    className="w-full text-right px-3 py-2.5 rounded-xl text-xs hover:bg-hover transition-colors flex items-center justify-between group cursor-pointer"
                  >
                    <span className="truncate flex-1 group-hover:text-highlight transition-colors font-sans">
                      {item.title}
                    </span>
                    <span className="font-mono text-[10px] opacity-40 group-hover:opacity-80 shrink-0">
                      {ar ? `ص ${item.pageNumber}` : `p. ${item.pageNumber}`}
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
                className="w-full py-2.5 px-3 rounded-2xl bg-accent/15 hover:bg-accent/25 border border-accent/30 text-accent font-sans text-xs flex items-center justify-center gap-2 transition-all cursor-pointer font-medium"
              >
                {isCurrentPageBookmarked ? (
                  <>
                    <Bookmark className="w-4 h-4 fill-highlight text-highlight" />
                    <span>{t.removeBookmark} ({ar ? `صفحة ${currentPage}` : `page ${currentPage}`})</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>{t.addBookmark} ({ar ? `صفحة ${currentPage}` : `page ${currentPage}`})</span>
                  </>
                )}
              </button>

              {/* Bookmarks Section */}
              {bookmarks.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-ink-muted font-sans px-1 flex items-center gap-1.5">
                    <Bookmark className="w-3 h-3 text-highlight" />
                    <span>{ar ? `فواصل القراءة (${bookmarks.length})` : `Bookmarks (${bookmarks.length})`}</span>
                  </div>
                  {bookmarks.map((bm) => (
                    <div
                      key={bm.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-hover-subtle border border-line-subtle hover:border-line transition-all text-xs"
                    >
                      <button
                        onClick={() => {
                          onSelectPage(bm.pageNumber);
                          onClose();
                        }}
                        className="flex items-center gap-2 text-right flex-1 truncate cursor-pointer hover:text-highlight transition-colors"
                      >
                        <Bookmark className="w-3.5 h-3.5 text-highlight fill-highlight shrink-0" />
                        <span className="font-sans font-medium">
                          {ar ? `صفحة ${bm.pageNumber}` : `Page ${bm.pageNumber}`}
                        </span>
                      </button>

                      <button
                        onClick={() => onToggleBookmark?.(bm.pageNumber)}
                        title={ar ? 'حذف الإشارة' : 'Remove bookmark'}
                        className="p-1 rounded-lg text-ink-muted hover:text-danger-ink hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Highlights & Quotes Section */}
              {annotations.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-line">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-medium text-ink-muted font-sans">
                      الاقتباسات ({annotations.length})
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          const content = annotations
                            .map((a, i) => `${i + 1}. [${ar ? 'صفحة' : 'page'} ${a.pageNumber}] "${a.text}"`)
                            .join('\n\n');
                          await navigator.clipboard.writeText(content);
                          setCopiedAll(true);
                          setTimeout(() => setCopiedAll(false), 2000);
                        }}
                        className="text-[10px] text-highlight hover:text-highlight flex items-center gap-1 cursor-pointer font-sans"
                        title={ar ? 'نسخ جميع الاقتباسات إلى الحافظة' : 'Copy all quotes to clipboard'}
                      >
                        {copiedAll ? (
                          <>
                            <Check className="w-3 h-3 text-success-ink" />
                            <span className="text-success-ink">{ar ? 'تم النسخ' : 'Copied'}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>{ar ? 'نسخ الكل' : 'Copy all'}</span>
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
                        className="text-[10px] text-ink-muted hover:text-ink flex items-center gap-1 cursor-pointer font-sans"
                        title={ar ? 'تنزيل كملف Markdown (.md)' : 'Download as Markdown (.md)'}
                      >
                        <Download className="w-3 h-3" />
                        <span>{ar ? 'تحميل .md' : 'Download .md'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {annotations.map((anno) => (
                      <div
                        key={anno.id}
                        className="p-2.5 rounded-xl bg-hover-subtle border border-line-subtle hover:border-line transition-all text-right space-y-1 group"
                      >
                        <div className="flex items-center justify-between text-[10px] text-ink-muted font-mono">
                          <button
                            onClick={() => {
                              onSelectPage(anno.pageNumber);
                              onClose();
                            }}
                            className="flex items-center gap-1.5 hover:text-highlight transition-colors cursor-pointer"
                          >
                            <span
                              className="w-2 h-2 rounded-full border border-black/30"
                              style={{ backgroundColor: anno.color }}
                            />
                            <span>{ar ? `ص ${anno.pageNumber}` : `p. ${anno.pageNumber}`}</span>
                          </button>
                          <button
                            onClick={() => onDeleteAnnotation?.(anno.id)}
                            title={ar ? 'حذف' : 'Delete'}
                            className="opacity-0 group-hover:opacity-100 hover:text-danger-ink transition-opacity cursor-pointer p-0.5"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <p
                          onClick={() => {
                            onSelectPage(anno.pageNumber);
                            onClose();
                          }}
                          className="text-[11px] text-ink leading-relaxed font-sans line-clamp-3 cursor-pointer hover:text-highlight"
                        >
                          "{anno.text}"
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {bookmarks.length === 0 && annotations.length === 0 && (
                <div className="py-12 text-center text-xs text-ink-faint font-sans">
                  {ar ? 'لا توجد فواصل أو اقتباسات محفوظة في هذا المستند' : 'No bookmarks or highlights saved in this document'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
