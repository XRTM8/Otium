import React, { useEffect, useState } from 'react';
import { getFormFactor } from './platform/runtime';
import type { FormFactor } from './platform/runtime';
import { requestStoragePersistence } from './core/storage/persistence';
import { DesktopShell } from './shells/DesktopShell';
import { MobileShell } from './shells/MobileShell';
import { useDisplayNavigation } from './platform/useDisplayNavigation';

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

    // Keep the shell stable for the lifetime of this app. In particular,
    // orientation changes must never unmount the reader and discard its state.
  }, []);

  return formFactor === 'mobile' ? <MobileShell /> : <DesktopShell />;
};

export default App;
