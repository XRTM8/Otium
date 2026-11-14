import React, { useState } from 'react';
import {
  Bookmark,
  Trash2,
  Copy,
  Check,
  Download,
  Plus,
  StickyNote
} from 'lucide-react';
import type { TocItem, BookmarkItem, TextAnnotation } from '../core/types';
import type { getTranslations } from '../core/i18n/translations';
import { saveTextFile } from '../platform/saveFile';
import { copyTextToClipboard } from '../core/utils/clipboard';

export interface FlatTocItem extends TocItem {
  depth: number;
}

interface SidebarTocTabProps {
  toc: FlatTocItem[];
  ar: boolean;
  onSelectPage: (page: number) => void;
  onClose: () => void;
}

export const SidebarTocTab: React.FC<SidebarTocTabProps> = ({
  toc,
  ar,
  onSelectPage,
  onClose,
}) => (
  <div className="space-y-1">
    {toc.length === 0 ? (
      <div className="py-12 text-center text-xs text-ink-faint font-sans">
        {ar ? 'لا يحتوي هذا المستند على فهرس عناوين مدمج' : 'This document has no embedded outline'}
      </div>
    ) : (
      toc.map((item) => (
        <button
          key={`${item.pageNumber}-${item.depth}-${item.title}`}
          onClick={() => {
            onSelectPage(item.pageNumber);
            onClose();
          }}
          style={{ paddingInlineStart: `${12 + item.depth * 14}px` }}
          className="w-full text-start pe-3 py-2.5 rounded-xl text-xs hover:bg-hover transition-colors flex items-center justify-between group cursor-pointer"
        >
          <span className="truncate flex-1 group-hover:text-highlight transition-colors font-sans">
            {item.title}
          </span>
          <span className={`text-[10px] opacity-40 group-hover:opacity-80 shrink-0 ${ar ? 'font-sans' : 'font-mono'}`}>
            {ar ? `ص ${item.pageNumber}` : `p. ${item.pageNumber}`}
          </span>
        </button>
      ))
    )}
  </div>
);

interface SidebarNotesTabProps {
  isOpen: boolean;
  isSheet: boolean;
  ar: boolean;
  docTitle: string;
  currentPage: number;
  isCurrentPageBookmarked: boolean;
  bookmarks: BookmarkItem[];
  annotations: TextAnnotation[];
  t: ReturnType<typeof getTranslations>;
  onSelectPage: (page: number) => void;
  onToggleBookmark?: (pageNumber: number) => void;
  onDeleteAnnotation?: (id: string) => void;
  onUpdateAnnotationNote?: (id: string, note: string) => void;
  onClose: () => void;
}

export const SidebarNotesTab: React.FC<SidebarNotesTabProps> = ({
  isOpen,
  isSheet,
  ar,
  docTitle,
  currentPage,
  isCurrentPageBookmarked,
  bookmarks,
  annotations,
  t,
  onSelectPage,
  onToggleBookmark,
  onDeleteAnnotation,
  onUpdateAnnotationNote,
  onClose,
}) => {
  const [copiedAll, setCopiedAll] = useState(false);
  const [exported, setExported] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [prevOpen, setPrevOpen] = useState(isOpen);

  if (prevOpen !== isOpen) {
    setPrevOpen(isOpen);
    if (!isOpen) {
      setEditingNoteId(null);
      setNoteDraft('');
    }
  }

  return (
    <div className="space-y-4">
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
                  await copyTextToClipboard(content);
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
                <div className={`flex items-center justify-between text-[10px] text-ink-muted ${ar ? 'font-sans' : 'font-mono'}`}>
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
  );
};
