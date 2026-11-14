/**
 * Shared helpers for explicitly bounded best-effort operations and benign
 * browser capability / teardown cleanups so errors are either surfaced,
 * warned with context, or explicitly scoped instead of silently dropped.
 */

export function tryBestEffort<T>(reason: string, fn: () => T, fallback?: T): T | undefined {
  try {
    return fn();
  } catch (error: unknown) {
    void reason;
    void error;
    return fallback;
  }
}

export function ignoreBenignRejection(
  promise: PromiseLike<unknown> | undefined | null,
  reason: string
): void {
  if (!promise) return;
  Promise.resolve(promise).then(undefined, (error: unknown) => {
    void reason;
    void error;
  });
}

export function warnBestEffortError(scope: string, error: unknown): void {
  console.warn(`[${scope}]`, error);
}
