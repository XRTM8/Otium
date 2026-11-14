import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import type { Language } from '../../core/i18n/translations';
import type { UpdateSnapshot } from '../../core/updates/types';

export function UpdateStatus({
  snapshot,
  lang,
  isInstalling,
  onInstall,
  onManualDownload,
  onRetry,
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
            disabled={isInstalling}
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
