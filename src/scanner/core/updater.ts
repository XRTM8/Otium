/**
 * On-Demand GitHub Releases Update Checker for the Otium scanner.
 * 100% Private & Polite: Never polls the network in the background.
 * Only executes when explicitly requested by the user.
 */

import { nativeFetchUrl } from './nativeBridge';
import { getCurrentVersion } from '../../core/updates/currentVersion';
import { isNewerVersion as isNewerReleaseVersion } from '../../core/updates/releaseFeed';

export const APP_CURRENT_VERSION = '2.0.10';

export interface ReleaseAsset {
  name: string;
  size: number;
  downloadUrl: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes?: string;
  publishedAt?: string;
  matchedAsset?: ReleaseAsset;
  allAssets: ReleaseAsset[];
}

/**
 * Compares candidate tag against current Lab/SemVer version.
 */
function isNewerVersion(vCandidate: string, vCurrent: string): boolean {
  return isNewerReleaseVersion(vCandidate, vCurrent);
}

/**
 * Detects the likely Android CPU architecture of the device.
 * Defaults to 'arm64-v8a' which powers over 95% of modern Android devices.
 */
export function detectDeviceArchitecture(): 'arm64-v8a' | 'armeabi-v7a' | 'x86_64' {
  if (typeof navigator === 'undefined') return 'arm64-v8a';
  const ua = (navigator.userAgent || '').toLowerCase();

  if (ua.includes('x86_64') || ua.includes('x86-64') || ua.includes('amd64')) {
    return 'x86_64';
  }
  if (ua.includes('armv7') || ua.includes('armeabi')) {
    return 'armeabi-v7a';
  }
  return 'arm64-v8a';
}

/**
 * Checks for updates using a 3-tier failover discovery system scoped to Otium:
 * Tier 1: GitHub Releases API (api.github.com/repos/XRTM8/Otium/releases/latest)
 * Tier 2: GitHub Pages static Lab feed (xrtm8.github.io/Otium/latest.json) -> 0 rate limit
 * Tier 3: Raw Git package.json (raw.githubusercontent.com/XRTM8/Otium/main/package.json) -> 0 rate limit
 *
 * Checks the Otium stable release channel.
 */
export async function checkForAppUpdates(): Promise<UpdateCheckResult> {
  const targetAbi = detectDeviceArchitecture();
  const currentVersion = getCurrentVersion() === '0.0.0' ? APP_CURRENT_VERSION : getCurrentVersion();
  let tag: string | null = null;
  let releaseNotes = '';
  let publishedAt: string | undefined = undefined;
  let releaseUrl = 'https://github.com/XRTM8/Otium/releases';
  let matchedAsset: ReleaseAsset | undefined = undefined;
  let allAssets: ReleaseAsset[] = [];

  // =========================================================================
  // TIER 1: Official Otium GitHub Releases API (Native Android HTTP first, then Web fetch)
  // =========================================================================
  try {
    const GITHUB_API_URL = 'https://api.github.com/repos/XRTM8/Otium/releases/latest';
    interface GitHubReleaseApiAsset {
      name: string;
      size: number;
      browser_download_url: string;
    }
    interface GitHubReleaseApiResponse {
      tag_name?: string;
      name?: string;
      body?: string;
      published_at?: string;
      html_url?: string;
      message?: string;
      assets?: GitHubReleaseApiAsset[];
    }
    let apiData: GitHubReleaseApiResponse | null = null;

    const nativeResponse = await nativeFetchUrl(GITHUB_API_URL);
    if (nativeResponse && !nativeResponse.startsWith('ERROR:')) {
      try {
        const parsed = JSON.parse(nativeResponse) as GitHubReleaseApiResponse | null;
        if (parsed && (parsed.tag_name || parsed.name) && !parsed.message) {
          apiData = parsed;
        }
      } catch (err) {
        console.warn('[ScannerUpdater] Failed to parse native release JSON:', err);
      }
    }

    if (!apiData) {
      const response = await fetch(GITHUB_API_URL, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      }).catch(() => null);

      if (response && response.ok) {
        apiData = (await response.json().catch(() => null)) as GitHubReleaseApiResponse | null;
      }
    }

    if (apiData && (apiData.tag_name || apiData.name)) {
      tag = (apiData.tag_name || apiData.name || '').replace(/^v/i, '').trim();
      releaseNotes = apiData.body || '';
      publishedAt = apiData.published_at;
      releaseUrl = apiData.html_url || releaseUrl;

      if (Array.isArray(apiData.assets)) {
        allAssets = apiData.assets.map((a) => ({
          name: a.name,
          size: a.size,
          downloadUrl: a.browser_download_url,
        }));
      }
    }
  } catch (err) {
    console.warn('Tier 1 GitHub API check failed, proceeding to Tier 2:', err);
  }

  // =========================================================================
  // TIER 2: Otium Pages Feed (100% immune to GitHub API rate limits)
  // =========================================================================
  if (!tag) {
    try {
      const PAGES_FEED_URL = 'https://xrtm8.github.io/Otium/latest.json';
      let feedText: string | null = await nativeFetchUrl(PAGES_FEED_URL);
      if (!feedText || feedText.startsWith('ERROR:')) {
        const webRes = await fetch(PAGES_FEED_URL, { cache: 'no-store' }).catch(() => null);
        if (webRes && webRes.ok) {
          feedText = await webRes.text().catch(() => null);
        }
      }
      if (feedText) {
        const feed = JSON.parse(feedText);
        if (feed && feed.version) {
          tag = String(feed.tag_name || feed.version).replace(/^v/i, '').trim();
          releaseNotes = feed.notes || '';
          publishedAt = feed.pub_date;
          releaseUrl = feed.tag_name
            ? `https://github.com/XRTM8/Otium/releases/tag/${feed.tag_name}`
            : 'https://github.com/XRTM8/Otium/releases/latest';
          if (feed.assets?.androidApk?.url) {
            allAssets = [{
              name: feed.assets.androidApk.url.split('/').pop() || 'Otium-arm64-v8a.apk',
              size: Number(feed.assets.androidApk.size) || 18 * 1024 * 1024,
              downloadUrl: feed.assets.androidApk.url,
            }];
          }
        }
      }
    } catch (err) {
      console.warn('Tier 2 Pages feed check failed, proceeding to Tier 3:', err);
    }
  }

  // =========================================================================
  // TIER 3: Raw Repository package.json (Direct from Git raw, 0 rate limit)
  // =========================================================================
  if (!tag) {
    try {
      const RAW_PKG_URL = 'https://raw.githubusercontent.com/XRTM8/Otium/main/package.json';
      let pkgText: string | null = await nativeFetchUrl(RAW_PKG_URL);
      if (!pkgText || pkgText.startsWith('ERROR:')) {
        const rawRes = await fetch(RAW_PKG_URL).catch(() => null);
        if (rawRes && rawRes.ok) {
          pkgText = await rawRes.text().catch(() => null);
        }
      }

      if (pkgText) {
        const pkg = JSON.parse(pkgText);
        if (pkg && pkg.version) {
          tag = pkg.version.replace(/^v/i, '').trim();
          releaseUrl = 'https://github.com/XRTM8/Otium/releases/latest';
        }
      }
    } catch (err) {
      console.warn('Tier 3 Raw package.json check failed:', err);
    }
  }

  if (!tag) {
    throw new Error('تعذر الاتصال بخوادم التحديثات. يرجى التحقق من اتصالك بالإنترنت.');
  }

  const hasUpdate = isNewerVersion(tag, currentVersion);

  matchedAsset =
    allAssets.find((a) => a.name.includes(targetAbi) && a.name.endsWith('.apk')) ||
    allAssets.find((a) => a.name.endsWith('.apk'));

  return {
    hasUpdate,
    currentVersion,
    latestVersion: tag || currentVersion,
    releaseUrl,
    releaseNotes,
    publishedAt,
    matchedAsset,
    allAssets,
  };
}
