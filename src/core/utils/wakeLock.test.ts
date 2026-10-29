import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  acquireScreenWakeLock,
  releaseScreenWakeLock,
  setWakeLockEnabled,
  isWakeLockEnabled,
  hasActiveWakeLock,
} from './wakeLock';

describe('wakeLock', () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.restoreAllMocks();
    setWakeLockEnabled(true);
  });

  afterEach(async () => {
    await releaseScreenWakeLock();
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  it('returns false when navigator.wakeLock is undefined', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });

    const result = await acquireScreenWakeLock();
    expect(result).toBe(false);
    expect(hasActiveWakeLock()).toBe(false);
  });

  it('acquires and releases wake lock successfully', async () => {
    let released = false;
    const releaseMock = vi.fn().mockImplementation(async () => {
      released = true;
    });
    const requestMock = vi.fn().mockResolvedValue({
      get released() {
        return released;
      },
      release: releaseMock,
      addEventListener: vi.fn(),
    });

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        wakeLock: {
          request: requestMock,
        },
      },
      configurable: true,
      writable: true,
    });

    const acquired = await acquireScreenWakeLock();
    expect(acquired).toBe(true);
    expect(requestMock).toHaveBeenCalledWith('screen');
    expect(hasActiveWakeLock()).toBe(true);

    await releaseScreenWakeLock();
    expect(releaseMock).toHaveBeenCalled();
    expect(hasActiveWakeLock()).toBe(false);
  });

  it('respects setWakeLockEnabled(false)', async () => {
    const requestMock = vi.fn();
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        wakeLock: {
          request: requestMock,
        },
      },
      configurable: true,
      writable: true,
    });

    setWakeLockEnabled(false);
    expect(isWakeLockEnabled()).toBe(false);

    const acquired = await acquireScreenWakeLock();
    expect(acquired).toBe(false);
    expect(requestMock).not.toHaveBeenCalled();
  });
});
