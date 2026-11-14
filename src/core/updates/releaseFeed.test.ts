// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { compareVersions, isNewerVersion, parseReleaseInfo } from './releaseFeed';
import * as runtime from '../../platform/runtime';
import { getUpdateAdapter } from '../../platform/updates';

describe('releaseFeed & platform update isolation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('compares lab tags cleanly beyond 1.9.16 without hardcoded minor numbers', () => {
    expect(compareVersions('1.9.17-lab.14', '1.9.17-lab.13')).toBeGreaterThan(0);
    expect(compareVersions('lab-14', '1.9.17-lab.13')).toBeGreaterThan(0);
    expect(compareVersions('lab-13', '1.9.17-lab.13')).toBe(0);
    expect(compareVersions('1.9.17-lab.12', '1.9.17-lab.13')).toBeLessThan(0);
    expect(isNewerVersion('1.9.18-lab.14', '1.9.17-lab.13')).toBe(true);
  });

  it('parses release assets with HTTPS and sha256 guards', () => {
    const info = parseReleaseInfo({
      version: '1.9.17-lab.14',
      notes: 'Release notes',
      pub_date: '2026-11-11T00:00:00Z',
      assets: {
        androidApk: {
          url: 'https://github.com/XRTM8/Otium/releases/download/lab-14/Otium-14-arm64-v8a.apk',
          sha256: 'a'.repeat(64),
          size: 123456
        }
      }
    });
    expect(info.version).toBe('1.9.17-lab.14');
    expect(info.assets.androidApk?.sha256).toBe('a'.repeat(64));
  });

  it('returns null update adapter on web browsers so PWA does not prompt APK installs', () => {
    vi.spyOn(runtime, 'getPlatformId').mockReturnValue('web');
    expect(getUpdateAdapter()).toBeNull();
  });

});
