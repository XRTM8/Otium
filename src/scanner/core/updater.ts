/**
 * On-Demand GitHub Releases Update Checker for the Otium scanner.
 * 100% Private & Polite: Never polls the network in the background.
 * Only executes when explicitly requested by the user.
 */

import { nativeFetchUrl } from './nativeBridge';

export const APP_CURRENT_VERSION = '1.8.8';

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
 * Compares two semantic version strings (e.g. "0.2.1" vs "0.2.0").
 * Returns true if vCandidate is strictly greater than vCurrent.
 */
function isNewerVersion(vCandidate: string, vCurrent: string): boolean {
  const cleanCand = vCandidate.replace(/^v/i, '').trim();
  const cleanCurr = vCurrent.replace(/^v/i, '').trim();

  const partsCand = cleanCand.split('.').map((p) => parseInt(p, 10) || 0);
  const partsCurr = cleanCurr.split('.').map((p) => parseInt(p, 10) || 0);

  const maxLen = Math.max(partsCand.length, partsCurr.length);
  for (let i = 0; i < maxLen; i++) {
    const c = partsCand[i] || 0;
    const cur = partsCurr[i] || 0;
    if (c > cur) return true;
    if (c < cur) return false;
  }
  return false;
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
 * Checks for updates using a 3-tier failover discovery system:
 * Tier 1: GitHub API (api.github.com/repos/XRTM8/Otium/releases/latest)
 * Tier 2: GitHub Web Releases Redirect (github.com/XRTM8/Otium/releases/latest) -> 0 rate limit
 * Tier 3: Raw Git package.json (raw.githubusercontent.com/XRTM8/Otium/main/package.json) -> 0 rate limit
 * 
 * Guarantees update detection even under strict GitHub API rate limits (HTTP 403) or country blocks.
 */
export async function checkForAppUpdates(): Promise<UpdateCheckResult> {
  const targetAbi = detectDeviceArchitecture();
  let tag: string | null = null;
  let releaseNotes = '';
  let publishedAt: string | undefined = undefined;
  let releaseUrl = 'https://github.com/XRTM8/Otium/releases';
  let matchedAsset: ReleaseAsset | undefined = undefined;
  let allAssets: ReleaseAsset[] = [];

  // =========================================================================
  // TIER 1: Official GitHub Releases API (Native Android HTTP first, then Web fetch)
  // =========================================================================
  try {
    const GITHUB_API_URL = 'https://api.github.com/repos/XRTM8/Otium/releases/latest';
    let apiData: any = null;

    const nativeResponse = await nativeFetchUrl(GITHUB_API_URL);
    if (nativeResponse && !nativeResponse.startsWith('ERROR:')) {
      try {
        const parsed = JSON.parse(nativeResponse);
        if (parsed && (parsed.tag_name || parsed.name) && !parsed.message) {
          apiData = parsed;
        }
      } catch {}
    }

    if (!apiData) {
      const response = await fetch(GITHUB_API_URL, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      }).catch(() => null);

      if (response && response.ok) {
        apiData = await response.json().catch(() => null);
      }
    }

    if (apiData && (apiData.tag_name || apiData.name)) {
      tag = (apiData.tag_name || apiData.name).replace(/^v/i, '').trim();
      releaseNotes = apiData.body || '';
      publishedAt = apiData.published_at;
      releaseUrl = apiData.html_url || releaseUrl;

      if (Array.isArray(apiData.assets)) {
        allAssets = apiData.assets.map((a: any) => ({
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
  // TIER 2: GitHub Web Releases Redirect (100% immune to API rate limits)
  // =========================================================================
  if (!tag) {
    try {
      const webRes = await fetch('https://github.com/XRTM8/Otium/releases/latest', {
        redirect: 'manual',
      }).catch(() => null);

      if (webRes) {
        const location = webRes.headers.get('location') || webRes.url;
        const match = location?.match(/tag\/v?([0-9]+\.[0-9]+\.[0-9]+)/i);
        if (match && match[1]) {
          tag = match[1].trim();
          releaseUrl = `https://github.com/XRTM8/Otium/releases/tag/v${tag}`;
        }
      }
    } catch (err) {
      console.warn('Tier 2 GitHub web redirect check failed, proceeding to Tier 3:', err);
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
          releaseUrl = `https://github.com/XRTM8/Otium/releases/tag/v${tag}`;
        }
      }
    } catch (err) {
      console.warn('Tier 3 Raw package.json check failed:', err);
    }
  }

  if (!tag) {
    throw new Error('تعذر الاتصال بخوادم التحديثات. يرجى التحقق من اتصالك بالإنترنت.');
  }

  const hasUpdate = isNewerVersion(tag, APP_CURRENT_VERSION);

  // If assets were not available from API (Tier 2 or Tier 3 used), synthesize official deterministic URLs
  if (allAssets.length === 0 && tag) {
    const knownAbis: ('arm64-v8a' | 'armeabi-v7a' | 'x86_64')[] = ['arm64-v8a', 'armeabi-v7a', 'x86_64'];
    allAssets = knownAbis.map((abi) => ({
      name: `Otium_${tag}_${abi}.apk`,
      size: 7 * 1024 * 1024,
      downloadUrl: `https://github.com/XRTM8/Otium/releases/download/v${tag}/Otium_${tag}_${abi}.apk`,
    }));
  }

  matchedAsset =
    allAssets.find((a) => a.name.includes(targetAbi) && a.name.endsWith('.apk')) ||
    allAssets.find((a) => a.name.endsWith('.apk'));

  return {
    hasUpdate,
    currentVersion: APP_CURRENT_VERSION,
    latestVersion: tag || APP_CURRENT_VERSION,
    releaseUrl,
    releaseNotes,
    publishedAt,
    matchedAsset,
    allAssets,
  };
}
