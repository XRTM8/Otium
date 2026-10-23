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
        <div className="min-h-screen w-full bg-[#0a0a0a] text-neutral-200 flex flex-col items-center justify-center p-6 text-center select-none font-sans">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-6 text-amber-400">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <h2 className="text-xl font-bold tracking-tight text-white mb-2">
            حدث خطأ غير متوقع في العرض
          </h2>
          <p className="text-xs text-neutral-400 max-w-md mb-6 leading-relaxed">
            تم رصد الخطأ وتأمينه لمنع إغلاق المتصفح. يمكنك إعادة تحميل الصفحة للمتابعة الفورية.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={this.handleReload}
              className="px-5 py-2.5 rounded-xl bg-amber-500 text-neutral-950 font-medium text-xs flex items-center gap-2 hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/10 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة التحميل الآن (Reload)</span>
            </button>

            <button
              onClick={this.handleReset}
              className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-neutral-300 font-medium text-xs transition-colors cursor-pointer"
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
