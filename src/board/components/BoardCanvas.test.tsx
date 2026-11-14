// @vitest-environment happy-dom
import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeachingProvider } from '../../components/TeachingContext';
import { useTeaching } from '../../components/teachingContextValue';
import type { BoardSnippet } from '../types';
import { BoardCanvas } from './BoardCanvas';

const boardStorageMocks = vi.hoisted(() => ({
  readBoard: vi.fn(),
  writeBoard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/boardStorage', () => ({
  readBoard: boardStorageMocks.readBoard,
  writeBoard: boardStorageMocks.writeBoard,
}));

let root: Root;
let host: HTMLDivElement;
let teaching: ReturnType<typeof useTeaching>;

function Probe() {
  const value = useTeaching();
  useLayoutEffect(() => {
    teaching = value;
  });
  return null;
}

async function waitUntil(check: () => boolean) {
  for (let i = 0; i < 40; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 4));
    });
    if (check()) return;
  }
  expect(check()).toBe(true);
}

describe('BoardCanvas', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      new Proxy({}, { get: () => vi.fn() }) as CanvasRenderingContext2D
    );
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();

    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    boardStorageMocks.readBoard.mockReset();
    boardStorageMocks.writeBoard.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('restores snapshot, registers board controls, manages pages/backgrounds/snippets, and unregisters on unmount', async () => {
    const snippet: BoardSnippet = {
      id: 'snip-1',
      type: 'text',
      content: 'Important theorem',
      pageNumber: 3,
      x: 120,
      y: 80,
      width: 320,
      height: 180,
      createdAt: 1000,
    };
    boardStorageMocks.readBoard.mockResolvedValueOnce({
      pages: [{ id: 'p-1', strokes: [], redoStack: [], background: 'grid' }],
      currentPage: 0,
      snippets: [snippet],
    });

    const onRestoreSnippets = vi.fn();
    const onRemoveSnippet = vi.fn();
    const onRequestAreaClip = vi.fn();

    await act(async () => {
      root.render(
        <TeachingProvider>
          <Probe />
          <BoardCanvas
            lang="en"
            theme="paper"
            documentId="doc-board-1"
            snippets={[snippet]}
            onRestoreSnippets={onRestoreSnippets}
            onRemoveSnippet={onRemoveSnippet}
            onUpdateSnippetPosition={vi.fn()}
            onRequestAreaClip={onRequestAreaClip}
          />
        </TeachingProvider>
      );
    });

    await waitUntil(() => teaching.board?.ready === true);
    expect(onRestoreSnippets).toHaveBeenCalledWith([snippet]);
    expect(teaching.board?.background).toBe('grid');
    expect(host.textContent).toContain('Important theorem');
    expect(host.textContent).toContain('Page 3 Clip');

    await act(async () => {
      teaching.board?.addPage();
    });
    expect(teaching.board?.pages).toBe(2);

    await act(async () => {
      teaching.updatePrefs({ boardFollowTheme: false });
      teaching.board?.setBackground('dark');
    });
    expect(teaching.board?.background).toBe('dark');
    expect(teaching.board?.isDark).toBe(true);

    await act(async () => {
      teaching.board?.clip();
    });
    expect(onRequestAreaClip).toHaveBeenCalledTimes(1);

    const removeBtn = host.querySelector<HTMLButtonElement>('button[title="Remove Snippet"]');
    if (!removeBtn) throw new Error('Missing remove snippet button');
    await act(async () => removeBtn.click());
    expect(onRemoveSnippet).toHaveBeenCalledWith('snip-1');

    await act(async () => {
      root.render(
        <TeachingProvider>
          <Probe />
        </TeachingProvider>
      );
    });
    expect(teaching.board).toBeNull();
  });

  it('surfaces localized error state when board snapshot loading fails', async () => {
    boardStorageMocks.readBoard.mockRejectedValueOnce(new Error('IDB corrupt'));

    await act(async () => {
      root.render(
        <TeachingProvider>
          <Probe />
          <BoardCanvas
            lang="ar"
            documentId="doc-board-err"
            snippets={[]}
            onRestoreSnippets={vi.fn()}
            onRemoveSnippet={vi.fn()}
            onUpdateSnippetPosition={vi.fn()}
          />
        </TeachingProvider>
      );
    });

    await waitUntil(() => teaching.board?.status === 'error');
    expect(teaching.board?.ready).toBe(false);
    expect(teaching.board?.error).toContain('تعذر تحميل السبورة المحفوظة');
  });
});
