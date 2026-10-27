import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  Plus,
  StickyNote
} from 'lucide-react';
import type { TocItem, BookmarkItem, TextAnnotation } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { getTranslations } from '../core/i18n/translations';
import { saveTextFile } from '../platform/saveFile';

interface SidebarProps {
  isOpen: boolean;
  doc: PDFDocumentProxy | null;
  docTitle?: string;
  totalPages: number;
  currentPage: number;
  lang?: Language;
  bookmarks?: BookmarkItem[];
  annotations?: TextAnnotation[];
  onSelectPage: (page: number) => void;
  onToggleBookmark?: (pageNumber: number) => void;
  onDeleteAnnotation?: (id: string) => void;
  onUpdateAnnotationNote?: (id: string, note: string) => void;
  onClose: () => void;
  /**
   * `drawer` is the desktop side panel. `sheet` is the touch-first bottom
   * sheet: full width, reachable footer close button, no top-edge reach.
   */
  variant?: 'drawer' | 'sheet';
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  doc,
  docTitle = '',
  totalPages,
  currentPage,
  lang = 'ar',
  bookmarks = [],
  annotations = [],
  onSelectPage,
  onToggleBookmark,
  onDeleteAnnotation,
  onUpdateAnnotationNote,
  onClose,
  variant = 'drawer'
}) => {
  const isSheet = variant === 'sheet';
  const [tab, setTab] = useState<'pages' | 'toc' | 'notes'>('pages');
  const [toc, setToc] = useState<TocItem[]>([]);
  const [copiedAll, setCopiedAll] = useState(false);
  const [exported, setExported] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const t = getTranslations(lang);
  const ar = lang === 'ar';

  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const sheetHeightRef = useRef<number>(0);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startedAt: number;
    delta: number;
  } | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) return;
    setEditingNoteId(null);
    setNoteDraft('');
  }, [isOpen]);

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

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    };
  }, []);

  const resetSheetMotion = useCallback(() => {
    const sheet = sheetRef.current;
    if (sheet) {
      sheet.style.transition = '';
      sheet.style.transform = '';
    }
    const backdrop = backdropRef.current;
    if (backdrop) {
      backdrop.style.transition = '';
      backdrop.style.opacity = '';
    }
  }, []);

  const settleSheet = useCallback(
    (shouldClose: boolean) => {
      const sheet = sheetRef.current;
      if (!sheet) return;

      sheet.style.transition = 'transform 230ms cubic-bezier(0.22, 1, 0.36, 1)';
      const backdrop = backdropRef.current;
      if (backdrop) backdrop.style.transition = 'opacity 200ms ease';

      if (shouldClose) {
        sheet.style.transform = 'translate3d(0, 110%, 0)';
        if (backdrop) backdrop.style.opacity = '0';
        closeTimerRef.current = window.setTimeout(() => {
          closeTimerRef.current = null;
          resetSheetMotion();
          onClose();
        }, 230);
        return;
      }

      sheet.style.transform = 'translate3d(0, 0, 0)';
      if (backdrop) backdrop.style.opacity = '1';
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        if (sheetRef.current) {
          sheetRef.current.style.transition = '';
        }
        if (backdropRef.current) {
          backdropRef.current.style.transition = '';
        }
      }, 240);
    },
    [onClose, resetSheetMotion]
  );

  const handleHandlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isSheet) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }

    const sheet = sheetRef.current;
    if (!sheet) return;

    sheetHeightRef.current = sheet.offsetHeight || window.innerHeight;

    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startedAt: performance.now(),
      delta: 0
    };

    // The entrance animation uses the `translate` property; remove it before
    // driving the sheet with `transform` so the two never fight.
    sheet.style.animation = 'none';
    sheet.style.transition = 'none';
    if (backdropRef.current) backdropRef.current.style.transition = 'none';

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is an enhancement; the handle still receives moves.
    }
  };

  const handleHandlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const sheet = sheetRef.current;
    if (!sheet) return;

    const delta = Math.max(0, event.clientY - drag.startY);
    drag.delta = delta;

    // Rubber-band after 160px so the sheet never detaches from the finger too
    // abruptly, while keeping the first part of the drag 1:1.
    const shown = delta <= 160 ? delta : 160 + (delta - 160) * 0.62;
    const height = Math.max(1, sheetHeightRef.current || window.innerHeight);

    sheet.style.transform = `translate3d(0, ${shown}px, 0)`;
    if (backdropRef.current) {
      backdropRef.current.style.opacity = `${Math.max(0, 1 - (delta / height) * 0.8)}`;
    }

    if (event.cancelable) event.preventDefault();
  };

  const handleHandlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The browser may have released it already.
    }

    const height = Math.max(1, sheetHeightRef.current || window.innerHeight);
    const elapsed = Math.max(1, performance.now() - drag.startedAt);
    const velocity = drag.delta / elapsed;
    const passedDistance = drag.delta > Math.min(150, height * 0.22);
    const flickedDown = drag.delta > 36 && velocity > 0.55;

    settleSheet(passedDistance || flickedDown);
  };

  const handleHandlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    settleSheet(false);
  };

  if (!isOpen) return null;

  const isCurrentPageBookmarked = bookmarks.some((b) => b.pageNumber === currentPage);
  const totalNotesCount = bookmarks.length + annotations.length;

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className={
        isSheet
          ? 'fixed inset-0 z-50'
          : 'fixed inset-y-0 right-0 sm:right-auto sm:left-0 z-50 flex'
      }
    >
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className={`inset-0 bg-scrim transition-opacity ${
          isSheet ? 'absolute' : 'fixed backdrop-blur-xs'
        }`}
        onClick={onClose}
      />

      {/* Drawer (desktop) or bottom sheet (touch) */}
      <div
        ref={sheetRef}
        onAnimationEnd={(e) => {
          if (e.currentTarget === sheetRef.current) {
            sheetRef.current.style.animation = 'none';
          }
        }}
        className={
          isSheet
            ? 'chrome-surface mobile-sheet absolute inset-x-0 bottom-0 z-10 flex h-[84dvh] max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl border-x-0 border-b-0 text-ink sm:left-1/2 sm:right-auto sm:w-[42rem] sm:max-w-[calc(100vw-2rem)] sm:-translate-x-1/2'
            : 'chrome-surface relative z-10 flex h-full w-[21rem] max-w-[90vw] flex-col border-x-0 border-l border-line text-ink animate-in slide-in-from-right sm:slide-in-from-left duration-300'
        }
      >
        {isSheet && (
          <div
            role="button"
            tabIndex={-1}
            aria-label={ar ? 'اسحب للأسفل لإغلاق اللوحة' : 'Drag down to close the panel'}
            title={ar ? 'اسحب للأسفل للإغلاق' : 'Drag down to close'}
            onPointerDown={handleHandlePointerDown}
            onPointerMove={handleHandlePointerMove}
            onPointerUp={handleHandlePointerEnd}
            onPointerCancel={handleHandlePointerCancel}
            className="flex shrink-0 cursor-grab touch-none select-none justify-center pb-1.5 pt-2.5 active:cursor-grabbing"
          >
            <div className="h-1.5 w-10 rounded-full bg-line-strong" />
          </div>
        )}

        {/* Header Tabs */}
        <div
          className={`flex shrink-0 items-center justify-between gap-2 border-b border-line-subtle ${
            isSheet ? 'px-4 pb-3 pt-1' : 'p-3'
          }`}
        >
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
              title={ar ? 'الملاحظات والفواصل' : 'Notes & Bookmarks'}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>{ar ? 'الملاحظات' : 'Notes'}</span>
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
            style={isSheet ? { width: 44, height: 44 } : undefined}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div
          className={`flex-1 overflow-y-auto overscroll-contain space-y-3 ${
            isSheet ? 'px-4 py-3' : 'p-3'
          }`}
        >
          
          {/* TAB 1: Pages Grid */}
          {tab === 'pages' && (
            <div className={isSheet ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2.5'}>
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
                    className={`page-thumb group relative flex min-h-[44px] cursor-pointer flex-col items-center justify-center rounded-2xl border p-2 text-xs font-mono transition-all ${
                      isCurrent
                        ? 'border-accent bg-accent/15 text-accent shadow-md ring-1 ring-accent/40'
                        : 'border-line-subtle bg-hover-subtle text-ink-muted hover:border-line-strong hover:bg-hover'
                    }`}
                  >
                    {isBookmarked && (
                      <Bookmark className="absolute right-1.5 top-1.5 z-10 h-3.5 w-3.5 fill-highlight text-highlight" />
                    )}
                    <div
                      className={`relative mb-1 flex w-full items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-2 shadow-xs transition-transform group-hover:scale-[1.03] ${
                        isSheet ? 'aspect-[3/4] max-w-[76px]' : 'h-16 w-12'
                      }`}
                    >
                      <div className="absolute inset-x-2 top-2 space-y-1 opacity-20" aria-hidden="true">
                        <div className="h-px bg-ink" />
                        <div className="h-px w-4/5 bg-ink" />
                        <div className="h-px w-full bg-ink" />
                        <div className="h-px w-3/5 bg-ink" />
                      </div>
                      <span className="relative text-[11px] opacity-60">{pageNum}</span>
                    </div>
                    <span className={isSheet ? 'text-[10px]' : 'text-[11px]'}>
                      {ar ? `صفحة ${pageNum}` : `Page ${pageNum}`}
                    </span>
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
                    className="w-full text-start px-3 py-2.5 rounded-xl text-xs hover:bg-hover transition-colors flex items-center justify-between group cursor-pointer"
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
                        className="flex items-center gap-2 text-start flex-1 truncate cursor-pointer hover:text-highlight transition-colors"
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
                      {ar ? `الاقتباسات (${annotations.length})` : `Quotes (${annotations.length})`}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          const content = annotations
                            .map((a, i) => {
                              const note = a.note ? `\n${ar ? 'ملاحظة' : 'Note'}: ${a.note}` : '';
                              return `${i + 1}. [${ar ? 'صفحة' : 'page'} ${a.pageNumber}] "${a.text}"${note}`;
                            })
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
                        onClick={async () => {
                          const heading = `# ${ar ? 'ملاحظات القراءة' : 'Reading notes'}${
                            docTitle ? ` — ${docTitle}` : ''
                          }`;
                          const content =
                            `${heading}\n\n` +
                            annotations
                              .map((a) => {
                                const note = a.note
                                  ? `\n\n**${ar ? 'ملاحظة' : 'Note'}:** ${a.note}`
                                  : '';
                                const kind = a.type === 'highlight'
                                  ? ar ? 'تظليل' : 'Highlight'
                                  : ar ? 'تسطير' : 'Underline';
                                return `> "${a.text}"\n— **${ar ? 'صفحة' : 'page'} ${a.pageNumber}** (${kind})${note}\n`;
                              })
                              .join('\n');
                          const date = new Date().toISOString().slice(0, 10);
                          const outcome = await saveTextFile(
                            `otium-notes-${date}.md`,
                            content,
                            'text/markdown;charset=utf-8'
                          );
                          if (outcome === 'unavailable') return;
                          setExported(true);
                          setTimeout(() => setExported(false), 2200);
                        }}
                        className="text-[10px] text-ink-muted hover:text-ink flex items-center gap-1 cursor-pointer font-sans"
                        title={ar ? 'تنزيل كملف Markdown (.md)' : 'Download as Markdown (.md)'}
                      >
                        {exported ? (
                          <>
                            <Check className="w-3 h-3 text-success-ink" />
                            <span className="text-success-ink">{ar ? 'تم التصدير' : 'Exported'}</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3 h-3" />
                            <span>{ar ? 'تحميل .md' : 'Download .md'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {annotations.map((anno) => (
                      <div
                        key={anno.id}
                        className="p-2.5 rounded-xl bg-hover-subtle border border-line-subtle hover:border-line transition-all text-start space-y-1 group"
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
                            aria-label={ar ? 'حذف الاقتباس' : 'Delete quote'}
                            className={`cursor-pointer p-1.5 transition-opacity hover:text-danger-ink ${
                              isSheet ? 'opacity-80' : 'opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

                        {editingNoteId === anno.id ? (
                          <div className="space-y-1.5 pt-1">
                            <textarea
                              autoFocus
                              value={noteDraft}
                              onChange={(event) => setNoteDraft(event.target.value)}
                              rows={3}
                              maxLength={4000}
                              placeholder={ar ? 'اكتب ملاحظتك على هذا الاقتباس…' : 'Write a note on this quote…'}
                              className="w-full resize-none rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] leading-relaxed text-ink outline-none focus:border-accent/50"
                            />
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingNoteId(null);
                                  setNoteDraft('');
                                }}
                                className="px-2 py-1 rounded-lg text-[10px] text-ink-muted hover:bg-hover"
                              >
                                {ar ? 'إلغاء' : 'Cancel'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onUpdateAnnotationNote?.(anno.id, noteDraft);
                                  setEditingNoteId(null);
                                  setNoteDraft('');
                                }}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-accent text-on-accent text-[10px] font-medium disabled:opacity-50"
                                disabled={!onUpdateAnnotationNote}
                              >
                                <Check className="w-3 h-3" />
                                <span>{ar ? 'حفظ الملاحظة' : 'Save note'}</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {anno.note && (
                              <p className="whitespace-pre-wrap rounded-lg border-s-2 border-accent/40 bg-accent/5 px-2 py-1.5 text-[10px] leading-relaxed text-ink-muted">
                                {anno.note}
                              </p>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNoteId(anno.id);
                                setNoteDraft(anno.note ?? '');
                              }}
                              disabled={!onUpdateAnnotationNote}
                              className="flex items-center gap-1 text-[10px] text-ink-faint transition-colors hover:text-highlight disabled:opacity-50"
                            >
                              <StickyNote className="h-3 w-3" />
                              <span>
                                {anno.note
                                  ? ar ? 'تعديل الملاحظة' : 'Edit note'
                                  : ar ? 'إضافة ملاحظة' : 'Add note'}
                              </span>
                            </button>
                          </>
                        )}
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

        {isSheet && (
          <div className="shrink-0 border-t border-line-subtle px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line-subtle bg-hover-subtle text-xs font-medium text-ink transition-colors active:bg-hover-strong"
            >
              <X className="h-4 w-4" />
              <span>{ar ? 'إغلاق اللوحة' : 'Close panel'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
