import { describe, expect, it, vi } from 'vitest';
import { announceToScreenReader, trapModalFocus } from './a11y';

describe('accessibility (a11y) utilities', () => {
  it('safely runs announceToScreenReader in headless mode without crashing', () => {
    expect(() => announceToScreenReader('صفحة 1')).not.toThrow();
  });

  it('safely runs trapModalFocus when event is not Tab', () => {
    const fakeContainer = {} as HTMLElement;
    const fakeEvent = { key: 'Escape' } as KeyboardEvent;
    expect(() => trapModalFocus(fakeContainer, fakeEvent)).not.toThrow();
  });

  it('cycles focus to first element when at last element and pressing Tab', () => {
    const firstBtn = { focus: vi.fn() } as unknown as HTMLElement;
    const lastBtn = { focus: vi.fn() } as unknown as HTMLElement;

    const fakeContainer = {
      querySelectorAll: vi.fn().mockReturnValue([firstBtn, lastBtn]),
    } as unknown as HTMLElement;

    const fakeEvent = {
      key: 'Tab',
      shiftKey: false,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;

    // Simulate activeElement being the last button
    vi.stubGlobal('document', {
      activeElement: lastBtn,
    });

    trapModalFocus(fakeContainer, fakeEvent);

    expect(fakeEvent.preventDefault).toHaveBeenCalled();
    expect(firstBtn.focus).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('cycles focus to last element when at first element and pressing Shift+Tab', () => {
    const firstBtn = { focus: vi.fn() } as unknown as HTMLElement;
    const lastBtn = { focus: vi.fn() } as unknown as HTMLElement;

    const fakeContainer = {
      querySelectorAll: vi.fn().mockReturnValue([firstBtn, lastBtn]),
    } as unknown as HTMLElement;

    const fakeEvent = {
      key: 'Tab',
      shiftKey: true,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;

    vi.stubGlobal('document', {
      activeElement: firstBtn,
    });

    trapModalFocus(fakeContainer, fakeEvent);

    expect(fakeEvent.preventDefault).toHaveBeenCalled();
    expect(lastBtn.focus).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
