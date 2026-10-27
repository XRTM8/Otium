import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Columns,
  Database,
  Download,
  ExternalLink,
  HardDrive,
  LayoutTemplate,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Type,
  Upload,
  X
} from 'lucide-react';
import type { FontFamilyId, ViewMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { FONTS_LIST } from '../core/settings/fonts';
import { getTranslations } from '../core/i18n/translations';
import { getCurrentVersion } from '../core/updates/currentVersion';
import { useUpdateChecker } from '../core/updates/useUpdateChecker';
import type { UpdateSnapshot } from '../core/updates/types';
import type { RestoreSummary } from '../core/storage/backupFormat';
import { getStorageSummary, type StorageSummary } from '../core/storage/documents';
import type { SaveTextOutcome } from '../platform/saveFile';
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
  /** Touch shells expose mobile-only reading preferences. */
  mobile?: boolean;
  mobileNavVisible?: boolean;
  onMobileNavVisibleChange?: (visible: boolean) => void;
  onResetDefaults: () => void;
  onExportBackup?: () => Promise<SaveTextOutcome>;
  onImportBackup?: (text: string) => Promise<RestoreSummary>;
}

type SettingsTab = 'fonts' | 'reading' | 'data' | 'about';

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
      <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-success-ink text-xs">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span>{ar ? 'أنت تستخدم أحدث إصدار من Otium.' : 'You are on the latest version of Otium.'}</span>
      </div>
    );
  }

  if (snapshot.phase === 'unsupported') {
    return (
      <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-hover-subtle border border-line text-ink-muted text-xs">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-ink-muted" />
        <span>{ar ? 'التحديثات متاحة داخل تطبيق Otium المثبت فقط.' : 'Updates are available inside the installed Otium app.'}</span>
      </div>
    );
  }

  if (snapshot.phase === 'error') {
    return (
      <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-danger-ink text-xs space-y-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-danger-ink" />
          <span className="leading-relaxed">{snapshot.message || (ar ? 'تعذر التحقق من التحديثات.' : 'Could not check for updates.')}</span>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-hover hover:bg-hover-strong text-[11px] font-medium"
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
      <div className="p-3 rounded-2xl bg-accent/10 border border-accent/25 space-y-2 text-xs text-highlight">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {ar ? 'جارٍ تنزيل التحديث' : 'Downloading update'}
          </span>
          <span className="font-mono text-[11px]">{percent}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-hover overflow-hidden">
          <div className="h-full bg-accent transition-all duration-300" style={{ width: `${percent}%` }} />
        </div>
      </div>
    );
  }

  if (snapshot.phase === 'ready') {
    return (
      <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-success-ink text-xs">
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
    <div className="rounded-2xl border border-accent/25 bg-accent/8 p-3 space-y-2.5 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-highlight">
            {ar ? `الإصدار ${snapshot.latestVersion} متاح` : `Version ${snapshot.latestVersion} is available`}
          </div>
          <div className="text-[10px] text-ink-muted font-mono mt-0.5">
            {ar ? 'الحالي' : 'Current'} v{snapshot.currentVersion}
          </div>
        </div>
        <Download className="w-4 h-4 text-highlight shrink-0" />
      </div>

      {snapshot.notes && (
        <p className="max-h-28 overflow-y-auto whitespace-pre-line leading-relaxed text-[11px] text-ink-muted pr-1">
          {snapshot.notes}
        </p>
      )}

      {snapshot.message && (
        <p className="text-[10px] text-ink-muted leading-relaxed">{snapshot.message}</p>
      )}

      <div className="flex flex-wrap gap-2 pt-0.5">
        {manualOnly ? (
          <button
            type="button"
            onClick={onManualDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent text-on-accent font-semibold hover:bg-accent-strong transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {ar ? 'تحميل الإصدار الجديد' : 'Download new version'}
          </button>
        ) : (
          <button
            type="button"
            onClick={onInstall}
            disabled={isInstalling}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent text-on-accent font-semibold hover:bg-accent-strong disabled:opacity-60 transition-colors"
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
  mobile = false,
  mobileNavVisible = true,
  onMobileNavVisibleChange,
  onResetDefaults,
  onExportBackup,
  onImportBackup
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('fonts');
  const [updateAdapter] = useState(getUpdateAdapter);
  const updates = useUpdateChecker(updateAdapter);
  const [storage, setStorage] = useState<StorageSummary | null>(null);
  const [dataBusy, setDataBusy] = useState<'export' | 'import' | null>(null);
  const [dataNotice, setDataNotice] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const t = getTranslations(lang);
  const ar = lang === 'ar';

  useEffect(() => {
    if (!isOpen || activeTab !== 'data') return;
    let alive = true;
    void getStorageSummary().then((summary) => {
      if (alive) setStorage(summary);
    });
    return () => {
      alive = false;
    };
  }, [activeTab, isOpen]);

  if (!isOpen) return null;

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 MB';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const handleExport = async () => {
    if (!onExportBackup || dataBusy) return;
    setDataBusy('export');
    setDataNotice(null);
    try {
      const outcome = await onExportBackup();
      if (outcome === 'unavailable') {
        setDataNotice({
          tone: 'error',
          text: ar ? 'تعذر حفظ الملف على هذا الجهاز.' : 'Could not save the file on this device.'
        });
      } else {
        setDataNotice({
          tone: 'success',
          text:
            outcome === 'native-picker'
              ? ar
                ? 'اختر مجلد الحفظ لإكمال التصدير.'
                : 'Choose a folder to finish exporting.'
              : ar
                ? 'تم تنزيل نسخة احتياطية بصيغة JSON.'
                : 'JSON backup downloaded.'
        });
      }
    } catch (error) {
      setDataNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setDataBusy(null);
    }
  };

  const handleImport = async (file: File) => {
    if (!onImportBackup || dataBusy) return;
    setDataBusy('import');
    setDataNotice(null);
    try {
      const text = await file.text();
      const summary = await onImportBackup(text);
      const nextStorage = await getStorageSummary();
      setStorage(nextStorage);
      setDataNotice({
        tone: 'success',
        text: ar
          ? `تمت الاستعادة: ${summary.documents} مستند، ${summary.annotations} اقتباس، ${summary.bookmarks} إشارة.`
          : `Restored ${summary.documents} documents, ${summary.annotations} highlights and ${summary.bookmarks} bookmarks.`
      });
    } catch (error) {
      setDataNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setDataBusy(null);
    }
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'fonts', label: ar ? 'الخطوط' : 'Fonts', icon: <Type className="w-3.5 h-3.5" /> },
    { id: 'reading', label: ar ? 'العرض' : 'Reading', icon: <BookOpen className="w-3.5 h-3.5" /> },
    {
      id: 'data',
      label: ar ? 'البيانات' : 'Data',
      icon: <Database className="w-3.5 h-3.5" />
    },
    { id: 'about', label: ar ? 'حول التطبيق' : 'About', icon: <Download className="w-3.5 h-3.5" /> }
  ];

  return (
    <div
      dir={ar ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-150"
    >
      <div className="fixed inset-0 bg-scrim backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="otium-panel relative z-10 flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden p-5 text-ink sm:p-6">
        <div className="flex items-center justify-between pb-4 border-b border-line shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent">
              <Type className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold tracking-wide text-ink">
                {t.settingsTitle}
              </h2>
              <p className="text-[11px] text-ink-muted font-sans">
                {ar ? 'تخصيص الخطوط ونمط العرض لأفضل تجربة قراءة' : 'Tune typography and reading layout'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-hover text-ink-muted hover:text-ink transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="segmented my-3 flex w-full shrink-0 overflow-x-auto scrollbar-none gap-1 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-active={activeTab === tab.id}
              className="flex-1 min-w-[70px] justify-center py-2 px-2 text-xs font-semibold whitespace-nowrap active:scale-95 transition-all cursor-pointer"
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pr-1 py-1 space-y-4">
          {activeTab === 'fonts' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-ink-muted px-1 font-mono">
                <span>{t.fontsTitle}</span>
                <span className="text-highlight text-[11px] font-sans">
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
                      className={`relative flex cursor-pointer flex-col rounded-2xl border p-3 text-right transition-all ${
                        isSelected
                          ? 'border-accent/45 bg-accent/10 text-ink shadow-sm ring-1 ring-accent/25'
                          : 'border-line-subtle bg-hover-subtle text-ink-muted hover:border-line hover:bg-hover'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-sm font-bold tracking-wide">{font.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-hover text-ink-muted font-sans border border-line-subtle">
                            {font.badge}
                          </span>
                          {isSelected && (
                            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-on-accent">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </div>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-ink-muted opacity-90 truncate w-full mt-0.5">
                        {font.sampleAr}
                      </p>
                      <span className="text-[10px] text-ink-faint font-mono mt-1 opacity-60">
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
                <label className="text-xs font-semibold text-ink-muted block">
                  {t.defaultReadingMode}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => onViewModeChange('continuous')}
                    className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 transition-all text-xs cursor-pointer ${
                      viewMode === 'continuous'
                        ? 'bg-accent/15 border-accent/50 text-accent'
                        : 'bg-hover-subtle border-line-subtle text-ink-muted hover:bg-hover'
                    }`}
                  >
                    <LayoutTemplate className="w-5 h-5" />
                    <span className="font-medium">{ar ? 'التمرير المستمر' : 'Continuous'}</span>
                    <span className="text-[10px] text-ink-faint">{ar ? 'تصفح عمودي سلس' : 'Smooth vertical flow'}</span>
                  </button>

                  <button
                    onClick={() => onViewModeChange('dual')}
                    className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 transition-all text-xs cursor-pointer ${
                      viewMode === 'dual'
                        ? 'bg-accent/15 border-accent/50 text-accent'
                        : 'bg-hover-subtle border-line-subtle text-ink-muted hover:bg-hover'
                    }`}
                  >
                    <BookOpen className="w-5 h-5" />
                    <span className="font-medium">{ar ? 'صفحتين متجاورة' : 'Two pages'}</span>
                    <span className="text-[10px] text-ink-faint">{ar ? 'كتاب مفتوح هادئ' : 'Open-book spread'}</span>
                  </button>

                  <button
                    onClick={() => onViewModeChange('single')}
                    className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 transition-all text-xs cursor-pointer ${
                      viewMode === 'single'
                        ? 'bg-accent/15 border-accent/50 text-accent'
                        : 'bg-hover-subtle border-line-subtle text-ink-muted hover:bg-hover'
                    }`}
                  >
                    <Columns className="w-5 h-5" />
                    <span className="font-medium">{ar ? 'صفحة واحدة' : 'Single page'}</span>
                    <span className="text-[10px] text-ink-faint">{ar ? 'تركيز عالي' : 'Focused reading'}</span>
                  </button>
                </div>
              </div>

              {mobile && onMobileNavVisibleChange && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={mobileNavVisible}
                  onClick={() => onMobileNavVisibleChange(!mobileNavVisible)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line-subtle bg-hover-subtle p-3 text-start transition-colors active:bg-hover"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-ink">
                      {ar ? 'شريط التنقل السفلي' : 'Bottom navigation bar'}
                    </div>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-ink-muted">
                      {ar
                        ? 'أرقام الصفحات والأزرار السريعة أسفل الشاشة. أخفِه لتبقى الصفحة نظيفة؛ تبقى لوحة الصفحات في قائمة الأدوات.'
                        : 'Page numbers and quick actions at the bottom. Hide it for a bare page; the pages panel stays in the tools menu.'}
                    </p>
                  </div>
                  <span
                    aria-hidden="true"
                    className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                      mobileNavVisible
                        ? 'border-accent/50 bg-accent'
                        : 'border-line-strong bg-hover-strong'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
                        mobileNavVisible ? 'start-6' : 'start-0.5'
                      }`}
                    />
                  </span>
                </button>
              )}

              <div className="p-3 rounded-2xl bg-hover-subtle border border-line-subtle flex items-start gap-2.5 text-xs text-ink-muted">
                <Sparkles className="w-4 h-4 text-highlight shrink-0 mt-0.5" />
                <p className="leading-relaxed text-[11px] text-ink-muted">
                  {ar
                    ? 'تم تصميم قارئ Otium ليكون هادئاً بدون تشتيت، ويُطبَّق نوع الخط المختار فوراً على كافة واجهات القراءة.'
                    : 'Otium is designed to stay quiet and distraction-free. Your selected font is applied instantly across the app.'}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-line-subtle bg-hover-subtle p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-ink">
                    <HardDrive className="h-4 w-4 text-accent" />
                    {ar ? 'مساحة الكتب المحفوظة' : 'Stored books'}
                  </span>
                  <span className="font-mono text-[11px] text-ink-muted">
                    {storage
                      ? `${storage.documents} / ${storage.maxDocuments}`
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-ink-muted font-mono">
                  <span dir="ltr" className="inline-block">
                    {storage ? formatBytes(storage.bytes) : '—'} / {formatBytes(1024 * 1024 * 1024)}
                  </span>
                  {storage && storage.restoredOnly > 0 && (
                    <span className="font-sans text-ink-faint">
                      {ar
                        ? `${storage.restoredOnly} بانتظار إعادة الاستيراد`
                        : `${storage.restoredOnly} awaiting re-import`}
                    </span>
                  )}
                </div>
                <p className="text-[10px] leading-relaxed text-ink-muted">
                  {ar
                    ? 'يبقي Otium أحدث ١٢ كتاباً ضمن مساحة ١ جيجابايت. الكتب الأقدم تحتفظ بملاحظاتها وتقدّم القراءة، ويمكن إعادة استيراد ملفاتها لاحقاً.'
                    : 'Otium keeps the 12 most recent books within 1 GB. Older books keep their notes and progress, and their PDFs can be re-imported later.'}
                </p>
              </div>

              <div className="rounded-2xl border border-line-subtle bg-surface p-3.5 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent">
                    <Download className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-ink">
                      {ar ? 'نسخة احتياطية من البيانات' : 'Back up your data'}
                    </div>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-ink-muted">
                      {ar
                        ? 'ملف JSON صغير يحتوي على تقدّم القراءة والاقتباسات والملاحظات والإشارات والإعدادات. لا يتضمن ملفات PDF.'
                        : 'A small JSON file with reading progress, highlights, notes, bookmarks and settings. PDF files are not included.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleExport()}
                  disabled={!onExportBackup || dataBusy !== null}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-strong disabled:opacity-60"
                >
                  {dataBusy === 'export' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  <span>{ar ? 'تصدير نسخة احتياطية' : 'Export backup'}</span>
                </button>
              </div>

              <div className="rounded-2xl border border-line-subtle bg-surface p-3.5 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-line bg-hover-subtle text-ink-muted">
                    <Upload className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-ink">
                      {ar ? 'استعادة نسخة احتياطية' : 'Restore a backup'}
                    </div>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-ink-muted">
                      {ar
                        ? 'ادمج البيانات المستعادة مع بياناتك الحالية. الاقتباسات والإشارات المتطابقة تُحدَّث دون تكرار.'
                        : 'Merge restored data with what is already here. Matching highlights and bookmarks are updated, never duplicated.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                  disabled={!onImportBackup || dataBusy !== null}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-hover-subtle px-3 py-2 text-xs font-semibold text-ink transition-colors hover:bg-hover disabled:opacity-60"
                >
                  {dataBusy === 'import' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  <span>{ar ? 'اختيار ملف الاستعادة' : 'Choose backup file'}</span>
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) void handleImport(file);
                  }}
                />
              </div>

              {dataNotice && (
                <div
                  role="status"
                  className={`flex items-start gap-2 rounded-2xl border p-3 text-[11px] leading-relaxed ${
                    dataNotice.tone === 'success'
                      ? 'border-emerald-500/25 bg-emerald-500/10 text-success-ink'
                      : 'border-rose-500/25 bg-rose-500/10 text-danger-ink'
                  }`}
                >
                  {dataNotice.tone === 'success' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <span>{dataNotice.text}</span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'about' && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-hover-subtle border border-line-subtle p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-ink">Otium</div>
                  <div className="text-[11px] text-ink-muted font-mono mt-0.5">
                    v{getCurrentVersion()} · {getPlatformLabel()}
                  </div>
                </div>
                <div className="text-[10px] px-2 py-1 rounded-full bg-accent/15 border border-accent/25 text-highlight">
                  {ar ? 'أحدث إصدار' : 'Latest version'}
                </div>
              </div>

              {updateAdapter ? (
                <button
                  type="button"
                  onClick={() => void updates.check()}
                  disabled={updates.isChecking || updates.isInstalling}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl bg-hover-subtle border border-line hover:bg-hover text-xs font-medium text-ink disabled:opacity-60 transition-colors"
                >
                  {updates.isChecking ? (
                    <Loader2 className="w-4 h-4 animate-spin text-highlight" />
                  ) : (
                    <RefreshCw className="w-4 h-4 text-highlight" />
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
                <div className="text-[11px] text-ink-muted leading-relaxed px-1">
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

              <p className="text-[10px] text-ink-faint leading-relaxed px-1">
                {ar
                  ? 'يشارك Windows وAndroid نفس الإصدار ونفس ملاحظات الإصدار. يختلف شكل الواجهة فقط.'
                  : 'Windows and Android share the same version and release notes. Only the interface shell differs.'}
              </p>
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-line flex items-center justify-between shrink-0 mt-2">
          <button
            onClick={onResetDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-hover text-ink-muted hover:text-ink transition-colors text-xs cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.resetDefaults}</span>
          </button>

          <button
            onClick={onClose}
            className="btn-primary px-5 py-2 text-xs"
          >
            {ar ? 'تم وحفظ' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
};
