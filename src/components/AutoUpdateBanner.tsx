import React, { useEffect, useState } from 'react';
import { Download, X, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useUpdateChecker } from '../core/updates/useUpdateChecker';
import { getUpdateAdapter } from '../platform/updates';

export const AutoUpdateBanner: React.FC = () => {
  const [adapter] = useState(getUpdateAdapter);
  const { snapshot, isChecking, isInstalling, check, install, openManualDownload } = useUpdateChecker(adapter);
  const [isDismissed, setIsDismissed] = useState(false);
  const [userInitiatedInstall, setUserInitiatedInstall] = useState(false);

  // Background check 3.5s after mount so app launch is 100% instant and unaffected
  useEffect(() => {
    if (!adapter) return;
    const timer = window.setTimeout(() => {
      void check();
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [adapter, check]);

  if (!snapshot || isDismissed) return null;
  if (snapshot.phase === 'up-to-date' || snapshot.phase === 'unsupported') return null;
  // Silent background failures (e.g. reading offline in a classroom) must never nag the reader.
  if (snapshot.phase === 'error' && !userInitiatedInstall) return null;

  const version = snapshot.phase === 'available' ? (snapshot.latestVersion ?? '') : '';
  const progressPercent = snapshot.progress?.percent ?? 0;
  const message = snapshot.phase === 'ready' || snapshot.phase === 'error' ? snapshot.message : null;

  const handleAction = () => {
    setUserInitiatedInstall(true);
    if (snapshot.canAutoInstall) {
      void install();
    } else {
      void openManualDownload();
    }
  };

  return (
    <aside
      aria-label="إشعار التحديث"
      role="status"
      style={{
        top: 'max(0.75rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))'
      }}
      className="fixed inset-x-4 sm:inset-x-auto sm:right-6 sm:max-w-md z-[100] animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto"
    >
      <div className="chrome-surface flex items-center justify-between gap-3 p-3 px-4 rounded-2xl shadow-2xl border border-accent/40 bg-[color-mix(in_srgb,var(--surface-2)_95%,transparent)] backdrop-blur-md text-ink">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center shrink-0 text-accent">
            {snapshot.phase === 'ready' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : snapshot.phase === 'downloading' ? (
              <RefreshCw className="w-4 h-4 animate-spin text-accent" />
            ) : (
              <Download className="w-4 h-4 text-accent" />
            )}
          </div>

          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold truncate">
              {snapshot.phase === 'ready'
                ? 'التحديث جاهز للتثبيت'
                : snapshot.phase === 'downloading'
                  ? `جارٍ تحميل التحديث (${progressPercent}%)...`
                  : snapshot.phase === 'error'
                    ? 'تعذر إكمال التحديث'
                    : `تحديث متوفر: ${version}`}
            </span>
            {message && <span className="text-[10px] text-ink-muted">{message}</span>}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {snapshot.phase === 'available' && (
            <button
              type="button"
              disabled={isInstalling || isChecking}
              onClick={handleAction}
              className="fluid-press flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent text-on-accent text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{snapshot.canAutoInstall ? 'تثبيت' : 'تنزيل'}</span>
            </button>
          )}

          {snapshot.phase === 'ready' && (
            <button
              type="button"
              onClick={handleAction}
              className="fluid-press flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              <span>فتح المثبت</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            aria-label="إغلاق"
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-hover-subtle transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};
