import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKey?: any;
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

  public componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  private handleLocalReset = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleReset = () => {
    try {
      localStorage.removeItem('otium_theme');
      localStorage.removeItem('tirs_theme');
      localStorage.removeItem('otium_lang');
      localStorage.removeItem('tirs_lang');
    } catch {}
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(
          this.state.error || new Error('Unknown error'),
          this.handleLocalReset
        );
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen w-full bg-[var(--app-bg)] text-ink flex flex-col items-center justify-center p-6 text-center select-none font-sans">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-6 text-highlight">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <h2 className="text-xl font-bold text-ink mb-2">
            حدث خطأ غير متوقع في العرض
          </h2>
          <p className="text-xs text-ink-muted max-w-md mb-6 leading-relaxed">
            تم رصد الخطأ وتأمينه لمنع إغلاق التطبيق. يمكنك المحاولة مجدداً أو إعادة تحميل الصفحة.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={this.handleLocalReset}
              className="px-5 py-2.5 rounded-xl bg-accent text-on-accent font-medium text-xs flex items-center gap-2 hover:bg-accent-strong transition-colors shadow-lg shadow-accent/10 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة المحاولة (Retry)</span>
            </button>

            <button
              onClick={this.handleReload}
              className="px-4 py-2.5 rounded-xl bg-hover-subtle border border-line hover:bg-hover text-ink-muted font-medium text-xs transition-colors cursor-pointer"
            >
              إعادة التحميل الآن (Reload)
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
