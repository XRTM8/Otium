export interface ReleaseAsset {
  url: string;
  size?: number;
  sha256?: string;
}

export interface ReleaseAssets {
  windowsInstaller?: ReleaseAsset;
  windowsPortable?: ReleaseAsset;
  androidApk?: ReleaseAsset;
}

export interface ReleaseInfo {
  version: string;
  notes: string;
  pubDate: string;
  assets: ReleaseAssets;
}

export const OTIUM_RELEASES_URL = 'https://github.com/XRTM8/Otium/releases/latest';
export const OTIUM_RELEASE_FEED_URL =
  'https://github.com/XRTM8/Otium/releases/latest/download/latest.json';

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

function parseVersionPart(version: string): { numbers: number[]; prerelease: string } {
  const normalized = normalizeVersion(version);
  const [main, prerelease = ''] = normalized.split('-', 2);
  const numbers = main.split('.').map((part) => {
    const value = Number.parseInt(part, 10);
    return Number.isFinite(value) ? value : 0;
  });
  while (numbers.length < 3) numbers.push(0);
  return { numbers, prerelease };
}

/** Returns a positive number when candidate is newer than current. */
export function compareVersions(candidate: string, current: string): number {
  const left = parseVersionPart(candidate);
  const right = parseVersionPart(current);

  for (let index = 0; index < 3; index += 1) {
    const difference = left.numbers[index] - right.numbers[index];
    if (difference !== 0) return difference;
  }

  if (left.prerelease === right.prerelease) return 0;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;
  return left.prerelease.localeCompare(right.prerelease);
}

export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

function parseAsset(value: unknown): ReleaseAsset | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.url !== 'string') return undefined;

  let url: URL;
  try {
    url = new URL(record.url);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:') return undefined;

  const asset: ReleaseAsset = { url: url.toString() };
  if (typeof record.size === 'number' && Number.isFinite(record.size) && record.size > 0) {
    asset.size = record.size;
  }
  if (typeof record.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(record.sha256)) {
    asset.sha256 = record.sha256.toLowerCase();
  }
  return asset;
}

export function parseReleaseInfo(value: unknown): ReleaseInfo {
  if (!value || typeof value !== 'object') {
    throw new Error('Release feed is not an object');
  }

  const record = value as Record<string, unknown>;
  if (typeof record.version !== 'string' || !record.version.trim()) {
    throw new Error('Release feed has no version');
  }

  const rawAssets =
    record.assets && typeof record.assets === 'object'
      ? (record.assets as Record<string, unknown>)
      : {};

  return {
    version: normalizeVersion(record.version),
    notes: typeof record.notes === 'string' ? record.notes : '',
    pubDate:
      typeof record.pub_date === 'string'
        ? record.pub_date
        : typeof record.pubDate === 'string'
          ? record.pubDate
          : '',
    assets: {
      windowsInstaller: parseAsset(rawAssets.windowsInstaller),
      windowsPortable: parseAsset(rawAssets.windowsPortable),
      androidApk: parseAsset(rawAssets.androidApk)
    }
  };
}

export async function fetchReleaseInfo(
  url: string = OTIUM_RELEASE_FEED_URL,
  signal?: AbortSignal
): Promise<ReleaseInfo> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Release feed returned ${response.status}`);
    }
    return parseReleaseInfo(await response.json());
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
