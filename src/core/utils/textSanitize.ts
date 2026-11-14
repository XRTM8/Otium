/**
 * Strips ASCII C0 control characters (0x00-0x1F) and DEL (0x7F).
 * Set `keepLineBreaks` to retain TAB (0x09), LF (0x0A), and CR (0x0D).
 */
export function stripControlChars(
  input: string,
  options: { keepLineBreaks?: boolean; replacement?: string } = {}
): string {
  const { keepLineBreaks = false, replacement = '' } = options;
  let out = '';
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    const isControl = (code >= 0x00 && code <= 0x1f) || code === 0x7f;
    if (isControl && (!keepLineBreaks || (code !== 0x09 && code !== 0x0a && code !== 0x0d))) {
      out += replacement;
    } else {
      out += input[i];
    }
  }
  return out;
}
