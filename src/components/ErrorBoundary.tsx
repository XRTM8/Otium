import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    try {
      localStorage.removeItem('otium_theme');
      localStorage.removeItem('tirs_theme');
      localStorage.removeItem('otium_lang');
      localStorage.removeItem('tirs_lang');
    } catch {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-[var(--app-bg)] text-ink flex flex-col items-center justify-center p-6 text-center select-none font-sans">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-6 text-highlight">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <h2 className="text-xl font-bold tracking-tight text-ink mb-2">
            حدث خطأ غير متوقع في العرض
          </h2>
          <p className="text-xs text-ink-muted max-w-md mb-6 leading-relaxed">
            تم رصد الخطأ وتأمينه لمنع إغلاق المتصفح. يمكنك إعادة تحميل الصفحة للمتابعة الفورية.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={this.handleReload}
              className="px-5 py-2.5 rounded-xl bg-accent text-on-accent font-medium text-xs flex items-center gap-2 hover:bg-accent-strong transition-colors shadow-lg shadow-accent/10 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة التحميل الآن (Reload)</span>
            </button>

            <button
              onClick={this.handleReset}
              className="px-4 py-2.5 rounded-xl bg-hover-subtle border border-line hover:bg-hover text-ink-muted font-medium text-xs transition-colors cursor-pointer"
            >
              إعادة ضبط الذاكرة المؤقتة
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
