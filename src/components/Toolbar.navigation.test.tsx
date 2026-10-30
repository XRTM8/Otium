// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Toolbar } from './Toolbar';
import { getTranslations } from '../core/i18n/translations';

it('places English-book Next on the right when the interface is Arabic', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const next = vi.fn(), previous = vi.fn();
  try {
    await act(async () => root.render(<Toolbar title="English textbook" currentPage={2} totalPages={20}
      zoom={1} theme="paper" viewMode="single" currentLang="ar" readingDirection="ltr" isFullscreen={false}
      onPageChange={vi.fn()} onPrevPage={previous} onNextPage={next} onZoomChange={vi.fn()}
      onThemeChange={vi.fn()} onViewModeChange={vi.fn()} onToggleFullscreen={vi.fn()}
      onToggleSidebar={vi.fn()} onToggleSearch={vi.fn()} onToggleSettings={vi.fn()} onCloseDocument={vi.fn()} />));
    const t = getTranslations('ar');
    const nextButton = host.querySelector<HTMLButtonElement>(`button[aria-label="${t.nextPage}"]`)!;
    expect(nextButton.querySelector('.lucide-chevron-right')).not.toBeNull();
    await act(async () => nextButton.click());
    expect(next).toHaveBeenCalledOnce();
    expect(previous).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
