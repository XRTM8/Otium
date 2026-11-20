import React, { Suspense, lazy, useEffect, useState } from 'react';
import { getFormFactor, notifyAppReady } from './platform/runtime';
import type { FormFactor } from './platform/runtime';
import { requestStoragePersistence } from './core/storage/persistence';

const DesktopShell = lazy(() =>
  import('./shells/DesktopShell').then((mod) => ({ default: mod.DesktopShell }))
);
const MobileShell = lazy(() =>
  import('./shells/MobileShell').then((mod) => ({ default: mod.MobileShell }))
);
import { useDisplayNavigation } from './platform/useDisplayNavigation';
import { AutoUpdateBanner } from './components/AutoUpdateBanner';

const ShellLoadingFallback: React.FC = () => (
  <div
    role="status"
    aria-label="Loading Otium"
    style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'inherit',
      zIndex: 9999,
      pointerEvents: 'none',
    }}
  >
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'otiumPulse 1.8s ease-in-out infinite',
      }}
    >
      <svg
        width="72"
        height="72"
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ filter: 'drop-shadow(0 6px 20px rgba(0, 0, 0, 0.35))' }}
      >
        <rect width="512" height="512" rx="112" fill="#0B0906" />
        <rect x="2" y="2" width="508" height="508" rx="110" stroke="#F7D08A" strokeOpacity="0.2" strokeWidth="4" />
        <path d="M256 198C222 176 182 169 147 173V338C182 334 222 341 256 363V198Z" fill="#F7D08A" />
        <path d="M256 198C290 176 330 169 365 173V338C330 334 290 341 256 363V198Z" fill="#F7D08A" />
        <path d="M256 204V357" stroke="#0B0906" strokeWidth="11" strokeLinecap="round" />
        <path d="M178 218C204 217 229 221 245 231M178 250C204 249 229 253 245 263M334 218C308 217 283 221 267 231M334 250C308 249 283 253 267 263" stroke="#0B0906" strokeWidth="8" strokeLinecap="round" opacity="0.38" />
      </svg>
    </div>
  </div>
);

/**
 * Selects the platform shell. Everything below this line is shared: document
 * loading, search, annotations, bookmarks, preferences and update logic.
 */
const App: React.FC = () => {
  useDisplayNavigation();
  const [formFactor] = useState<FormFactor>(getFormFactor);

  useEffect(() => {
    // Request persistent storage on startup so user documents and notes
    // are never evicted by Android/iOS/Chromium under storage pressure
    void requestStoragePersistence();

    // Safety fallback: only dismiss native splash after extended timeout
    // if shell fails to mount/notify (e.g. unexpected script error).
    const readyTimer = setTimeout(() => {
      notifyAppReady();
    }, 3500);
    return () => clearTimeout(readyTimer);

    // Keep the shell stable for the lifetime of this app. In particular,
    // orientation changes must never unmount the reader and discard its state.
  }, []);

  return (
    <>
      <AutoUpdateBanner />
      <Suspense fallback={<ShellLoadingFallback />}>
        {formFactor === 'mobile' ? <MobileShell /> : <DesktopShell />}
      </Suspense>
    </>
  );
};

export default App;
