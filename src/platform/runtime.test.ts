import { openUrl } from '@tauri-apps/plugin-opener';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFormFactor, getPlatformLabel, isAndroidRuntime, openExternalLink } from './runtime';

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

describe('platform runtime', () => {
  it('prefers the Android bridge when a WebView advertises a desktop UA', () => {
    vi.stubGlobal('navigator', { userAgent: 'Windows NT 10.0' });
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {}, OtiumUi: {} });
    expect(isAndroidRuntime()).toBe(true);
    expect(getPlatformLabel()).toBe('Android');
    expect(getFormFactor()).toBe('mobile');
  });

  it('recognizes native Android by UA and native Windows by default', () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    vi.stubGlobal('navigator', { userAgent: 'Android 14' });
    expect(getPlatformLabel()).toBe('Android');
    vi.stubGlobal('navigator', undefined);
    expect(getPlatformLabel()).toBe('Windows');
    expect(getFormFactor()).toBe('desktop');
  });

  it.each([
    [undefined, 'desktop'],
    [{ userAgent: '' }, 'desktop'],
    [{ userAgent: 'Desktop', userAgentData: { mobile: true } }, 'mobile'],
    [{ userAgent: 'iPhone' }, 'mobile'],
    [{ userAgent: 'Macintosh', maxTouchPoints: 5 }, 'mobile'],
    [{ userAgent: 'Macintosh', maxTouchPoints: 0 }, 'desktop'],
  ])('chooses a web form factor from stable device traits (%j)', (navigator, expected) => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('navigator', navigator);
    expect(getPlatformLabel()).toBe('Web');
    expect(getFormFactor()).toBe(expected);
  });

  it('falls back to opening an isolated browser tab when native opening fails', async () => {
    const open = vi.fn();
    const url = 'https://example.com/';
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {}, open });
    vi.mocked(openUrl).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('native unavailable'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await openExternalLink(url);
    expect(openUrl).toHaveBeenCalledWith(url);
    expect(open).not.toHaveBeenCalled();
    await openExternalLink(url);
    expect(warn).toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(url, '_blank', 'noopener,noreferrer');
  });

  it('rejects blank, relative and script URLs without opening a tab', async () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const url of ['', './local', 'javascript:alert(1)']) await openExternalLink(url);
    expect(open).not.toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
    await openExternalLink('mailto:reader@example.com');
    expect(open).toHaveBeenCalledWith('mailto:reader@example.com', '_blank', 'noopener,noreferrer');
  });
});
