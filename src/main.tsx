import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { applyFontFamily, getSavedFont } from './core/settings/fonts.ts'

// Paint the chosen typography before the first frame so the interface never
// flashes the fallback stack when switching between documents or shells.
applyFontFamily(getSavedFont())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// Ensure any legacy service workers from previous PWA tests are purged completely
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const reg of registrations) {
      reg.unregister().catch(() => {});
    }
  }).catch(() => {});
}

// Global safety guards to prevent unhandled promise rejections or canvas cancellation
// notices from halting WebView threads or blanking the display.
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const name = reason?.name;
    const message = typeof reason?.message === 'string' ? reason.message : '';
    if (
      name === 'RenderingCancelledException' ||
      name === 'AbortError' ||
      message.includes('RenderingCancelledException') ||
      message.includes('aborted')
    ) {
      event.preventDefault();
      return;
    }
    console.warn('Otium unhandled rejection caught gracefully:', reason);
  });
}


