import React, { Suspense } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import type { ThemeMode } from '../core/types';
import type { Language } from '../core/i18n/translations';

const ScannerModal = React.lazy(() =>
  import('../scanner/ScannerModal').then((m) => ({ default: m.ScannerModal }))
);

function makeScannerErrorFallback(lang: 'ar' | 'en', onClose: () => void) {
  return (_err: Error, reset: () => void) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 select-none backdrop-blur-sm">
      <div className="chrome-surface flex max-w-sm flex-col items-center gap-3 rounded-2xl p-6 text-center text-ink shadow-2xl border border-line">
        <div className="w-12 h-12 rounded-xl bg-danger-ink/10 flex items-center justify-center text-danger-ink">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="font-bold text-sm">
          {lang === 'ar' ? 'تعذر تشغيل الماسح الضوئي' : 'Scanner Error'}
        </h3>
        <p className="text-xs text-ink-muted leading-relaxed">
          {lang === 'ar'
            ? 'حدث خطأ غير متوقع أثناء تشغيل الماسح. يمكنك إعادة المحاولة أو العودة للقارئ.'
            : 'An unexpected scanner error occurred. You can retry or return to the reader.'}
        </p>
        <div className="flex items-center gap-2 mt-2 w-full">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-3 py-2 rounded-xl bg-hover border border-line text-xs font-medium text-ink cursor-pointer hover:bg-hover-strong transition-colors"
          >
            {lang === 'ar' ? 'العودة للقارئ' : 'Back to Reader'}
          </button>
          <button
            type="button"
            onClick={reset}
            className="flex-1 px-3 py-2 rounded-xl bg-accent text-on-accent text-xs font-medium cursor-pointer hover:bg-accent-strong transition-colors"
          >
            {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ScannerOverlay({ theme, lang, onClose, onPdfGenerated }: {
  theme: ThemeMode;
  lang: Language;
  onClose: () => void;
  onPdfGenerated: (file: File) => void | boolean | Promise<boolean | void>;
}) {
  return <ErrorBoundary fallback={makeScannerErrorFallback(lang, onClose)}>
    <Suspense fallback={<div role="status" className="fixed inset-0 z-50 grid place-items-center bg-black text-white">
      {lang === 'ar' ? 'جارٍ فتح الماسح…' : 'Opening scanner…'}
    </div>}>
      <ScannerModal isOpen theme={theme} lang={lang} onClose={onClose} onPdfGenerated={onPdfGenerated} />
    </Suspense>
  </ErrorBoundary>;
}
