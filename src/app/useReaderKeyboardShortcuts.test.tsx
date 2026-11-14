// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReaderKeyboardShortcuts } from './useReaderKeyboardShortcuts';

function keyboardOptions() {
  const scrollBy = vi.fn();
  const scroller = document.createElement('div');
  scroller.scrollBy = scrollBy;
  Object.defineProperty(scroller, 'clientHeight', { value: 500 });
  return {
    scrollBy,
    options: {
      enabled: true, numPages: 30, currentPage: 5,
      theme: 'light', viewMode: 'continuous', docIsRtl: false,
      scrollContainerRef: { current: scroller }, lastFitScaleRef: { current: 0.5 },
      setZoom: vi.fn<(value: number | ((old: number) => number)) => void>(),
      getMinZoom: () => 0.5, getMaxZoom: () => 2, getFitScale: () => 0.75,
      scrollToPage: vi.fn(), goToNextPage: vi.fn(), goToPrevPage: vi.fn(),
      changeTheme: vi.fn(), changeViewMode: vi.fn(), toggleBookmark: vi.fn(),
      handleToggleFullscreen: vi.fn(), setIsSearchOpen: vi.fn(), setIsSidebarOpen: vi.fn(),
    } satisfies Parameters<typeof useReaderKeyboardShortcuts>[0],
  };
}

describe('reader keyboard shortcuts', () => {
  let root: Root;
  let host: HTMLDivElement;
  let options: Parameters<typeof useReaderKeyboardShortcuts>[0];
  let bindings: ReturnType<typeof keyboardOptions>;

  function Harness() {
    return <output>{useReaderKeyboardShortcuts(options)}</output>;
  }

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    bindings = keyboardOptions();
    options = bindings.options;
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function key(keyName: string, init: KeyboardEventInit = {}, target: EventTarget = window) {
    const event = new KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true, ...init });
    act(() => { target.dispatchEvent(event); });
    return event.defaultPrevented;
  }

  it('commits valid page numbers and clears rejected, canceled and expired jumps', () => {
    act(() => root.render(<Harness />));
    expect(key('2')).toBe(true);
    key('0');
    expect(host.textContent).toBe('20');
    key('g');
    expect(options.scrollToPage).toHaveBeenCalledExactlyOnceWith(20);
    expect(host.textContent).toBe('');
    key('9');
    key('9');
    key('Enter');
    key('5');
    key('Escape');
    expect(host.textContent).toBe('');
    key('6');
    act(() => vi.advanceTimersByTime(2400));
    expect(host.textContent).toBe('');
    expect(key('Enter')).toBe(false);
    expect(options.scrollToPage).toHaveBeenCalledTimes(1);
  });

  it('scrolls continuously and reverses horizontal navigation for RTL pages', () => {
    act(() => root.render(<Harness />));
    for (const keyName of ['ArrowDown', 'PageDown', ' ', 'ArrowRight', 'ArrowLeft', 'ArrowUp', 'PageUp']) key(keyName);
    key(' ', { shiftKey: true });
    expect(bindings.scrollBy.mock.calls.map(([scroll]) => scroll.top))
      .toEqual([220, 400, 400, 220, -220, -220, -400, -400]);
    options = { ...options, viewMode: 'dual', docIsRtl: true };
    act(() => root.render(<Harness />));
    for (const keyName of ['ArrowDown', 'PageDown', ' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'PageUp']) key(keyName);
    key(' ', { shiftKey: true });
    expect(options.goToNextPage).toHaveBeenCalledTimes(4);
    expect(options.goToPrevPage).toHaveBeenCalledTimes(4);
  });

  it('clamps zoom, toggles controls, and leaves focused text inputs alone', () => {
    act(() => root.render(<Harness />));
    const input = document.createElement('input');
    host.append(input);
    expect(key('t', {}, input)).toBe(false);
    expect(options.changeTheme).not.toHaveBeenCalled();
    key('+', { ctrlKey: true });
    key('-', { metaKey: true });
    key('=');
    key('_');
    key('0', { ctrlKey: true });
    key('0');
    const zooms = bindings.options.setZoom.mock.calls.map(([value], index) =>
      typeof value === 'number' ? value : value(index % 2 ? 0.51 : 1.99),
    );
    expect(zooms).toEqual([2, 0.5, 2, 0.5, 0.75, 1.15]);
    key('f', { ctrlKey: true });
    key('s');
    key('b');
    key('f');
    key('t');
    key('m');
    expect(options.setIsSearchOpen).toHaveBeenCalledWith(expect.any(Function));
    expect(options.setIsSidebarOpen).toHaveBeenCalledWith(expect.any(Function));
    expect(options.toggleBookmark).toHaveBeenCalledWith(5);
    expect(options.handleToggleFullscreen).toHaveBeenCalledOnce();
    expect(options.changeTheme).toHaveBeenCalledOnce();
    expect(options.changeViewMode).toHaveBeenCalledWith('dual');
    options = { ...options, enabled: false };
    act(() => root.render(<Harness />));
    expect(key('b')).toBe(false);
    expect(options.toggleBookmark).toHaveBeenCalledOnce();
  });
});
