import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { Language } from '../core/i18n/translations';
import { ErrorBoundary } from './ErrorBoundary';

interface PageErrorBoundaryProps {
  pageNum: number;
  width: number;
  height: number;
  lang: Language;
  resetKey: string;
  includeErrorDetail?: boolean;
  children: React.ReactNode;
}

const buildPageErrorFallback = (
  pageNum: number,
  width: number,
  height: number,
  lang: Language,
  includeErrorDetail: boolean
) => {
  return (err: Error, reset: () => void) => (
    <div
      style={{ width: `${width}px`, height: `${height}px` }}
      className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-danger-ink/30 bg-surface/50 rounded-xl select-none"
    >
      <AlertTriangle className="w-8 h-8 text-danger-ink mb-2 opacity-80" />
      <span className="text-xs font-semibold text-ink mb-1">
        {lang === 'ar' ? `تعذر عرض الصفحة ${pageNum}` : `Failed to render page ${pageNum}`}
      </span>
      {includeErrorDetail && (
        <p className="text-[10px] text-ink-muted mb-3 max-w-[220px] truncate">
          {err.message || (lang === 'ar' ? 'خطأ غير متوقع' : 'Unexpected error')}
        </p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-on-accent text-xs font-medium cursor-pointer active:scale-95 transition-transform"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
      </button>
    </div>
  );
};

export const PageErrorBoundary: React.FC<PageErrorBoundaryProps> = ({
  pageNum,
  width,
  height,
  lang,
  resetKey,
  includeErrorDetail = false,
  children,
}) => (
  <ErrorBoundary
    resetKey={resetKey}
    fallback={buildPageErrorFallback(pageNum, width, height, lang, includeErrorDetail)}
  >
    {children}
  </ErrorBoundary>
);
