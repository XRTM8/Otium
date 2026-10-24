import { openUrl } from '@tauri-apps/plugin-opener';
import { getCurrentVersion } from '../../core/updates/currentVersion';
import {
  OTIUM_RELEASES_URL,
  isNewerVersion,
  parseReleaseInfo,
  type ReleaseInfo
} from '../../core/updates/releaseFeed';
import type {
  UpdateAdapter,
  UpdateProgress,
  UpdateSnapshot
} from '../../core/updates/types';

interface AndroidUpdateBridge {
  fetchReleaseFeed(requestId: string): void;
  downloadAndInstall(url: string, sha256: string): void;
}

type AndroidWindow = Window & {
  OtiumAndroid?: AndroidUpdateBridge;
  __OTIUM_UPDATE_FEED__?: (requestId: string, json: string | null, error: string | null) => void;
  __OTIUM_UPDATE_PROGRESS__?: (downloaded: number, total: number, percent: number) => void;
  __OTIUM_UPDATE_READY__?: () => void;
  __OTIUM_UPDATE_ERROR__?: (message: string) => void;
};

let feedSequence = 0;

function androidWindow(): AndroidWindow {
  return window as AndroidWindow;
}

function requireBridge(): AndroidUpdateBridge {
  const bridge = androidWindow().OtiumAndroid;
  if (!bridge || typeof bridge.fetchReleaseFeed !== 'function') {
    throw new Error('Android update bridge is not ready. Reopen Otium and try again.');
  }
  return bridge;
}

function fetchFeedWithBridge(bridge: AndroidUpdateBridge, timeoutMs = 20_000): Promise<ReleaseInfo> {
  return new Promise((resolve, reject) => {
    const target = androidWindow();
    const requestId = `feed-${Date.now()}-${++feedSequence}`;
    const previous = target.__OTIUM_UPDATE_FEED__;

    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (previous) target.__OTIUM_UPDATE_FEED__ = previous;
      else delete target.__OTIUM_UPDATE_FEED__;
      action();
    };

    const timer = window.setTimeout(() => {
      finish(() => reject(new Error('The update server did not respond in time.')));
    }, timeoutMs);

    target.__OTIUM_UPDATE_FEED__ = (id, json, error) => {
      if (id !== requestId) return;
      if (error) {
        finish(() => reject(new Error(error)));
        return;
      }
      try {
        if (!json) throw new Error('The update server returned an empty response.');
        const info = parseReleaseInfo(JSON.parse(json));
        finish(() => resolve(info));
      } catch (parseError) {
        finish(() =>
          reject(parseError instanceof Error ? parseError : new Error('Invalid update feed.'))
        );
      }
    };

    try {
      bridge.fetchReleaseFeed(requestId);
    } catch (error) {
      finish(() =>
        reject(error instanceof Error ? error : new Error('Could not reach the update server.'))
      );
    }
  });
}

/**
 * Android updates never install silently. The native bridge downloads the APK,
 * verifies its SHA-256, and hands it to the system Package Installer UI.
 */
export const androidUpdateAdapter: UpdateAdapter = {
  async check() {
    const current = getCurrentVersion();
    const feed = await fetchFeedWithBridge(requireBridge());

    if (!isNewerVersion(feed.version, current)) {
      return {
        phase: 'up-to-date',
        currentVersion: current,
        latestVersion: feed.version,
        canAutoInstall: false
      };
    }

    const apk = feed.assets.androidApk;
    const verifiable = Boolean(apk?.url && apk?.sha256);
    return {
      phase: 'available',
      currentVersion: current,
      latestVersion: feed.version,
      notes: feed.notes,
      publishedAt: feed.pubDate,
      canAutoInstall: verifiable,
      manualDownloadUrl: apk?.url ?? OTIUM_RELEASES_URL,
      downloadSha256: apk?.sha256,
      message: !apk
        ? 'No APK is attached to this release yet.'
        : verifiable
          ? 'Download the APK, then confirm installation in the Android installer.'
          : 'This release has no APK checksum, so Otium will not install it automatically. Use the download link instead.'
    };
  },

  async install(snapshot, onProgress, signal) {
    const bridge = requireBridge();
    const url = snapshot.manualDownloadUrl;
    const sha256 = snapshot.downloadSha256;
    if (!url || !snapshot.canAutoInstall) {
      throw new Error('This release has no installable APK.');
    }
    if (!sha256) {
      throw new Error('This release has no APK checksum, so Otium will not install it.');
    }

    const target = androidWindow();
    const previousProgress = target.__OTIUM_UPDATE_PROGRESS__;
    const previousReady = target.__OTIUM_UPDATE_READY__;
    const previousError = target.__OTIUM_UPDATE_ERROR__;

    return new Promise<UpdateSnapshot>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        window.clearTimeout(timer);
        signal?.removeEventListener('abort', handleAbort);
        if (previousProgress) target.__OTIUM_UPDATE_PROGRESS__ = previousProgress;
        else delete target.__OTIUM_UPDATE_PROGRESS__;
        if (previousReady) target.__OTIUM_UPDATE_READY__ = previousReady;
        else delete target.__OTIUM_UPDATE_READY__;
        if (previousError) target.__OTIUM_UPDATE_ERROR__ = previousError;
        else delete target.__OTIUM_UPDATE_ERROR__;
      };

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      const succeed = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({
          ...snapshot,
          phase: 'ready',
          progress: { downloaded: 0, percent: 100 },
          message: 'APK downloaded. Confirm the installation in the system prompt.'
        });
      };

      const handleAbort = () => fail(new Error('Update cancelled.'));
      signal?.addEventListener('abort', handleAbort, { once: true });

      const timer = window.setTimeout(() => {
        fail(new Error('The APK download did not complete in time.'));
      }, 15 * 60 * 1000);

      target.__OTIUM_UPDATE_PROGRESS__ = (downloaded, total, percent) => {
        if (settled) return;
        const progress: UpdateProgress = {
          downloaded,
          total: total > 0 ? total : undefined,
          percent: Number.isFinite(percent) ? percent : undefined
        };
        onProgress(progress);
      };
      target.__OTIUM_UPDATE_READY__ = succeed;
      target.__OTIUM_UPDATE_ERROR__ = (message) => fail(new Error(message));

      try {
        bridge.downloadAndInstall(url, sha256);
      } catch (error) {
        fail(error instanceof Error ? error : new Error('Could not start the APK download.'));
      }
    });
  },

  async openManualDownload(snapshot) {
    await openUrl(snapshot.manualDownloadUrl ?? OTIUM_RELEASES_URL);
  }
};
