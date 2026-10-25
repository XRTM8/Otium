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

