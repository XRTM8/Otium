interface NativeUiBridge {
  setImmersive?: (enabled: boolean) => void;
  openOtiumScan?: () => boolean;
  isOtiumScanInstalled?: () => boolean;
}

/**
 * Controls native Android system bars independently of the reader chrome.
 * Mobile keeps these hidden while its in-app toolbars can be shown or hidden.
 */
export function syncNativeImmersive(enabled: boolean): void {
  if (typeof window === 'undefined') return;

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

  try {
    const bridge = (window as Window & { OtiumUi?: NativeUiBridge }).OtiumUi;
    return bridge?.openOtiumScan?.() ?? false;
  } catch {
    return false;
  }
}

/**
 * Checks if the companion Otium Scan application is installed on the device.
 */
export function isOtiumScanAvailable(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const bridge = (window as Window & { OtiumUi?: NativeUiBridge }).OtiumUi;
    return bridge?.isOtiumScanInstalled?.() ?? false;
  } catch {
    return false;
  }
}
