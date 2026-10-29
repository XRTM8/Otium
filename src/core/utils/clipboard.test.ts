import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from './clipboard';

describe('Universal Clipboard Engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses modern navigator.clipboard.writeText when available and successful', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const result = await copyTextToClipboard('مرحباً بك في أوتيوم');
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith('مرحباً بك في أوتيوم');
  });

  it('falls back to document.execCommand when navigator.clipboard throws or is rejected', async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error('Permission denied'));
    const execCommandMock = vi.fn().mockReturnValue(true);

    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    vi.stubGlobal('document', {
      createElement: () => {
        return {
          value: '',
          style: {},
          setAttribute: vi.fn(),
          focus: vi.fn(),
          select: vi.fn(),
        };
      },
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
      execCommand: execCommandMock,
    });

    const result = await copyTextToClipboard('Fallback text');
    expect(result).toBe(true);
    expect(execCommandMock).toHaveBeenCalledWith('copy');
  });

  it('returns false safely without throwing when both methods fail', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', {
      createElement: () => {
        throw new Error('DOM restricted');
      },
    });

    const result = await copyTextToClipboard('Should not crash');
    expect(result).toBe(false);
  });
});
