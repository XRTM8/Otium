import { openUrl } from '@tauri-apps/plugin-opener';

export type PlatformId = 'windows' | 'android' | 'web';
export type FormFactor = 'desktop' | 'mobile';

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function getPlatformId(): PlatformId {
  if (!isTauriRuntime()) return 'web';
  // Android boards may request a desktop user agent. The native bridge is a
  // more reliable platform signal than that browser preference.
  if (typeof window !== 'undefined' && 'OtiumUi' in window) return 'android';
  if (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)) {
    return 'android';
  }
  return 'windows';
}

export function isAndroidRuntime(): boolean {
  return getPlatformId() === 'android';
}

export function getFormFactor(): FormFactor {
  const platform = getPlatformId();
  if (platform === 'android') return 'mobile';
  if (platform === 'windows') return 'desktop';

  // Choose the shell from stable device traits, not viewport width. Width
  // crosses the desktop breakpoint when many phones rotate to landscape;
  // swapping shells there unmounts the reader and returns to the library.
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  const mobileHint = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile;
  const touchIpad = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  return mobileHint || /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua) || touchIpad
    ? 'mobile'
    : 'desktop';
}

export function getPlatformLabel(platform: PlatformId = getPlatformId()): string {
  switch (platform) {
    case 'android':
      return 'Android';
    case 'windows':
      return 'Windows';
    default:
      return 'Web';
  }
}

/**
 * Safely opens an external URL across Web, Windows, and Android.
 * In Tauri native desktop/mobile apps, it uses the native system opener;
 * in standard web browsers, it opens a secure new tab.
 */
export async function openExternalLink(url: string): Promise<void> {
  if (isTauriRuntime()) {
    try {
      await openUrl(url);
      return;
    } catch (e) {
      console.warn('Failed to open external URL via Tauri plugin-opener:', e);
    }
  }
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
