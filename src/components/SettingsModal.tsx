import React, { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Columns,
  Download,
  ExternalLink,
  LayoutTemplate,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Type,
  X
} from 'lucide-react';
import type { FontFamilyId, ViewMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { FONTS_LIST } from '../core/settings/fonts';
import { getTranslations } from '../core/i18n/translations';
import { getCurrentVersion } from '../core/updates/currentVersion';
import { useUpdateChecker } from '../core/updates/useUpdateChecker';
import type { UpdateSnapshot } from '../core/updates/types';
import { getUpdateAdapter } from '../platform/updates';
import { getPlatformLabel } from '../platform/runtime';

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

type SettingsTab = 'fonts' | 'reading' | 'about';

function UpdateStatus({
  snapshot,
  lang,
  isInstalling,
  onInstall,
  onManualDownload,
  onRetry
}: {
  snapshot: UpdateSnapshot;
  lang: Language;
  isInstalling: boolean;
  onInstall: () => void;
  onManualDownload: () => void;
  onRetry: () => void;
}) {
  const ar = lang === 'ar';

  if (snapshot.phase === 'up-to-date') {
    return (
      <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-200 text-xs">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span>{ar ? 'أنت تستخدم أحدث إصدار من Otium.' : 'You are on the latest version of Otium.'}</span>
      </div>
    );
  }

  if (snapshot.phase === 'unsupported') {
    return (
      <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-white/5 border border-white/10 text-neutral-300 text-xs">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-neutral-400" />
        <span>{ar ? 'التحديثات متاحة داخل تطبيق Otium المثبت فقط.' : 'Updates are available inside the installed Otium app.'}</span>
      </div>
    );
  }

  if (snapshot.phase === 'error') {
    return (
      <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-100 text-xs space-y-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
          <span className="leading-relaxed">{snapshot.message || (ar ? 'تعذر التحقق من التحديثات.' : 'Could not check for updates.')}</span>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-medium"
        >
          <RefreshCw className="w-3 h-3" />
          {ar ? 'إعادة المحاولة' : 'Try again'}
        </button>
      </div>
    );
  }

  if (snapshot.phase === 'downloading') {
    const percent = snapshot.progress?.percent ?? 0;
    return (
      <div className="p-3 rounded-2xl bg-amber-400/10 border border-amber-400/25 space-y-2 text-xs text-amber-100">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {ar ? 'جارٍ تنزيل التحديث' : 'Downloading update'}
          </span>
          <span className="font-mono text-[11px]">{percent}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-black/30 overflow-hidden">
          <div className="h-full bg-amber-400 transition-all duration-300" style={{ width: `${percent}%` }} />
        </div>
      </div>
    );
  }

  if (snapshot.phase === 'ready') {
    return (
      <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-200 text-xs">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span>
          {snapshot.message ||
            (ar ? 'التحديث جاهز. أكمل التثبيت من نافذة النظام.' : 'Update ready. Finish installing in the system prompt.')}
        </span>
      </div>
    );
  }

  if (snapshot.phase !== 'available') return null;

  const manualOnly = !snapshot.canAutoInstall;

  return (
    <div className="rounded-2xl border border-amber-400/25 bg-amber-400/8 p-3 space-y-2.5 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-amber-200">
            {ar ? `الإصدار ${snapshot.latestVersion} متاح` : `Version ${snapshot.latestVersion} is available`}
          </div>
          <div className="text-[10px] text-neutral-400 font-mono mt-0.5">
            {ar ? 'الحالي' : 'Current'} v{snapshot.currentVersion}
          </div>
        </div>
        <Download className="w-4 h-4 text-amber-300 shrink-0" />
      </div>

      {snapshot.notes && (
        <p className="max-h-28 overflow-y-auto whitespace-pre-line leading-relaxed text-[11px] text-neutral-300 pr-1">
          {snapshot.notes}
        </p>
      )}

      {snapshot.message && (
        <p className="text-[10px] text-neutral-400 leading-relaxed">{snapshot.message}</p>
      )}

      <div className="flex flex-wrap gap-2 pt-0.5">
        {manualOnly ? (
          <button
            type="button"
            onClick={onManualDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400 text-neutral-950 font-semibold hover:bg-amber-300 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {ar ? 'تحميل الإصدار الجديد' : 'Download new version'}
          </button>
        ) : (
          <button
            type="button"
            onClick={onInstall}
            disabled={isInstalling}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400 text-neutral-950 font-semibold hover:bg-amber-300 disabled:opacity-60 transition-colors"
          >
            {isInstalling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {ar ? 'تحديث الآن' : 'Update now'}
          </button>
        )}
      </div>
    </div>
  );
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
  const [activeTab, setActiveTab] = useState<SettingsTab>('fonts');
  const [updateAdapter] = useState(getUpdateAdapter);
  const updates = useUpdateChecker(updateAdapter);
  const t = getTranslations(lang);
  const ar = lang === 'ar';

  if (!isOpen) return null;

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'fonts', label: t.typographyTitle, icon: <Type className="w-3.5 h-3.5" /> },
    { id: 'reading', label: t.defaultReadingMode, icon: <BookOpen className="w-3.5 h-3.5" /> },
    { id: 'about', label: ar ? 'حول التطبيق' : 'About', icon: <Download className="w-3.5 h-3.5" /> }
  ];

  return (
    <div
      dir={ar ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-150"
    >
      <div className="fixed inset-0 bg-black/65 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-neutral-900/98 border border-white/12 rounded-3xl shadow-2xl p-5 sm:p-6 text-neutral-100 z-10 flex flex-col max-h-[90vh] overflow-hidden backdrop-blur-2xl">
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
                {ar ? 'تخصيص الخطوط ونمط العرض لأفضل تجربة قراءة' : 'Tune typography and reading layout'}
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

        <div className="flex items-center gap-1.5 p-1 bg-white/5 rounded-2xl border border-white/5 my-3 shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] sm:text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-amber-400 text-neutral-950 shadow-md font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pr-1 py-1 space-y-4">
          {activeTab === 'fonts' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-neutral-400 px-1 font-mono">
                <span>{t.fontsTitle}</span>
                <span className="text-amber-400 text-[11px] font-sans">
                  {FONTS_LIST.length} {ar ? 'خطوط ممتازة' : 'premium fonts'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {FONTS_LIST.map((font) => {
                  const isSelected = currentFont === font.id;
                  return (
                    <button
                      key={font.id}
                      onClick={() => onFontChange(font.id)}
                      style={{ fontFamily: font.cssFamily }}
                      className={`flex flex-col text-right p-3 rounded-2xl border transition-all cursor-pointer relative ${
                        isSelected
                          ? 'bg-amber-400/15 border-amber-400/40 text-amber-200 shadow-md'
                          : 'bg-white/5 border-white/5 hover:bg-white/10 text-neutral-300 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-sm font-bold tracking-wide">{font.name}</span>
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
              <div className="space-y-2">
                <label className="text-xs font-semibold text-neutral-300 block">
                  {t.defaultReadingMode}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => onViewModeChange('continuous')}
                    className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 transition-all text-xs cursor-pointer ${
                      viewMode === 'continuous'
                        ? 'bg-amber-400/15 border-amber-400/50 text-amber-200'
                        : 'bg-white/5 border-white/5 text-neutral-400 hover:bg-white/10'
                    }`}
                  >
                    <LayoutTemplate className="w-5 h-5 text-amber-400" />
                    <span className="font-medium">{ar ? 'التمرير المستمر' : 'Continuous'}</span>
                    <span className="text-[10px] text-neutral-500">{ar ? 'تصفح عمودي سلس' : 'Smooth vertical flow'}</span>
                  </button>

                  <button
                    onClick={() => onViewModeChange('dual')}
                    className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 transition-all text-xs cursor-pointer ${
                      viewMode === 'dual'
                        ? 'bg-amber-400/15 border-amber-400/50 text-amber-200'
                        : 'bg-white/5 border-white/5 text-neutral-400 hover:bg-white/10'
                    }`}
                  >
                    <BookOpen className="w-5 h-5 text-amber-400" />
                    <span className="font-medium">{ar ? 'صفحتين متجاورة' : 'Two pages'}</span>
                    <span className="text-[10px] text-neutral-500">{ar ? 'كتاب مفتوح هادئ' : 'Open-book spread'}</span>
                  </button>

                  <button
                    onClick={() => onViewModeChange('single')}
                    className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 transition-all text-xs cursor-pointer ${
                      viewMode === 'single'
                        ? 'bg-amber-400/15 border-amber-400/50 text-amber-200'
                        : 'bg-white/5 border-white/5 text-neutral-400 hover:bg-white/10'
                    }`}
                  >
                    <Columns className="w-5 h-5 text-amber-400" />
                    <span className="font-medium">{ar ? 'صفحة واحدة' : 'Single page'}</span>
                    <span className="text-[10px] text-neutral-500">{ar ? 'تركيز عالي' : 'Focused reading'}</span>
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-white/5 border border-white/5 flex items-start gap-2.5 text-xs text-neutral-300">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed text-[11px] text-neutral-400">
                  {ar
                    ? 'تم تصميم قارئ Otium ليكون هادئاً بدون تشتيت، ويُطبَّق نوع الخط المختار فوراً على كافة واجهات القراءة.'
                    : 'Otium is designed to stay quiet and distraction-free. Your selected font is applied instantly across the app.'}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'about' && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-white/5 border border-white/8 p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Otium</div>
                  <div className="text-[11px] text-neutral-400 font-mono mt-0.5">
                    v{getCurrentVersion()} · {getPlatformLabel()}
                  </div>
                </div>
                <div className="text-[10px] px-2 py-1 rounded-full bg-amber-400/15 border border-amber-400/25 text-amber-300">
                  {ar ? 'قارئ هادئ' : 'Quiet reader'}
                </div>
              </div>

              {updateAdapter ? (
                <button
                  type="button"
                  onClick={() => void updates.check()}
                  disabled={updates.isChecking || updates.isInstalling}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-medium text-neutral-200 disabled:opacity-60 transition-colors"
                >
                  {updates.isChecking ? (
                    <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  ) : (
                    <RefreshCw className="w-4 h-4 text-amber-400" />
                  )}
                  {updates.isChecking
                    ? ar
                      ? 'جارٍ التحقق…'
                      : 'Checking…'
                    : ar
                      ? 'التحقق من التحديثات'
                      : 'Check for updates'}
                </button>
              ) : (
                <div className="text-[11px] text-neutral-400 leading-relaxed px-1">
                  {ar
                    ? 'افتح نسخة Otium المثبتة على Windows أو Android للتحقق من التحديثات وتثبيتها.'
                    : 'Open the installed Windows or Android app to check for and install updates.'}
                </div>
              )}

              {updates.snapshot && (
                <UpdateStatus
                  snapshot={updates.snapshot}
                  lang={lang}
                  isInstalling={updates.isInstalling}
                  onInstall={() => void updates.install()}
                  onManualDownload={() => void updates.openManualDownload()}
                  onRetry={() => void updates.check()}
                />
              )}

              <p className="text-[10px] text-neutral-500 leading-relaxed px-1">
                {ar
                  ? 'يشارك Windows وAndroid نفس الإصدار ونفس ملاحظات الإصدار. يختلف شكل الواجهة فقط.'
                  : 'Windows and Android share the same version and release notes. Only the interface shell differs.'}
              </p>
            </div>
          )}
        </div>

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
            {ar ? 'تم وحفظ' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
};
