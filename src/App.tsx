import React, { useEffect, useState } from 'react';
import { getFormFactor, isTauriRuntime } from './platform/runtime';
import type { FormFactor } from './platform/runtime';
import { DesktopShell } from './shells/DesktopShell';
import { MobileShell } from './shells/MobileShell';

/**
 * Selects the platform shell. Everything below this line is shared: document
 * loading, search, annotations, bookmarks, preferences and update logic.
 */
const App: React.FC = () => {
  const [formFactor, setFormFactor] = useState<FormFactor>(getFormFactor);

  useEffect(() => {
    // Native builds keep the form factor chosen by the platform runtime.
    if (isTauriRuntime()) return;

    const handleResize = () => setFormFactor(getFormFactor());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return formFactor === 'mobile' ? <MobileShell /> : <DesktopShell />;
};

export default App;
