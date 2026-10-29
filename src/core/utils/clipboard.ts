/**
 * Universal Clipboard Engine with Smart Text Sanitizer.
 * Supports modern async navigator.clipboard, legacy document.execCommand('copy') fallback,
 * and handles permission denials or non-HTTPS/WebView contexts gracefully.
 */

/**
 * Intelligently sanitizes raw PDF text before copying to system clipboard:
 * 1. Recombines words split across lines with hyphens (e.g., 'inter-\n national' -> 'international').
 * 2. Unifies broken mid-sentence newlines into continuous paragraphs while preserving true paragraph breaks.
 * 3. Strips zero-width and invisible BiDi markers.
 * 4. Normalizes Arabic ligatures and irregular spaces into standard clean Unicode.
 */
export function sanitizeCopiedPdfText(rawText: string): string {
  if (!rawText) return '';

  let text = rawText.normalize('NFKC');

  // Strip invisible zero-width and BiDi control markers
  text = text.replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\u2066-\u2069\u00AD]/g, '');

  // 1. Recombine words hyphenated at line breaks:
  // e.g. "con-\nnect" or "develop-\r\n  ment" -> "connect" / "development"
  text = text.replace(/(\p{L}+)[-\u2010\u2011]\s*\r?\n\s*(\p{L}+)/gu, '$1$2');

  // 2. Normalize irregular spaces
  text = text.replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, ' ');

  // 3. Smart paragraph reflow:
  // Split by double newlines (actual paragraphs)
  const paragraphs = text.split(/\r?\n\s*\r?\n/);

  const cleanParagraphs = paragraphs.map((para) => {
    // Within each paragraph, join single newlines into a space
    return para
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s{2,}/g, ' ');
  });

  return cleanParagraphs.filter(Boolean).join('\n\n').trim();
}

export async function copyTextToClipboard(text: string, sanitize = true): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const contentToCopy = sanitize ? sanitizeCopiedPdfText(text) : text;

  // 1. Modern Async Clipboard API
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(contentToCopy);
      return true;
    } catch {
      // Permission denied, document not focused, or insecure origin; fall through to legacy
    }
  }

  // 2. Fallback using temporary textarea + execCommand
  let textArea: HTMLTextAreaElement | null = null;
  try {
    textArea = document.createElement('textarea');
    textArea.value = contentToCopy;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '-9999px';
    textArea.style.opacity = '0';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    if (textArea && textArea.parentNode) {
      textArea.parentNode.removeChild(textArea);
    }
  }
}
