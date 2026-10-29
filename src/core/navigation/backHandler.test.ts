import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerBackHandler,
  executeBackStep,
  getRegisteredBackHandlerCount,
  clearBackHandlers,
} from './backHandler';

describe('backHandler stack', () => {
  beforeEach(() => {
    clearBackHandlers();
  });

  it('returns false when no handlers are registered', () => {
    expect(executeBackStep()).toBe(false);
  });

  it('executes single handler and returns its result', () => {
    const fn = vi.fn(() => true);
    const unregister = registerBackHandler(fn);

    expect(getRegisteredBackHandlerCount()).toBe(1);
    expect(executeBackStep()).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);

    unregister();
    expect(getRegisteredBackHandlerCount()).toBe(0);
    expect(executeBackStep()).toBe(false);
  });

  it('executes in LIFO order (top-of-stack first)', () => {
    const order: number[] = [];
    const first = vi.fn(() => {
      order.push(1);
      return false;
    });
    const second = vi.fn(() => {
      order.push(2);
      return true;
    });

    registerBackHandler(first);
    registerBackHandler(second);

    expect(executeBackStep()).toBe(true);
    // Second (most recent) was called first and returned true, so first should not be called
    expect(order).toEqual([2]);
    expect(first).not.toHaveBeenCalled();
  });

  it('falls through to earlier handler if top handler returns false', () => {
    const order: number[] = [];
    const first = vi.fn(() => {
      order.push(1);
      return true;
    });
    const second = vi.fn(() => {
      order.push(2);
      return false;
    });

    registerBackHandler(first);
    registerBackHandler(second);

    expect(executeBackStep()).toBe(true);
    expect(order).toEqual([2, 1]);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('handles errors gracefully in handlers without breaking execution', () => {
    const buggy = vi.fn(() => {
      throw new Error('boom');
    });
    const fallback = vi.fn(() => true);

    registerBackHandler(fallback);
    registerBackHandler(buggy);

    expect(executeBackStep()).toBe(true);
    expect(buggy).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});
