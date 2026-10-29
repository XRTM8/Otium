import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { triggerHaptic } from './haptics';

describe('triggerHaptic', () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  it('silently ignores calls when navigator.vibrate is undefined', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });

    expect(() => triggerHaptic('light')).not.toThrow();
  });

  it('triggers vibrate with appropriate pattern for selection style', () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(globalThis, 'navigator', {
      value: { vibrate: vibrateMock },
      configurable: true,
      writable: true,
    });

    triggerHaptic('selection');
    expect(vibrateMock).toHaveBeenCalledWith(8);
  });

  it('triggers vibrate with appropriate pattern for boundary style', () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(globalThis, 'navigator', {
      value: { vibrate: vibrateMock },
      configurable: true,
      writable: true,
    });

    triggerHaptic('boundary');
    expect(vibrateMock).toHaveBeenCalledWith([15, 45, 18]);
  });

  it('catches and ignores vibrate errors gracefully', () => {
    const vibrateMock = vi.fn(() => {
      throw new Error('Not allowed');
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: { vibrate: vibrateMock },
      configurable: true,
      writable: true,
    });

    expect(() => triggerHaptic('heavy')).not.toThrow();
  });
});
