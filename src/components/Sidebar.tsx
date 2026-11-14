import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  X,
  BookOpen,
  Layers,
  Bookmark,
} from 'lucide-react';
import type { BookmarkItem, TextAnnotation } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { getTranslations } from '../core/i18n/translations';
import { SidebarNotesTab, SidebarTocTab, type FlatTocItem } from './SidebarTocAndNotes';
import { useSidebarSheetGesture } from './useSidebarSheetGesture';
import { extractDocumentOutline } from './sidebarOutlineHelper';

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

const EMPTY_BOOKMARKS: BookmarkItem[] = [];
const EMPTY_ANNOTATIONS: TextAnnotation[] = [];

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  doc,
  docTitle = '',
  totalPages,
  currentPage,
  lang = 'ar',
  bookmarks = EMPTY_BOOKMARKS,
  annotations = EMPTY_ANNOTATIONS,
  onSelectPage,
  onToggleBookmark,
  onDeleteAnnotation,
  onUpdateAnnotationNote,
  onClose,
  variant = 'drawer'
}) => {
  const isSheet = variant === 'sheet';
  const [tab, setTab] = useState<'pages' | 'toc' | 'notes'>('pages');
  const [toc, setToc] = useState<FlatTocItem[]>([]);
  const [displayedPageLimit, setDisplayedPageLimit] = useState(60);
  const t = getTranslations(lang);
  const ar = lang === 'ar';

  const {
    sheetRef,
    backdropRef,
    handleHandlePointerDown,
    handleHandlePointerMove,
    handleHandlePointerEnd,
    handleHandlePointerCancel,
  } = useSidebarSheetGesture(isSheet, onClose);

  const wasOpenRef = useRef(isOpen);
  useEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      setDisplayedPageLimit(60);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  const handleContentScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (tab !== 'pages' || displayedPageLimit >= totalPages) return;
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 350) {
      setDisplayedPageLimit((prev) => Math.min(totalPages, prev + 60));
    }
  };

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    void extractDocumentOutline(doc)
      .then((items) => {
        if (!cancelled) setToc(items);
      })
      .catch((err) => {
        console.warn('Could not extract outline:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [doc]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isCurrentPageBookmarked = bookmarks.some((b) => b.pageNumber === currentPage);
  const totalNotesCount = bookmarks.length + annotations.length;

  return (
    <div
      role={isSheet ? 'dialog' : 'region'}
      aria-modal={isSheet ? 'true' : undefined}
      aria-label={lang === 'ar' ? 'فهرس وملاحظات المستند' : 'Document Outline and Notes'}
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
          onScroll={handleContentScroll}
          className={`flex-1 overflow-y-auto overscroll-contain space-y-3 ${
            isSheet ? 'px-4 py-3' : 'p-3'
          }`}
        >
          
          {/* TAB 1: Pages Grid */}
          {tab === 'pages' && (
            <div className={isSheet ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2.5'}>
              {Array.from({ length: Math.min(totalPages, displayedPageLimit) }, (_, i) => i + 1).map((pageNum) => {
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
              {displayedPageLimit < totalPages && (
                <div className="col-span-full py-2.5 text-center">
                  <button
                    type="button"
                    onClick={() => setDisplayedPageLimit((prev) => Math.min(totalPages, prev + 120))}
                    className="px-4 py-2 rounded-xl bg-hover border border-line text-ink-muted text-xs font-medium cursor-pointer hover:bg-hover-strong hover:text-ink transition-all active:scale-95"
                  >
                    {ar ? `تحميل المزيد من الصفحات (${totalPages - displayedPageLimit} متبقية)` : `Load more pages (${totalPages - displayedPageLimit} remaining)`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Table of Contents */}
          {tab === 'toc' && (
            <SidebarTocTab
              toc={toc}
              ar={ar}
              onSelectPage={onSelectPage}
              onClose={onClose}
            />
          )}

          {/* TAB 3: Notes & Bookmarks */}
          {tab === 'notes' && (
            <SidebarNotesTab
              isOpen={isOpen}
              isSheet={isSheet}
              ar={ar}
              docTitle={docTitle}
              currentPage={currentPage}
              isCurrentPageBookmarked={isCurrentPageBookmarked}
              bookmarks={bookmarks}
              annotations={annotations}
              t={t}
              onSelectPage={onSelectPage}
              onToggleBookmark={onToggleBookmark}
              onDeleteAnnotation={onDeleteAnnotation}
              onUpdateAnnotationNote={onUpdateAnnotationNote}
              onClose={onClose}
            />
          )}
        </div>

        {isSheet && (
          <div className="shrink-0 border-t border-line-subtle px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
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
