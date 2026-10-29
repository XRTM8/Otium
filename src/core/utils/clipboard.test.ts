import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard, sanitizeCopiedPdfText } from './clipboard';

describe('Universal Clipboard Engine & Smart Text Sanitizer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('sanitizeCopiedPdfText', () => {
    it('returns empty string for empty or null input', () => {
      expect(sanitizeCopiedPdfText('')).toBe('');
    });

    it('recombines English hyphenated words split across lines', () => {
      const raw = 'The imple-\n mentation of the sys-\r\n tem was robust.';
      expect(sanitizeCopiedPdfText(raw)).toBe('The implementation of the system was robust.');
    });

    it('unifies fragmented PDF lines into continuous paragraphs while keeping true double newlines', () => {
      const raw = 'First line of paragraph one\nsecond line of paragraph one.\n\nParagraph two starts here\nand continues here.';
      const clean = sanitizeCopiedPdfText(raw);
      expect(clean).toBe('First line of paragraph one second line of paragraph one.\n\nParagraph two starts here and continues here.');
    });

    it('cleans Arabic text with broken lines and preserves paragraph spacing', () => {
      const raw = 'هذا السطر الأول\nمن الفقرة الأولى.\n\nوهنا بداية\nالفقرة الثانية.';
      const clean = sanitizeCopiedPdfText(raw);
      expect(clean).toBe('هذا السطر الأول من الفقرة الأولى.\n\nوهنا بداية الفقرة الثانية.');
    });

    it('strips soft hyphens and invisible BiDi markers', () => {
      const raw = 'Soft\u00ADhyphen and zero\u200Bwidth';
      expect(sanitizeCopiedPdfText(raw)).toBe('Softhyphen and zerowidth');
    });
  });

  describe('copyTextToClipboard', () => {
    it('uses modern navigator.clipboard.writeText and automatically sanitizes text', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const result = await copyTextToClipboard('مرحباً بك في\n أوتيوم');
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
});
