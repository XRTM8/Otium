// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useReaderBackNavigation } from './useReaderBackNavigation';
import type { PDFDocumentProxy } from 'pdfjs-dist';

describe('useReaderBackNavigation', () => {
  let pushStateSpy: ReturnType<typeof vi.spyOn>;
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    pushStateSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    pushStateSpy.mockRestore();
    delete (window as unknown as { __OTIUM_HANDLE_BACK__?: () => boolean }).__OTIUM_HANDLE_BACK__;
  });

  it('pushes history state only once on mount and does not flood history on state changes', () => {
    const handlePasswordCancel = vi.fn();
    const setIsImmersive = vi.fn();
    const setIsSettingsOpen = vi.fn();
    const setIsSearchOpen = vi.fn();
    const setIsSidebarOpen = vi.fn();
    const setSearchQuery = vi.fn();
    const setActiveSearchPage = vi.fn();
    const closeDocument = vi.fn();

    function TestHarness({ isSearchOpen }: { isSearchOpen: boolean }) {
      useReaderBackNavigation({
        doc: null,
        passwordModalOpen: false,
        isImmersive: false,
        isSettingsOpen: false,
        isSearchOpen,
        isSidebarOpen: false,
        handlePasswordCancel,
        setIsImmersive,
        setIsSettingsOpen,
        setIsSearchOpen,
        setIsSidebarOpen,
        setSearchQuery,
        setActiveSearchPage,
        closeDocument,
      });
      return null;
    }

    act(() => {
      root.render(<TestHarness isSearchOpen={false} />);
    });

    expect(pushStateSpy).toHaveBeenCalledTimes(1);

    // Rerender with changed state multiple times
    act(() => {
      root.render(<TestHarness isSearchOpen={true} />);
    });
    act(() => {
      root.render(<TestHarness isSearchOpen={false} />);
    });
    act(() => {
      root.render(<TestHarness isSearchOpen={true} />);
    });

    // History should NOT be flooded with extra pushState calls
    expect(pushStateSpy).toHaveBeenCalledTimes(1);

    // Calling the registered back handler should execute with the latest state
    act(() => {
      const handled = (window as unknown as { __OTIUM_HANDLE_BACK__: () => boolean }).__OTIUM_HANDLE_BACK__();
      expect(handled).toBe(true);
    });

    expect(setIsSearchOpen).toHaveBeenCalledWith(false);
  });

  it('closes document when no higher priority overlays are open', () => {
    const closeDocument = vi.fn();
    const mockDoc = {} as PDFDocumentProxy;

    function TestHarness() {
      useReaderBackNavigation({
        doc: mockDoc,
        passwordModalOpen: false,
        isImmersive: false,
        isSettingsOpen: false,
        isSearchOpen: false,
        isSidebarOpen: false,
        handlePasswordCancel: vi.fn(),
        setIsImmersive: vi.fn(),
        setIsSettingsOpen: vi.fn(),
        setIsSearchOpen: vi.fn(),
        setIsSidebarOpen: vi.fn(),
        setSearchQuery: vi.fn(),
        setActiveSearchPage: vi.fn(),
        closeDocument,
      });
      return null;
    }

    act(() => {
      root.render(<TestHarness />);
    });

    act(() => {
      const handled = (window as unknown as { __OTIUM_HANDLE_BACK__: () => boolean }).__OTIUM_HANDLE_BACK__();
      expect(handled).toBe(true);
    });

    expect(closeDocument).toHaveBeenCalledTimes(1);
  });
});
