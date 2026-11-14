// @vitest-environment happy-dom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReaderController } from './useReaderController';

vi.mock('../core/storage/persistence', () => ({
  requestStoragePersistence: vi.fn(async () => true),
}));

describe('useReaderController', () => {
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('exposes reader state and cleanly mutates theme, language, view mode, search, and beam disconnect', async () => {
    const ref: { current: ReturnType<typeof useReaderController> | null } = { current: null };

    function Harness() {
      const controller = useReaderController({ keyboard: true, dragDrop: true });
      useEffect(() => {
        ref.current = controller;
      });
      return <div />;
    }

    await act(async () => {
      root.render(<Harness />);
    });

    act(() => {
      ref.current!.scrollContainerRef.current = host;
    });

    expect(ref.current).not.toBeNull();

    await act(async () => {
      ref.current!.changeTheme('midnight');
      ref.current!.changeLanguage('en');
      ref.current!.changeViewMode('dual');
      ref.current!.openSearchWithText('theorem');
      ref.current!.handleSearchQueryChange('theorem');
    });

    expect(ref.current!.theme).toBe('midnight');
    expect(ref.current!.lang).toBe('en');
    expect(ref.current!.viewMode).toBe('dual');
    expect(ref.current!.isSearchOpen).toBe(true);
    expect(ref.current!.searchSeed?.query).toBe('theorem');
    expect(ref.current!.searchQuery).toBe('theorem');

    await act(async () => {
      ref.current!.closeSearch();
      ref.current!.disconnectBeam();
    });
    expect(ref.current!.isSearchOpen).toBe(false);
    expect(ref.current!.beamRoom).toBeNull();
  });
});
