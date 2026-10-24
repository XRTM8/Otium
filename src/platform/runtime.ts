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
