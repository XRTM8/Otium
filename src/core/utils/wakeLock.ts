/**
 * Screen Wake Lock Service.
 * Keeps the display awake while an active document is open so the user
 * can read uninterrupted without the screen dimming or turning off.
 */

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: string, listener: () => void) => void;
}

let currentSentinel: WakeLockSentinelLike | null = null;
let isAcquirePending = false;
let isEnabled = true;

export function setWakeLockEnabled(enabled: boolean): void {
  isEnabled = enabled;
  if (!enabled) {
    void releaseScreenWakeLock();
  }
}

export function isWakeLockEnabled(): boolean {
  return isEnabled;
}

export async function acquireScreenWakeLock(): Promise<boolean> {
  if (!isEnabled) return false;
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
    return false;
  }
  if (currentSentinel && !currentSentinel.released) {
    return true;
  }
  if (isAcquirePending) return false;

  isAcquirePending = true;
  try {
    const nav = navigator as unknown as {
      wakeLock: { request: (type: string) => Promise<WakeLockSentinelLike> };
    };
    const sentinel = await nav.wakeLock.request('screen');
    currentSentinel = sentinel;
    sentinel.addEventListener('release', () => {
      if (currentSentinel === sentinel) {
        currentSentinel = null;
      }
    });
    return true;
  } catch {
    return false;
  } finally {
    isAcquirePending = false;
  }
}

export async function releaseScreenWakeLock(): Promise<void> {
  if (currentSentinel && !currentSentinel.released) {
    try {
      await currentSentinel.release();
    } catch {
      // Ignore
    } finally {
      currentSentinel = null;
    }
  }
}

/** Test helper to inspect sentinel state */
export function hasActiveWakeLock(): boolean {
  return currentSentinel !== null && !currentSentinel.released;
}
