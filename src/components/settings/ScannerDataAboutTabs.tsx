import React from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Download,
  HardDrive,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { Language } from '../../core/i18n/translations';
import type { StorageSummary } from '../../core/storage/documents';
import type { UpdateSnapshot } from '../../core/updates/types';
import type { RestoreSummary } from '../../core/storage/backupFormat';
import type { SaveTextOutcome } from '../../platform/saveFile';
import { getCurrentVersion } from '../../core/updates/currentVersion';
import { getPlatformLabel } from '../../platform/runtime';
import type { CropMode } from '../../scanner/core/types';
import { UpdateStatus } from './UpdateStatus';

interface UpdateControls {
  snapshot: UpdateSnapshot | null;
  isChecking: boolean;
  isInstalling: boolean;
  check: () => Promise<void>;
  install: () => Promise<void>;
  openManualDownload: () => Promise<void>;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 MB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const ScannerTabPanel: React.FC<{
  ar: boolean;
  cropMode: CropMode;
  onToggleCropMode: (mode: CropMode) => void;
  ocrCached: boolean;
  isDownloadingOcr: boolean;
  ocrProgress: number;
  onDownloadOcr: () => void;
}> = ({
  ar,
  cropMode,
  onToggleCropMode,
  ocrCached,
  isDownloadingOcr,
  ocrProgress,
  onDownloadOcr,
}) => (
  <div className="space-y-3.5 animate-in fade-in-50 duration-150">
    {/* Document Crop Framing */}
    <div className="rounded-2xl bg-hover-subtle border border-line-subtle p-3.5 space-y-2">
      <div className="flex items-center gap-2">
        <Camera className="w-4 h-4 text-accent" />
        <span className="text-xs font-bold text-ink">
          {ar ? 'تحديد وقص المستندات بالكاميرا' : 'Document Edge Cropping'}
        </span>
      </div>
      <p className="text-[11px] text-ink-muted leading-relaxed">
        {ar
          ? 'اختر ما إذا كان الماسح يلتقط الإطار كاملاً يدوياً أو يكتشف حواف الأوراق ويزيل الخلفية تلقائياً.'
          : 'Choose whether the camera captures the full frame or detects paper boundaries automatically.'}
      </p>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          onClick={() => onToggleCropMode('full')}
          className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
            cropMode === 'full'
              ? 'bg-accent/15 border-accent/40 text-highlight'
              : 'bg-white/[0.02] border-line-subtle text-ink-muted hover:text-ink'
          }`}
        >
          {ar ? 'كامل الإطار (يدوي)' : 'Full Frame (Manual)'}
        </button>
        <button
          type="button"
          onClick={() => onToggleCropMode('auto')}
          className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
            cropMode === 'auto'
              ? 'bg-accent/15 border-accent/40 text-highlight'
              : 'bg-white/[0.02] border-line-subtle text-ink-muted hover:text-ink'
          }`}
        >
          {ar ? 'كشف ذكي للحواف' : 'Auto Smart Crop'}
        </button>
      </div>
    </div>

    {/* Offline OCR Engine */}
    <div className="rounded-2xl bg-hover-subtle border border-line-subtle p-3.5 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="text-xs font-bold text-ink">
            {ar ? 'التعرّف الضوئي غير المتصل (OCR)' : 'Offline Text Recognition (OCR)'}
          </span>
        </div>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-mono border ${
            ocrCached
              ? 'border-emerald-500/30 text-success-ink bg-emerald-500/10'
              : 'border-line-subtle text-ink-muted'
          }`}
        >
          {ocrCached ? (ar ? 'جاهز ومدمج محلياً' : 'Ready (Bundled)') : ar ? 'غير مخزّن' : 'Not Cached'}
        </span>
      </div>
      <p className="text-[11px] text-ink-muted leading-relaxed">
        {ar
          ? 'يستخرج النصوص العربية والإنجليزية من المستندات والصور محلياً 100% عبر Tesseract المدمج دون أي اتصال بالسحابة.'
          : 'Extracts Arabic & English text from documents locally via on-device Tesseract engine.'}
      </p>
      {ocrCached ? (
        <div className="pt-1">
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-success-ink text-xs font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              {ar
                ? 'حزمة اللغات (العربية والإنجليزية) مدمجة في التطبيق وجاهزة للعمل أوفلاين فوراً.'
                : 'Arabic & English language packs are pre-bundled and 100% offline ready.'}
            </span>
          </div>
        </div>
      ) : (
        <div className="pt-1">
          <button
            type="button"
            onClick={onDownloadOcr}
            disabled={isDownloadingOcr}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-accent/15 border border-accent/30 text-highlight hover:bg-accent/25 text-xs font-bold disabled:opacity-60 transition-colors cursor-pointer"
          >
            {isDownloadingOcr ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>
                  {ar ? `جارٍ التجهيز (${Math.round(ocrProgress * 100)}%)…` : `Preloading (${Math.round(ocrProgress * 100)}%)…`}
                </span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>{ar ? 'تجهيز حزمة التعرّف الضوئي (عربي + إنجليزي)' : 'Preload OCR Language Pack'}</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  </div>
);

export const DataTabPanel: React.FC<{
  ar: boolean;
  storage: StorageSummary | null;
  dataBusy: 'export' | 'import' | null;
  dataNotice: { tone: 'success' | 'error'; text: string } | null;
  importInputRef: React.RefObject<HTMLInputElement | null>;
  onExportBackup?: () => Promise<SaveTextOutcome>;
  onImportBackup?: (text: string) => Promise<RestoreSummary>;
  onExport: () => void;
  onImportFile: (file: File) => void;
}> = ({
  ar,
  storage,
  dataBusy,
  dataNotice,
  importInputRef,
  onExportBackup,
  onImportBackup,
  onExport,
  onImportFile,
}) => (
  <div className="space-y-3 animate-in fade-in-50 duration-150">
    <div className="rounded-2xl border border-line-subtle bg-hover-subtle p-3.5 space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-ink">
          <HardDrive className="h-4 w-4 text-accent" />
          {ar ? 'مساحة الكتب المحفوظة' : 'Stored books'}
        </span>
        <span className="font-mono text-[11px] text-ink-muted">
          {storage ? `${storage.documents} / ${storage.maxDocuments}` : '—'}
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px] text-ink-muted font-mono">
        <span dir="ltr" className="inline-block">
          {storage ? formatBytes(storage.bytes) : '—'} / {formatBytes(1024 * 1024 * 1024)}
        </span>
        {storage && storage.restoredOnly > 0 && (
          <span className="font-sans text-ink-faint">
            {ar ? `${storage.restoredOnly} بانتظار إعادة الاستيراد` : `${storage.restoredOnly} awaiting re-import`}
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
        onClick={onExport}
        disabled={!onExportBackup || dataBusy !== null}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {dataBusy === 'export' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
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
        {dataBusy === 'import' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
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
          if (file) onImportFile(file);
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
);

export const AboutTabPanel: React.FC<{
  ar: boolean;
  lang: Language;
  hasUpdateAdapter: boolean;
  updates: UpdateControls;
}> = ({ ar, lang, hasUpdateAdapter, updates }) => (
  <div className="space-y-3 animate-in fade-in-50 duration-150">
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

    {hasUpdateAdapter ? (
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
);
