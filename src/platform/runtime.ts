import { openUrl } from '@tauri-apps/plugin-opener';

export type PlatformId = 'windows' | 'android' | 'web';
export type FormFactor = 'desktop' | 'mobile';

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function getPlatformId(): PlatformId {
  if (!isTauriRuntime()) return 'web';
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

  // Browser previews follow their viewport; native Windows never becomes mobile.
  if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
    return 'mobile';
  }
  return 'desktop';
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
