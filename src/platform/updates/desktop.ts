import { invoke } from '@tauri-apps/api/core';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { openUrl } from '@tauri-apps/plugin-opener';
import { relaunch } from '@tauri-apps/plugin-process';
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
import { getPlatformId } from '../runtime';

let pendingUpdate: Update | null = null;
let installedBuild: boolean | null = null;

async function isInstalledBuild(): Promise<boolean> {
  if (installedBuild !== null) return installedBuild;
  try {
    installedBuild = await invoke<boolean>('is_installed_build');
  } catch {
    // Older builds have no detection command. Treat them as portable so the
    // user gets a download link instead of a failed silent update.
    installedBuild = false;
  }
  return installedBuild;
}

function releaseInfoFromUpdate(update: Update): ReleaseInfo | null {
  try {
    return parseReleaseInfo(update.rawJson);
  } catch {
    return null;
  }
}

function toAvailableSnapshot(
  update: Update,
  current: string,
  canAutoInstall: boolean
): UpdateSnapshot {
  const feed = releaseInfoFromUpdate(update);
  const portableUrl = feed?.assets.windowsPortable?.url ?? feed?.assets.windowsInstaller?.url;

  return {
    phase: 'available',
    currentVersion: current,
    latestVersion: update.version,
    notes: update.body || feed?.notes || '',
    publishedAt: update.date || feed?.pubDate || '',
    canAutoInstall,
    manualDownloadUrl: portableUrl ?? OTIUM_RELEASES_URL,
    message: canAutoInstall
      ? 'Download and install the new version.'
      : 'Portable edition: download the new EXE, then replace the old file.'
  };
}

/**
 * Windows updater. Installed builds use the signed NSIS updater; portable
 * builds only receive a verified download link and never self-replace.
 */
export const desktopUpdateAdapter: UpdateAdapter = {
  async check(signal) {
    const current = getCurrentVersion();
    const installed = await isInstalledBuild();
    const update = await check({ timeout: 20_000 });
    if (signal?.aborted) {
      await update?.close().catch(() => {});
      throw new Error('Update check cancelled.');
    }

    if (!update) {
      return {
        phase: 'up-to-date',
        currentVersion: current,
        latestVersion: current,
        canAutoInstall: installed
      };
    }

    if (pendingUpdate && pendingUpdate !== update) {
      await pendingUpdate.close().catch(() => {});
    }
    pendingUpdate = update;

    if (!isNewerVersion(update.version, current)) {
      await update.close().catch(() => {});
      pendingUpdate = null;
      return {
        phase: 'up-to-date',
        currentVersion: current,
        latestVersion: update.version,
        canAutoInstall: installed
      };
    }

    return toAvailableSnapshot(update, current, installed);
  },

  async install(snapshot, onProgress, signal) {
    if (!snapshot.canAutoInstall) {
      throw new Error('The portable edition must be updated manually.');
    }

    const update = pendingUpdate;
    if (!update) {
      throw new Error('No downloaded update is pending. Check again.');
    }

    let downloaded = 0;
    let total: number | undefined;

    const report = (progress: UpdateProgress) => {
      if (!signal?.aborted) onProgress(progress);
    };

    await update.downloadAndInstall(
      (event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength;
          report({ downloaded, total, percent: 0 });
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          report({
            downloaded,
            total,
            percent: total ? Math.min(100, Math.round((downloaded / total) * 100)) : undefined
          });
        } else if (event.event === 'Finished') {
          report({
            downloaded: total ?? downloaded,
            total,
            percent: 100
          });
        }
      },
      { timeout: 120_000, restartAfterInstall: true }
    );

    pendingUpdate = null;

    // On Windows the installer is launched and this process is closed. Other
    // desktop targets need an explicit relaunch after installation.
    if (getPlatformId() !== 'windows') {
      await relaunch();
    }

    return {
      ...snapshot,
      phase: 'ready',
      progress: { downloaded: total ?? downloaded, total, percent: 100 },
      message: 'Installer launched.'
    };
  },

  async openManualDownload(snapshot) {
    const url = snapshot.manualDownloadUrl ?? OTIUM_RELEASES_URL;
    await openUrl(url);
  }
};
