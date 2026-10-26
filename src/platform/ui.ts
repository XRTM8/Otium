import { getPlatformId, isTauriRuntime } from './runtime';

interface NativeUiBridge {
  setImmersive?: (enabled: boolean) => void;
  openOtiumScan?: () => boolean;
  isOtiumScanInstalled?: () => boolean;
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

/**
 * Directly launches the companion Otium Scan application (com.otium.scan) on Android.
 */
export function launchOtiumScan(): boolean {
  if (typeof window === 'undefined') return false;

  if (isTauriRuntime() && getPlatformId() === 'android') {
    try {
      const bridge = (window as Window & { OtiumUi?: NativeUiBridge }).OtiumUi;
      return bridge?.openOtiumScan?.() ?? false;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Checks if the companion Otium Scan application is installed on the device.
 */
export function isOtiumScanAvailable(): boolean {
  if (typeof window === 'undefined') return false;

  if (isTauriRuntime() && getPlatformId() === 'android') {
    try {
      const bridge = (window as Window & { OtiumUi?: NativeUiBridge }).OtiumUi;
      return bridge?.isOtiumScanInstalled?.() ?? false;
    } catch {
      return false;
    }
  }

  return false;
}
