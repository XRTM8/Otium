import React from 'react';
import { ArrowLeft, Trash2, Edit3, LayoutGrid, EyeOff, Undo2 } from 'lucide-react';
import type { Language } from '../../core/i18n/translations';

export interface EnhanceHeaderBarProps {
  lang: Language;
  onBackToCamera: () => void;
  setShowCancelModal: (open: boolean) => void;
  isEditingTitle: boolean;
  setIsEditingTitle: (editing: boolean) => void;
  docTitle: string;
  setDocTitle: (title: string) => void;
  safeIndex: number;
  pageCount: number;
  setShowDeletePageModal: (open: boolean) => void;
  isRedacting: boolean;
  setIsRedacting: (next: boolean) => void;
  redactionStrokes: { x: number; y: number }[][];
  setRedactionStrokes: React.Dispatch<React.SetStateAction<{ x: number; y: number }[][]>>;
  handleBurnRedaction: () => void;
  isGridView: boolean;
  setIsGridView: (next: boolean) => void;
  triggerHaptic: (duration?: number) => void;
}

export const EnhanceHeaderBar: React.FC<EnhanceHeaderBarProps> = ({
  lang,
  onBackToCamera,
  setShowCancelModal,
  isEditingTitle,
  setIsEditingTitle,
  docTitle,
  setDocTitle,
  safeIndex,
  pageCount,
  setShowDeletePageModal,
  isRedacting,
  setIsRedacting,
  redactionStrokes,
  setRedactionStrokes,
  handleBurnRedaction,
  isGridView,
  setIsGridView,
  triggerHaptic,
}) => {
  const ar = lang === 'ar';
  return (
    <>
      <div
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px) + 10px, 48px)' }}
        className="relative z-20 flex items-center justify-between px-3 pb-3 otium-chrome border-b border-white/[0.08]"
      >
        <div className="flex items-center gap-1.5">
          <button
            onClick={onBackToCamera}
            className="p-2 rounded-full glass-button text-gray-300 active:text-white"
            title={ar ? 'رجوع للكاميرا' : 'Back to camera'}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowCancelModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 active:scale-95 transition-all text-[11px] font-bold"
            title={ar ? 'إلغاء كافة الصور والعودة للرئيسية' : 'Discard all pages'}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="font-arabic">{ar ? 'إلغاء الكل' : 'Discard all'}</span>
          </button>
        </div>

        <div className="flex flex-col items-center max-w-[40%]">
          {isEditingTitle ? (
            <input
              type="text"
              value={docTitle}
              autoFocus
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setIsEditingTitle(false);
              }}
              onChange={(e) => setDocTitle(e.target.value)}
              className="text-xs bg-white/10 text-white px-2 py-0.5 rounded-lg border border-accent focus:outline-none text-center max-w-full font-bold"
            />
          ) : (
            <button
              onClick={() => setIsEditingTitle(true)}
              className="flex items-center gap-1 text-xs sm:text-sm font-bold text-white truncate max-w-full hover:text-accent font-arabic"
              title={ar ? 'تعديل اسم المستند' : 'Rename document'}
            >
              <span className="truncate">
                <bdi>{docTitle}</bdi>
              </span>
              <Edit3 className="w-3 h-3 text-accent opacity-80 shrink-0" />
            </button>
          )}
          <span className="text-[10px] text-accent font-bold font-arabic mt-0.5">
            {ar ? `صفحة ${safeIndex + 1} من ${pageCount}` : `Page ${safeIndex + 1} of ${pageCount}`}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowDeletePageModal(true)}
            className="p-1.5 rounded-full glass-button text-gray-300 hover:text-rose-400 active:scale-95 transition-colors"
            title={ar ? 'حذف هذه الصفحة' : 'Delete page'}
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
          </button>
          <button
            onClick={() => {
              triggerHaptic(15);
              setIsRedacting(!isRedacting);
            }}
            className={`p-1.5 rounded-full glass-button transition-colors ${isRedacting ? 'text-accent border-accent/50 bg-accent/20' : 'text-gray-300 active:text-accent'}`}
            title={ar ? 'حجب نصوص حساسة' : 'Redact sensitive text'}
          >
            <EyeOff className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              triggerHaptic(15);
              setIsGridView(!isGridView);
            }}
            className={`p-1.5 rounded-full glass-button transition-colors ${isGridView ? 'text-accent border-accent/50 bg-accent/10' : 'text-gray-300 active:text-accent'}`}
            title={ar ? 'عرض شبكي' : 'Page grid'}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isRedacting && (
        <div className="relative z-30 px-6 py-2.5 bg-black/95 border-b border-accent/30 flex items-center justify-between text-xs animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-accent font-semibold">
            <EyeOff className="w-4 h-4 shrink-0" />
            <span className="truncate">{ar ? 'مرّر إصبعك فوق النص المطلوب حجبه' : 'Draw over the text to redact'}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                triggerHaptic(10);
                setRedactionStrokes((prev) => prev.slice(0, -1));
              }}
              disabled={redactionStrokes.length === 0}
              className="p-1.5 rounded-lg glass-button text-gray-300 disabled:opacity-30 hover:text-white"
              title={ar ? 'التراجع عن آخر خط' : 'Undo last stroke'}
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                triggerHaptic(10);
                setIsRedacting(false);
                setRedactionStrokes([]);
              }}
              className="px-3 py-1 rounded-lg text-gray-400 hover:text-white text-xs"
            >
              {ar ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              onClick={handleBurnRedaction}
              className="px-3.5 py-1 rounded-lg bg-accent text-on-accent font-bold text-xs shadow-lg shadow-accent/25 active:scale-95"
            >
              {ar ? 'تطبيق' : 'Apply'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
