import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestStoragePersistence } from './persistence';

describe('requestStoragePersistence', () => {
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

  it('returns false if navigator.storage is undefined', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });

    const result = await requestStoragePersistence();
    expect(result).toBe(false);
  });

  it('returns true immediately if already persisted', async () => {
    const persistedMock = vi.fn().mockResolvedValue(true);
    const persistMock = vi.fn().mockResolvedValue(true);

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        storage: {
          persisted: persistedMock,
          persist: persistMock,
        },
      },
      configurable: true,
      writable: true,
    });

    const result = await requestStoragePersistence();
    expect(result).toBe(true);
    expect(persistedMock).toHaveBeenCalledTimes(1);
    expect(persistMock).not.toHaveBeenCalled();
  });

  it('requests persist() when not already persisted and returns true if granted', async () => {
    const persistedMock = vi.fn().mockResolvedValue(false);
    const persistMock = vi.fn().mockResolvedValue(true);

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        storage: {
          persisted: persistedMock,
          persist: persistMock,
        },
      },
      configurable: true,
      writable: true,
    });

    const result = await requestStoragePersistence();
    expect(result).toBe(true);
    expect(persistedMock).toHaveBeenCalledTimes(1);
    expect(persistMock).toHaveBeenCalledTimes(1);
  });

  it('returns false gracefully when persist() throws or is rejected', async () => {
    const persistedMock = vi.fn().mockRejectedValue(new Error('Permission denied'));

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        storage: {
          persisted: persistedMock,
        },
      },
      configurable: true,
      writable: true,
    });

    const result = await requestStoragePersistence();
    expect(result).toBe(false);
  });
});
