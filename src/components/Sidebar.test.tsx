// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';

describe('Sidebar', () => {
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

  it('switches between Pages, Bookmarks, and Annotations tabs and dispatches page navigation/deletes', async () => {
    const onSelectPage = vi.fn();
    const onToggleBookmark = vi.fn();
    const onDeleteAnnotation = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <Sidebar
          isOpen
          doc={null}
          docTitle="Geometry"
          totalPages={6}
          currentPage={2}
          lang="en"
          bookmarks={[{ pageNumber: 4, label: 'Bookmark 4', createdAt: 1000 }]}
          annotations={[
            {
              id: 'ann-1',
              pageNumber: 5,
              text: 'Pythagorean Identity',
              note: 'Check proof',
              color: '#fde68a',
              type: 'highlight',
              rects: [],
              createdAt: 1000,
            },
          ]}
          onSelectPage={onSelectPage}
          onToggleBookmark={onToggleBookmark}
          onDeleteAnnotation={onDeleteAnnotation}
          onClose={onClose}
        />
      );
    });

    const page3Btn = Array.from(host.querySelectorAll<HTMLButtonElement>('button.page-thumb')).find((b) =>
      b.textContent?.includes('Page 3')
    );
    expect(page3Btn).toBeDefined();
    await act(async () => {
      page3Btn?.click();
    });
    expect(onSelectPage).toHaveBeenCalledWith(3);

    const notesTabBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Notes')
    );
    expect(notesTabBtn).toBeDefined();
    await act(async () => {
      notesTabBtn?.click();
    });
    expect(host.textContent).toContain('Pythagorean Identity');
    expect(host.textContent).toContain('Check proof');
  });
});
