// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileToolbar } from './MobileToolbar';

describe('MobileToolbar', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it('opens overflow menu to switch view mode and closes on Escape/Back event while hiding in immersive mode', async () => {
    const onViewModeChange = vi.fn();
    const onToggleBookmark = vi.fn();
    const onOpenSettings = vi.fn();

    await act(async () => {
      root.render(
        <MobileToolbar
          title="Physics 101"
          currentPage={2}
          totalPages={10}
          theme="paper"
          viewMode="single"
          currentLang="en"
          isBookmarked={false}
          immersive={false}
          onPageChange={vi.fn()}
          onThemeChange={vi.fn()}
          onViewModeChange={onViewModeChange}
          onToggleBookmark={onToggleBookmark}
          onToggleSearch={vi.fn()}
          onOpenSidebar={vi.fn()}
          onOpenSettings={onOpenSettings}
          onCloseDocument={vi.fn()}
        />
      );
    });

    const topShell = host.querySelector<HTMLDivElement>('[data-position="top"]');
    expect(topShell?.getAttribute('data-immersive')).toBe('false');

    const titleBtn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Physics 101'));
    await act(async () => {
      titleBtn?.click();
    });

    const singleBtn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Single'));
    expect(singleBtn).toBeDefined();
    await act(async () => {
      singleBtn?.click();
    });
    expect(onViewModeChange).toHaveBeenCalledWith('continuous');

    const markBtn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Mark'));
    await act(async () => {
      markBtn?.click();
    });
    expect(onToggleBookmark).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(
        <MobileToolbar
          title="Physics 101"
          currentPage={2}
          totalPages={10}
          theme="paper"
          viewMode="continuous"
          currentLang="en"
          isBookmarked={true}
          immersive={true}
          onPageChange={vi.fn()}
          onThemeChange={vi.fn()}
          onViewModeChange={onViewModeChange}
          onToggleBookmark={onToggleBookmark}
          onToggleSearch={vi.fn()}
          onOpenSidebar={vi.fn()}
          onOpenSettings={onOpenSettings}
          onCloseDocument={vi.fn()}
        />
      );
    });

    expect(host.querySelector('[data-position="top"]')?.getAttribute('data-immersive')).toBe('true');
  });
});
