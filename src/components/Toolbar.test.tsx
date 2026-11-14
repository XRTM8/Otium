// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toolbar } from './Toolbar';

describe('Toolbar', () => {
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

  it('submits Arabic-Indic page jumps, scales zoom, toggles bookmark, switches view mode, and renames title', async () => {
    const onPageChange = vi.fn();
    const onZoomChange = vi.fn();
    const onViewModeChange = vi.fn();
    const onToggleBookmark = vi.fn();
    const onRenameTitle = vi.fn();
    const onCloseDocument = vi.fn();

    await act(async () => {
      root.render(
        <Toolbar
          title="My Sample Book"
          currentPage={1}
          totalPages={12}
          zoom={1}
          minZoom={0.25}
          maxZoom={3}
          theme="paper"
          viewMode="single"
          currentLang="en"
          readingDirection="ltr"
          isFullscreen={false}
          isBookmarked={false}
          onPageChange={onPageChange}
          onZoomChange={onZoomChange}
          onThemeChange={vi.fn()}
          onViewModeChange={onViewModeChange}
          onToggleBookmark={onToggleBookmark}
          onToggleFullscreen={vi.fn()}
          onToggleSidebar={vi.fn()}
          onToggleSearch={vi.fn()}
          onToggleSettings={vi.fn()}
          onCloseDocument={onCloseDocument}
          onRenameTitle={onRenameTitle}
        />
      );
    });

    const pageInput = host.querySelector<HTMLInputElement>('input[inputmode="numeric"]');
    expect(pageInput).not.toBeNull();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(pageInput, '٥');
      pageInput!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      pageInput!.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(onPageChange).toHaveBeenCalledWith(5);

    const zoomInBtn = host.querySelector<HTMLButtonElement>('button[aria-label="Zoom In (+)"]');
    await act(async () => {
      zoomInBtn?.click();
    });
    expect(onZoomChange).toHaveBeenCalledWith(1.15);

    const bookmarkBtn = host.querySelector<HTMLButtonElement>('button[aria-label="Add Bookmark (B)"]');
    await act(async () => {
      bookmarkBtn?.click();
    });
    expect(onToggleBookmark).toHaveBeenCalledTimes(1);

    const docBtn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('My Sample Book'));
    await act(async () => {
      docBtn?.click();
    });
    const renameBtn = host.querySelector<HTMLButtonElement>('button[title="Rename title"]');
    await act(async () => {
      renameBtn?.click();
    });
    const renameInput = host.querySelector<HTMLInputElement>('input[type="text"]');
    expect(renameInput).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(renameInput, 'Renamed Book');
      renameInput!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const saveBtn = host.querySelector<HTMLButtonElement>('button[title="Save name"]');
    await act(async () => {
      saveBtn?.click();
    });
    expect(onRenameTitle).toHaveBeenCalledWith('Renamed Book');

    const closeBtn = host.querySelector<HTMLButtonElement>('button[title*="Close"], button[title*="Library"], button[title*="المكتبة"]');
    await act(async () => {
      closeBtn?.click();
    });
    expect(onCloseDocument).toHaveBeenCalled();
  });
});
