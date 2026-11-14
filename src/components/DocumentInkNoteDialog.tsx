import React from 'react';
import { Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { InkMark } from '../core/annotations/ink';

interface DocumentInkNoteDialogProps {
  note: InkMark;
  ar: boolean;
  canDelete: boolean;
  onChange: (next: InkMark) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export const DocumentInkNoteDialog: React.FC<DocumentInkNoteDialogProps> = ({
  note,
  ar,
  canDelete,
  onChange,
  onSave,
  onDelete,
  onClose,
}) => {
  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-scrim pointer-events-auto"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ar ? 'ملاحظة على الصفحة' : 'Page note'}
        dir={ar ? 'rtl' : 'ltr'}
        className="w-80 max-w-full max-h-[85dvh] overflow-auto rounded-2xl border border-line bg-surface text-ink shadow-xl p-4"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
      >
        <textarea
          autoFocus
          aria-label={ar ? 'نص الملاحظة' : 'Note text'}
          value={note.text}
          maxLength={2000}
          onChange={(e) => onChange({ ...note, text: e.target.value })}
          className="w-full min-h-24 rounded-xl p-2 bg-hover text-sm resize-y"
        />
        <div className="flex flex-wrap items-center gap-2 py-2">
          <label className="flex items-center gap-2 text-xs">
            {ar ? 'لون الملاحظة' : 'Note color'}
            <input
              type="color"
              aria-label={ar ? 'لون الملاحظة' : 'Note color'}
              value={note.color}
              onChange={(e) => onChange({ ...note, color: e.target.value })}
              className="h-10 w-10 cursor-pointer"
            />
          </label>
          {['#e11d48', '#2563eb', '#059669', '#111827', '#f8fafc'].map((c) => (
            <button
              type="button"
              key={c}
              aria-label={`${ar ? 'لون الملاحظة' : 'Note color'} ${c}`}
              aria-pressed={note.color === c}
              onClick={() => onChange({ ...note, color: c })}
              className="h-8 w-8 rounded-full border border-line"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 pt-2 text-xs">
          <button
            className="min-h-11 rounded-lg bg-accent text-on-accent px-3 py-2"
            disabled={!note.text?.trim()}
            onClick={onSave}
          >
            {ar ? 'حفظ' : 'Save'}
          </button>
          <button className="min-h-11 px-3" onClick={onClose}>
            {ar ? 'إلغاء' : 'Cancel'}
          </button>
          {canDelete && (
            <button
              aria-label={ar ? 'حذف الملاحظة' : 'Delete note'}
              className="ms-auto min-h-11 flex items-center gap-2 text-danger-ink"
              onClick={onDelete}
            >
              <Trash2 size={16} />
              {ar ? 'حذف' : 'Delete'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
