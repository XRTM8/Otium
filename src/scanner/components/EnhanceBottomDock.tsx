import React from 'react';
import { Camera, CopyCheck, Crop, FileText, MoreHorizontal, Plus, RotateCw } from 'lucide-react';
import type { Language } from '../../core/i18n/translations';
import type { FilterType, ScannedPage } from '../core/types';

interface EnhanceBottomDockProps {
  lang: Language;
  safeIndex: number;
  pages: ScannedPage[];
  activeFilter: FilterType;
  isExtractingText: boolean;
  pdfGenerating: boolean;
  onEditCrop?: (index: number) => void;
  onRotateCurrentPage: () => void;
  onExtractTextFromPage: () => void;
  onRetakePage: (index: number) => void;
  onDuplicatePage?: (index: number) => void;
  onFilterSelect: (filter: FilterType) => void;
  onApplyFilterToAll: () => void;
  onSelectPageIndex: (idx: number) => void;
  onAddMorePages: () => void;
  onSavePdf: () => void;
  onOpenMoreActions: () => void;
}

export const EnhanceBottomDock: React.FC<EnhanceBottomDockProps> = ({
  lang, safeIndex, pages, activeFilter, isExtractingText, pdfGenerating, onEditCrop, onRotateCurrentPage,
  onExtractTextFromPage, onRetakePage, onDuplicatePage, onFilterSelect, onApplyFilterToAll,
  onSelectPageIndex, onAddMorePages, onSavePdf, onOpenMoreActions,
}) => {
  const ar = lang === 'ar';
  const page = pages[safeIndex];
  const chip = 'glass-button inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-xs';
  const filters: { id: FilterType; label: string }[] = [
    { id: 'original', label: ar ? 'أصلي' : 'Original' },
    { id: 'magic', label: ar ? 'مستند ملوّن' : 'Color document' },
    { id: 'bw', label: ar ? 'أبيض وأسود' : 'Black and white' },
  ];
  return (
    <div className="glass-panel z-20 flex shrink-0 flex-col gap-2 border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {onEditCrop && !page?.redacted && (
          <button type="button" className={chip} onClick={() => onEditCrop(safeIndex)}>
            <Crop size={14} />{page?.needsCropReview ? (ar ? 'راجع القص' : 'Review crop') : (ar ? 'القص' : 'Crop')}
          </button>
        )}
        <button type="button" className={chip} onClick={onRotateCurrentPage}>
          <RotateCw size={14} />{ar ? 'تدوير' : 'Rotate'}
        </button>
        <button type="button" className={chip} onClick={() => onRetakePage(safeIndex)}>
          <Camera size={14} />{ar ? 'إعادة التصوير' : 'Retake'}
        </button>
        <button type="button" className={chip} title={ar ? 'استخراج النص (OCR)' : 'Extract text (OCR)'} onClick={onExtractTextFromPage} disabled={isExtractingText}>
          <FileText size={14} />{isExtractingText ? (ar ? 'جارٍ القراءة…' : 'Reading…') : (ar ? 'استخراج النص' : 'Extract text')}
        </button>
        {onDuplicatePage && (
          <button type="button" className={chip} onClick={() => onDuplicatePage(safeIndex)}>
            <CopyCheck size={14} />{ar ? 'نسخ الصفحة' : 'Duplicate'}
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {filters.map(({ id, label }) => (
          <button key={id} type="button" className={chip + (id === activeFilter ? ' bg-accent/25 text-accent' : '')}
            aria-pressed={id === activeFilter} onClick={() => onFilterSelect(id)}>{label}</button>
        ))}
        {pages.length > 1 && (
          <button type="button" className={chip} onClick={onApplyFilterToAll}>{ar ? 'تطبيق للكل' : 'Apply to all'}</button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {pages.map((item, index) => (
          <button key={item.id} type="button" onClick={() => onSelectPageIndex(index)} aria-current={index === safeIndex}
            aria-label={(ar ? 'صفحة ' : 'Page ') + (index + 1) + (item.needsCropReview ? (ar ? '، راجع القص' : ', review crop') : '')}
            className={'relative h-12 w-9 shrink-0 overflow-hidden rounded-md border ' + (index === safeIndex ? 'border-accent' : 'border-white/20')}>
            <img src={item.thumbnailDataUrl} alt="" className="h-full w-full object-contain" />
            {item.needsCropReview && <span className="absolute end-0 top-0 rounded-bl bg-amber-300 px-1 text-[10px] font-bold text-black">!</span>}
          </button>
        ))}
        <button type="button" className={chip} onClick={onAddMorePages}><Plus size={14} />{ar ? 'إضافة صفحة' : 'Add page'}</button>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onSavePdf} disabled={pdfGenerating}
          className="min-h-11 flex-1 rounded-xl bg-accent px-3 font-semibold text-on-accent disabled:opacity-50">
          {ar ? 'حفظ PDF' : 'Save PDF'}
        </button>
        <button type="button" className={chip} onClick={onOpenMoreActions} disabled={pdfGenerating}
          aria-label={ar ? 'المزيد' : 'More'}><MoreHorizontal size={20} /></button>
      </div>
    </div>
  );
};
