interface NativeUiBridge {
  setImmersive?: (enabled: boolean) => void;
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
