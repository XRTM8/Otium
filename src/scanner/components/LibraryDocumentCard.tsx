import React from 'react';
import { BookOpen, Clock, Download, Share2, Trash2 } from 'lucide-react';
import type { Language } from '../../core/i18n/translations';
import type { LibraryDocument } from '../core/storage/documentLibrary';

export interface LibraryDocumentCardProps {
  doc: LibraryDocument;
  lang: Language;
  onOpen: (doc: LibraryDocument) => void;
  onSave: (doc: LibraryDocument) => void;
  onShare: (doc: LibraryDocument) => void;
  onDelete: (id: string) => void;
}

export const LibraryDocumentCard: React.FC<LibraryDocumentCardProps> = ({
  doc,
  lang,
  onOpen,
  onSave,
  onShare,
  onDelete,
}) => {
  return (
    <div className="fluid-press otium-card p-3.5 rounded-2xl flex items-center justify-between gap-3 border border-white/[0.08] hover:border-accent/35 shadow-md group cursor-pointer">
      {/* Thumbnail */}
      <div className="w-14 h-18 rounded-xl bg-black/60 border border-white/10 overflow-hidden flex-shrink-0 relative shadow-inner">
        <img src={doc.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-bold text-white border border-white/10">
          {doc.pageCount}p
        </span>
      </div>

      {/* Meta */}
      <div className="flex-1 min-w-0 text-start">
        <h4 className="text-sm font-bold text-gray-100 truncate group-hover:text-accent transition-colors">
          {doc.title}
        </h4>
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
          <span className="flex items-center gap-1">
            <BookOpen className="w-3 h-3 text-accent" />
            <span>{doc.pageCount} {lang === 'ar' ? (doc.pageCount === 1 ? 'صفحة' : 'صفحات') : 'pages'}</span>
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-gray-500" />
            <span>
              {new Date(doc.createdAt).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => onOpen(doc)}
          className="fluid-press p-2 rounded-xl glass-button text-accent hover:border-accent/40 cursor-pointer"
          title={lang === 'ar' ? 'فتح في قارئ أو تيوم' : 'Open in Otium Reader'}
        >
          <BookOpen className="w-4 h-4" />
        </button>

        <button
          onClick={() => onSave(doc)}
          className="fluid-press p-2 rounded-xl glass-button text-gray-300 active:text-accent hover:border-accent/40 cursor-pointer"
          title={lang === 'ar' ? 'حفظ في التنزيلات' : 'Save to Downloads'}
        >
          <Download className="w-4 h-4" />
        </button>

        <button
          onClick={() => onShare(doc)}
          className="p-2 rounded-xl glass-button text-gray-300 active:text-emerald-400 hover:border-emerald-500/40"
          title="مشاركة المستند PDF"
        >
          <Share2 className="w-4 h-4" />
        </button>

        <button
          onClick={() => onDelete(doc.id)}
          className="p-2 rounded-xl glass-button text-gray-400 active:text-red-400 hover:border-red-500/40"
          title="حذف"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
