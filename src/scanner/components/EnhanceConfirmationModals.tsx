import React from 'react';
import type { Language } from '../../core/i18n/translations';
import { Printer, Share2, Image, BookOpen, Stamp, PenTool, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { ScannedPage } from '../core/types';
import type { SignaturePlacement } from '../core/enhancePdfCompile';
import { SignatureModal } from './SignatureModal';

export interface EnhanceConfirmationModalsProps {
  lang?: Language;
  pages: ScannedPage[];
  safeIndex: number;
  currentPage: ScannedPage;
  showCancelModal: boolean;
  setShowCancelModal: (open: boolean) => void;
  showDeletePageModal: boolean;
  setShowDeletePageModal: (open: boolean) => void;
  showMoreActions: boolean;
  setShowMoreActions: (open: boolean) => void;
  isSignatureOpen: boolean;
  setIsSignatureOpen: (open: boolean) => void;
  setToastMsg: (msg: string) => void;
  setCurrentPageIndex: (idx: number) => void;
  setSignatures: React.Dispatch<React.SetStateAction<Record<string, SignaturePlacement>>>;
  onDeletePage: (index: number) => void;
  onResetAll: () => void;
  onSharePdf: () => void;
  onDownloadJpg: () => void;
  onOpenInReader: () => void;
  onWatermark: () => void;
  onPdfOptions: () => void;
  onPrintPdf: () => void;
  triggerHaptic: (duration?: number) => void;
}

export const EnhanceConfirmationModals: React.FC<EnhanceConfirmationModalsProps> = ({
  pages,
  safeIndex,
  currentPage,
  showCancelModal,
  setShowCancelModal,
  showDeletePageModal,
  setShowDeletePageModal,
  showMoreActions,
  setShowMoreActions,
  isSignatureOpen,
  setIsSignatureOpen,
  setToastMsg,
  setCurrentPageIndex,
  setSignatures,
  onDeletePage,
  onResetAll,
  lang = 'ar',
  onSharePdf,
  onDownloadJpg,
  onOpenInReader,
  onWatermark,
  onPdfOptions,
  onPrintPdf,
  triggerHaptic,
}) => {
  const ar = lang === 'ar';
  return (
  <>
    {showCancelModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
        <div className="bg-[#12151d] border border-white/10 rounded-3xl p-5 max-w-sm w-full text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
            <Trash2 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white font-arabic">{ar ? 'حذف كافة الصور والعودة للرئيسية؟' : 'Discard all pages?'}</h3>
            <p className="text-xs text-gray-400 leading-relaxed font-arabic">
              {ar ? 'سيتم إلغاء جلسة المسح الحالية وإفراغ كافة الصفحات الملتقطة والرجوع لشاشة الكاميرا.' : 'All pages in this draft will be discarded.'}
            </p>
          </div>
          <div className="flex items-center gap-2 pt-1 font-arabic">
            <button
              onClick={() => {
                triggerHaptic(20);
                setShowCancelModal(false);
                onResetAll();
              }}
              className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs active:scale-95 transition-transform shadow-lg shadow-rose-500/20"
            >
              {ar ? 'نعم، حذف الكل' : 'Discard all'}
            </button>
            <button
              onClick={() => setShowCancelModal(false)}
              className="flex-1 py-2.5 rounded-xl glass-button text-gray-300 font-semibold text-xs active:scale-95 transition-transform"
            >
              {ar ? 'تراجع' : 'Cancel'}
            </button>
          </div>
        </div>
      </div>
    )}

    {showDeletePageModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
        <div className="bg-[#12151d] border border-white/10 rounded-3xl p-5 max-w-sm w-full text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
            <Trash2 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white font-arabic">{ar ? 'حذف هذه الصفحة؟' : 'Delete this page?'}</h3>
            <p className="text-xs text-gray-400 leading-relaxed font-arabic">
              {pages.length <= 1
                ? (ar ? 'هذه الصفحة الوحيدة في المسودة.' : 'This is the only page in the draft.')
                : (ar ? `ستُحذف الصفحة رقم ${safeIndex + 1}.` : `Page ${safeIndex + 1} will be deleted.`)}
            </p>
          </div>
          <div className="flex items-center gap-2 pt-1 font-arabic">
            <button
              onClick={() => {
                triggerHaptic(20);
                setShowDeletePageModal(false);
                if (pages.length <= 1) {
                  onResetAll();
                } else {
                  onDeletePage(safeIndex);
                  if (safeIndex > 0) setCurrentPageIndex(safeIndex - 1);
                }
              }}
              className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs active:scale-95 transition-transform shadow-lg shadow-rose-500/20"
            >
              {ar ? 'نعم، حذف الصفحة' : 'Delete page'}
            </button>
            <button
              onClick={() => setShowDeletePageModal(false)}
              className="flex-1 py-2.5 rounded-xl glass-button text-gray-300 font-semibold text-xs active:scale-95 transition-transform"
            >
              {ar ? 'تراجع' : 'Cancel'}
            </button>
          </div>
        </div>
      </div>
    )}

    {showMoreActions && (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm animate-in fade-in"
        onClick={() => setShowMoreActions(false)}
      >
        <div
          className="bg-[#12151d] border-t border-white/15 rounded-t-3xl p-5 w-full max-w-md space-y-3 shadow-2xl animate-in slide-in-from-bottom-5 font-arabic"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-12 h-1.5 rounded-full bg-white/20 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-white text-center pb-2 border-b border-white/10">
            {ar ? 'المزيد' : 'More'}
          </h3>

          {[
            { label: ar ? 'مشاركة PDF' : 'Share PDF', icon: Share2, action: onSharePdf },
            { label: ar ? 'فتح في القارئ' : 'Open in reader', icon: BookOpen, action: onOpenInReader },
            { label: ar ? 'حفظ صورة JPG' : 'Save JPG', icon: Image, action: onDownloadJpg },
            { label: ar ? 'طباعة' : 'Print', icon: Printer, action: onPrintPdf },
            { label: ar ? 'إضافة توقيع' : 'Add signature', icon: PenTool, action: () => setIsSignatureOpen(true) },
            { label: ar ? 'علامة مائية' : 'Watermark', icon: Stamp, action: onWatermark },
            { label: ar ? 'إعدادات PDF' : 'PDF settings', icon: SlidersHorizontal, action: onPdfOptions },
          ].map(({ label, icon: Icon, action }) => (
            <button key={label} type="button" onClick={() => { setShowMoreActions(false); action(); }}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl glass-button text-white text-sm">
              <Icon className="w-4 h-4 text-accent" />
              {label}
            </button>
          ))}

          <button
            onClick={() => setShowMoreActions(false)}
            className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 font-semibold text-xs mt-2"
          >
            {ar ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    )}

    <SignatureModal
      isOpen={isSignatureOpen}
      onClose={() => setIsSignatureOpen(false)}
      onSaveSignature={(sigUrl) => {
        if (!currentPage) return;
        triggerHaptic(20);
        setSignatures((prev) => ({
          ...prev,
          [currentPage.id]: { dataUrl: sigUrl, x: 0.58, y: 0.72 },
        }));
        setToastMsg('Signature placed on current page');
        setTimeout(() => setToastMsg(''), 2200);
      }}
    />
  </>
);
};
