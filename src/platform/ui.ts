import { getPlatformId, isTauriRuntime } from './runtime';

interface NativeUiBridge {
  setImmersive?: (enabled: boolean) => void;
}

/**
 * Extends the tap-to-hide reading mode into the native Android system bars.
 * Browser previews and Windows only hide the in-app chrome.
 */
export function syncNativeImmersive(enabled: boolean): void {
  if (!isTauriRuntime() || getPlatformId() !== 'android') return;

  try {
    const bridge = (window as Window & { OtiumUi?: NativeUiBridge }).OtiumUi;
    bridge?.setImmersive?.(enabled);
  } catch {
    // The web UI already reflects the immersive state; native bars are bonus.
  }
}
