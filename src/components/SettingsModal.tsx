import React, { useState } from 'react';
import {
  X,
  Type,
  BookOpen,
  LayoutTemplate,
  RotateCcw,
  Check,
  Sparkles
} from 'lucide-react';
import type { FontFamilyId, ViewMode } from '../types';
import type { Language } from '../utils/translations';
import { FONTS_LIST, saveFont } from '../utils/fonts';
import { getTranslations } from '../utils/translations';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFont: FontFamilyId;
  onFontChange: (font: FontFamilyId) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  lang?: Language;
  onResetDefaults: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentFont,
  onFontChange,
  viewMode,
  onViewModeChange,
  lang = 'ar',
  onResetDefaults
}) => {
  const [activeTab, setActiveTab] = useState<'fonts' | 'reading'>('fonts');
  const t = getTranslations(lang);

  if (!isOpen) return null;

  const handleSelectFont = (fontId: FontFamilyId) => {
    onFontChange(fontId);
    saveFont(fontId);
  };

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-150"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Main Container */}
      <div className="relative w-full max-w-xl bg-neutral-900/98 border border-white/12 rounded-3xl shadow-2xl p-5 sm:p-6 text-neutral-100 z-10 flex flex-col max-h-[90vh] overflow-hidden backdrop-blur-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-400/15 border border-amber-400/25 flex items-center justify-center text-amber-400">
              <Type className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold tracking-wide text-white">
                {t.settingsTitle}
              </h2>
              <p className="text-[11px] text-neutral-400 font-sans">
                تخصيص الخطوط ونمط العرض لأفضل تجربة قراءة
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-white/5 rounded-2xl border border-white/5 my-3 shrink-0">
          <button
            onClick={() => setActiveTab('fonts')}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'fonts'
                ? 'bg-amber-400 text-neutral-950 shadow-md font-semibold'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span>{t.typographyTitle}</span>
          </button>

          <button
            onClick={() => setActiveTab('reading')}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'reading'
                ? 'bg-amber-400 text-neutral-950 shadow-md font-semibold'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{t.defaultReadingMode}</span>
          </button>
        </div>

        {/* Body Scroll Area */}
        <div className="flex-1 overflow-y-auto pr-1 py-1 space-y-4">
          {activeTab === 'fonts' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-neutral-400 px-1 font-mono">
                <span>{t.fontsTitle}</span>
                <span className="text-amber-400 text-[11px] font-sans">
                  {FONTS_LIST.length} خطوط ممتازة
                </span>
              </div>

              {/* Fonts Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {FONTS_LIST.map((font) => {
                  const isSelected = currentFont === font.id;
                  return (
                    <button
                      key={font.id}
                      onClick={() => handleSelectFont(font.id)}
                      style={{ fontFamily: font.cssFamily }}
                      className={`flex flex-col text-right p-3 rounded-2xl border transition-all cursor-pointer relative ${
                        isSelected
                          ? 'bg-amber-400/15 border-amber-400/40 text-amber-200 shadow-md'
                          : 'bg-white/5 border-white/5 hover:bg-white/10 text-neutral-300 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-sm font-bold tracking-wide">
                          {font.name}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-neutral-300 font-sans border border-white/5">
                            {font.badge}
                          </span>
                          {isSelected && (
                            <div className="w-4 h-4 rounded-full bg-amber-400 text-neutral-950 flex items-center justify-center">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Font Sample Text */}
                      <p className="text-xs text-neutral-400 opacity-90 truncate w-full mt-0.5">
                        {font.sampleAr}
                      </p>
                      <span className="text-[10px] text-neutral-500 font-mono mt-1 opacity-60">
                        {font.subname}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'reading' && (
            <div className="space-y-4">
              {/* Reading View Mode Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-neutral-300 block">
                  {t.defaultReadingMode}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onViewModeChange('continuous')}
                    className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 transition-all text-xs cursor-pointer ${
                      viewMode === 'continuous'
                        ? 'bg-amber-400/15 border-amber-400/50 text-amber-200'
                        : 'bg-white/5 border-white/5 text-neutral-400 hover:bg-white/10'
                    }`}
                  >
                    <LayoutTemplate className="w-5 h-5 text-amber-400" />
                    <span className="font-medium">التمرير العمودي المستمر</span>
                    <span className="text-[10px] text-neutral-500">مثالي للمستندات والكتب الطويلة</span>
                  </button>

                  <button
                    onClick={() => onViewModeChange('single')}
                    className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 transition-all text-xs cursor-pointer ${
                      viewMode === 'single'
                        ? 'bg-amber-400/15 border-amber-400/50 text-amber-200'
                        : 'bg-white/5 border-white/5 text-neutral-400 hover:bg-white/10'
                    }`}
                  >
                    <BookOpen className="w-5 h-5 text-amber-400" />
                    <span className="font-medium">نمط الصفحة الواحدة</span>
                    <span className="text-[10px] text-neutral-500">مع انيميشن الانزلاق الحركي</span>
                  </button>
                </div>
              </div>

              {/* Quiet Reading Hint */}
              <div className="p-3 rounded-2xl bg-white/5 border border-white/5 flex items-start gap-2.5 text-xs text-neutral-300">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed text-[11px] text-neutral-400">
                  تم تصميم قارئ Otium ليكون هادئاً بدون تشتيت، يتم تطبيق نوع الخط المختار تلقائياً وبشكل فوري على كافة عناصر التطبيق وواجهات القراءة.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer with Reset Defaults */}
        <div className="pt-3 border-t border-white/10 flex items-center justify-between shrink-0 mt-2">
          <button
            onClick={onResetDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-white/10 text-neutral-400 hover:text-white transition-colors text-xs cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.resetDefaults}</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-amber-400 text-neutral-950 font-semibold text-xs hover:bg-amber-300 transition-colors cursor-pointer shadow-md shadow-amber-400/10"
          >
            تم وحفظ
          </button>
        </div>

      </div>
    </div>
  );
};
