/**
 * Universal Clipboard Engine.
 * Supports modern async navigator.clipboard, legacy document.execCommand('copy') fallback,
 * and handles permission denials or non-HTTPS/WebView contexts gracefully.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // 1. Modern Async Clipboard API
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied, document not focused, or insecure origin; fall through to legacy
    }
  }

  // 2. Fallback using temporary textarea + execCommand
  let textArea: HTMLTextAreaElement | null = null;
  try {
    textArea = document.createElement('textarea');
    textArea.value = text;
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
