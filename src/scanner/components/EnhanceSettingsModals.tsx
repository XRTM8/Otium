import React from 'react';
import { Copy, FileText, PenTool, SlidersHorizontal, Stamp, X } from 'lucide-react';
import type { Language } from '../../core/i18n/translations';
import type { PdfCompressionPreset, PdfPageFormat, PdfWatermarkStyle } from '../core/pdf';
import { copyTextToClipboard } from '../../core/utils/clipboard';

export interface EnhanceSettingsModalsProps {
  lang?: Language;
  safeIndex: number;
  isWatermarkOpen: boolean;
  setIsWatermarkOpen: (open: boolean) => void;
  isAdvancedOptionsOpen: boolean;
  setIsAdvancedOptionsOpen: (open: boolean) => void;
  isOcrModalOpen: boolean;
  setIsOcrModalOpen: (open: boolean) => void;
  setIsSignatureOpen: (open: boolean) => void;
  watermarkText: string;
  setWatermarkText: (text: string) => void;
  watermarkStyle: PdfWatermarkStyle;
  setWatermarkStyle: (style: PdfWatermarkStyle) => void;
  compressionPreset: PdfCompressionPreset;
  setCompressionPreset: (preset: PdfCompressionPreset) => void;
  pageFormat: PdfPageFormat;
  setPageFormat: (fmt: PdfPageFormat) => void;
  enableOcr: boolean;
  setEnableOcr: (enabled: boolean) => void;
  curvature: number;
  setCurvature: (value: number) => void;
  spinePos: number;
  setSpinePos: (value: number) => void;
  suggestedDocTitle: string;
  extractedText: string;
  setDocTitle: (title: string) => void;
  setToastMsg: (msg: string) => void;
  triggerHaptic: (duration?: number) => void;
}

export const EnhanceSettingsModals: React.FC<EnhanceSettingsModalsProps> = ({
  lang = 'ar',
  safeIndex,
  isWatermarkOpen,
  setIsWatermarkOpen,
  isAdvancedOptionsOpen,
  setIsAdvancedOptionsOpen,
  isOcrModalOpen,
  setIsOcrModalOpen,
  setIsSignatureOpen,
  watermarkText,
  setWatermarkText,
  watermarkStyle,
  setWatermarkStyle,
  compressionPreset,
  setCompressionPreset,
  pageFormat,
  setPageFormat,
  enableOcr,
  setEnableOcr,
  curvature,
  setCurvature,
  spinePos,
  setSpinePos,
  suggestedDocTitle,
  extractedText,
  setDocTitle,
  setToastMsg,
  triggerHaptic,
}) => {
  const ar = lang === 'ar';
  return (
  <>
    {isWatermarkOpen && (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 select-none font-arabic">
        <div className="w-full max-w-sm bg-[#12161f] border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 text-right">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <button
              onClick={() => setIsWatermarkOpen(false)}
              className="p-1.5 rounded-full glass-button text-gray-400 hover:text-white"
            >
              ✕
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">{ar ? 'العلامة المائية' : 'Watermark'}</span>
              <Stamp className="w-5 h-5 text-accent" />
            </div>
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/5 border border-white/10 text-xs">
            <button
              onClick={() => setWatermarkStyle('diagonal')}
              className={`flex-1 py-1.5 rounded-xl font-bold transition-all ${
                watermarkStyle === 'diagonal' ? 'bg-accent text-on-accent shadow' : 'text-gray-400'
              }`}
            >
              {ar ? 'قطري في المنتصف' : 'Diagonal'}
            </button>
            <button
              onClick={() => setWatermarkStyle('tiled')}
              className={`flex-1 py-1.5 rounded-xl font-bold transition-all ${
                watermarkStyle === 'tiled' ? 'bg-accent text-on-accent shadow' : 'text-gray-400'
              }`}
            >
              {ar ? 'شبكة حماية مكررة' : 'Tiled'}
            </button>
          </div>

          <input
            type="text"
            placeholder="اكتب نص العلامة المائية (مثال: سري، مسودة...)"
            value={watermarkText}
            onChange={(e) => setWatermarkText(e.target.value)}
            className="w-full bg-white/5 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-accent/60 text-right font-arabic"
          />

          <div className="flex items-center justify-end gap-1.5 flex-wrap">
            {['سري للغاية', 'نسخة للمراجعة', 'مسودة', 'مدفوع', 'CONFIDENTIAL', 'COPY'].map((preset) => (
              <button
                key={preset}
                onClick={() => setWatermarkText(preset)}
                className="px-2.5 py-1 rounded-lg bg-white/5 text-[10px] text-gray-300 border border-white/5 hover:border-accent/40 active:scale-95 font-arabic"
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
            {watermarkText && (
              <button
                onClick={() => {
                  setWatermarkText('');
                  setIsWatermarkOpen(false);
                  setToastMsg('تمت إزالة العلامة المائية');
                  setTimeout(() => setToastMsg(''), 2000);
                }}
                className="px-3.5 py-2 rounded-xl text-xs text-red-400 glass-button font-bold"
              >
                إزالة العلامة
              </button>
            )}
            <button
              onClick={() => {
                setIsWatermarkOpen(false);
                if (watermarkText.trim()) {
                  setToastMsg(`تم ضبط العلامة: "${watermarkText.trim()}"`);
                  setTimeout(() => setToastMsg(''), 2200);
                }
              }}
              className="px-5 py-2 rounded-xl bg-accent text-on-accent font-bold text-xs shadow-lg shadow-accent/25 active:scale-95 mr-auto"
            >
              {ar ? 'تطبيق العلامة' : 'Apply watermark'}
            </button>
          </div>
        </div>
      </div>
    )}

    {isAdvancedOptionsOpen && (
      <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-200 select-none font-arabic">
        <div className="w-full max-w-sm max-h-[90vh] bg-[#0c1017] border border-white/[0.12] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.08] otium-chrome">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-accent" />
              <span className="text-sm font-bold text-white">{ar ? 'إعدادات PDF المتقدمة' : 'PDF settings'}</span>
            </div>
            <button
              onClick={() => setIsAdvancedOptionsOpen(false)}
              className="p-1.5 rounded-full glass-button text-gray-400 active:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 overflow-y-auto space-y-4 text-right">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-200 block">{ar ? 'جودة وحجم الملف' : 'Image quality'}</label>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-white/[0.05] border border-white/[0.08]">
                {(
                  [
                    { id: 'compact', label: ar ? 'مضغوط' : 'Compact' },
                    { id: 'balanced', label: ar ? 'متوازن' : 'Balanced' },
                    { id: 'max', label: ar ? 'دقة أعلى' : 'High resolution' },
                  ] as const
                ).map((q) => (
                  <button
                    key={q.id}
                    onClick={() => {
                      triggerHaptic(10);
                      setCompressionPreset(q.id);
                    }}
                    className={`py-2 px-1 rounded-xl text-center transition-all ${
                      compressionPreset === q.id
                        ? 'bg-accent text-on-accent font-bold shadow-md'
                        : 'text-gray-300 hover:text-white'
                    }`}
                  >
                    <span className="text-xs block font-bold">{q.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-200 block">{ar ? 'أبعاد الورقة ومقاس الصفحة' : 'Page size'}</label>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-white/[0.05] border border-white/[0.08]">
                <button
                  onClick={() => {
                    triggerHaptic(10);
                    setPageFormat('a4');
                  }}
                  className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
                    pageFormat === 'a4' ? 'bg-accent text-on-accent shadow-md' : 'text-gray-300 hover:text-white'
                  }`}
                >
                  {ar ? 'معيار A4 الدولي (للطباعة)' : 'A4'}
                </button>
                <button
                  onClick={() => {
                    triggerHaptic(10);
                    setPageFormat('fit');
                  }}
                  className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
                    pageFormat === 'fit' ? 'bg-accent text-on-accent shadow-md' : 'text-gray-300 hover:text-white'
                  }`}
                >
                  {ar ? 'أبعاد الصورة الأصلية (Fit)' : 'Fit image'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
              <button
                onClick={() => {
                  triggerHaptic(15);
                  setEnableOcr(!enableOcr);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  enableOcr ? 'bg-accent text-on-accent shadow' : 'bg-white/[0.08] text-gray-400'
                }`}
              >
                {enableOcr ? (ar ? 'مفعّل' : 'On') : (ar ? 'معطّل' : 'Off')}
              </button>
              <div>
                <span className="text-xs font-bold text-gray-200 block">{ar ? 'التعرف على النصوص (OCR)' : 'Searchable text (OCR)'}</span>
                <span className="text-[10px] text-gray-400">{ar ? 'استخراج النص للبحث والنسخ داخل الـ PDF' : 'Include text for search and copy'}</span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-accent font-mono font-bold">
                  {Math.round(curvature * 100)}%
                </span>
                <span className="text-xs font-bold text-gray-200">{ar ? 'تعديل انحناء الكتب (تجريبي)' : 'Book curvature (experimental)'}</span>
              </div>
              <div className="flex items-center gap-1.5 justify-center">
                <button
                  onClick={() => setSpinePos(0.15)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    spinePos <= 0.25 ? 'bg-accent text-on-accent' : 'bg-white/[0.06] text-gray-400'
                  }`}
                >
                  {ar ? 'صفحة يمنى' : 'Right page'}
                </button>
                <button
                  onClick={() => setSpinePos(0.5)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    spinePos > 0.25 && spinePos < 0.75 ? 'bg-accent text-on-accent' : 'bg-white/[0.06] text-gray-400'
                  }`}
                >
                  {ar ? 'الوسط' : 'Center'}
                </button>
                <button
                  onClick={() => setSpinePos(0.85)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    spinePos >= 0.75 ? 'bg-accent text-on-accent' : 'bg-white/[0.06] text-gray-400'
                  }`}
                >
                  {ar ? 'صفحة يسرى' : 'Left page'}
                </button>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={curvature}
                onChange={(e) => setCurvature(parseFloat(e.target.value))}
                className="w-full accent-accent cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => {
                  setIsAdvancedOptionsOpen(false);
                  setIsWatermarkOpen(true);
                }}
                className="py-2.5 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-gray-200 flex items-center justify-center gap-1.5 border border-white/[0.08]"
              >
                <Stamp className="w-3.5 h-3.5 text-accent" />
                <span>{ar ? 'علامة مائية' : 'Watermark'}</span>
              </button>
              <button
                onClick={() => {
                  setIsAdvancedOptionsOpen(false);
                  setIsSignatureOpen(true);
                }}
                className="py-2.5 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-gray-200 flex items-center justify-center gap-1.5 border border-white/[0.08]"
              >
                <PenTool className="w-3.5 h-3.5 text-accent" />
                <span>توقيع يدوي</span>
              </button>
            </div>

            <button
              onClick={() => setIsAdvancedOptionsOpen(false)}
              className="w-full py-2.5 rounded-xl bg-accent text-on-accent font-bold text-xs active:scale-95 mt-2"
            >
              تم تطبيق الإعدادات
            </button>
          </div>
        </div>
      </div>
    )}

    {isOcrModalOpen && (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
        <div
          style={{
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 20px)',
          }}
          className="relative w-full sm:max-w-lg bg-[#0e121b] border-t sm:border border-white/15 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl flex flex-col gap-4 font-arabic max-h-[85vh]"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <button
              onClick={() => setIsOcrModalOpen(false)}
              className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-bold text-white">النص المستخرج من الصفحة {safeIndex + 1}</h3>
            </div>
          </div>

          {suggestedDocTitle && (
            <div className="flex items-center justify-between p-2.5 rounded-2xl bg-accent/10 border border-accent/30 text-xs">
              <button
                onClick={() => {
                  setDocTitle(suggestedDocTitle);
                  triggerHaptic(15);
                  setToastMsg('✓ تم تعيين العنوان المقترح للمستند');
                  setTimeout(() => setToastMsg(''), 2000);
                }}
                className="px-3 py-1 bg-accent text-on-accent rounded-xl font-bold active:scale-95 transition-transform cursor-pointer"
              >
                اعتماد كاسم
              </button>
              <div className="flex flex-col text-right">
                <span className="text-[10px] text-accent font-bold">عنوان ذكي مقترح من المستند:</span>
                <span className="text-white font-mono truncate max-w-[200px]">{suggestedDocTitle}</span>
              </div>
            </div>
          )}

          <div className="relative flex-1 min-h-[160px] max-h-[300px] overflow-y-auto rounded-2xl bg-black/40 border border-white/10 p-3.5 text-right font-sans text-xs text-gray-200 leading-relaxed whitespace-pre-wrap select-text">
            {extractedText}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                triggerHaptic(15);
                await copyTextToClipboard(extractedText);
                setToastMsg('✓ تم نسخ النص كاملاً إلى الحافظة');
                setTimeout(() => setToastMsg(''), 2000);
              }}
              className="flex-1 py-2.5 px-4 rounded-xl bg-accent text-on-accent font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg cursor-pointer"
            >
              <Copy className="w-4 h-4" />
              <span>نسخ النص كاملاً</span>
            </button>
            <button
              onClick={() => setIsOcrModalOpen(false)}
              className="py-2.5 px-5 rounded-xl glass-button text-gray-300 font-medium text-xs active:scale-95 transition-transform cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    )}
  </>
);
};
