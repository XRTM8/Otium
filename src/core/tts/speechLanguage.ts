/**
 * Picks the reading language for text-to-speech from the text itself.
 *
 * The application language is a poor guide to the language of a quotation:
 * an Arabic interface routinely presents English books, and an English one
 * can contain Arabic passages. Feeding an English word to an Arabic engine
 * makes Android pronounce "said" as the Arabic name "سعيد". Selecting a
 * voice from the script of the selected text avoids that class of error.
 */

const ARABIC_LETTER = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/;
const LATIN_LETTER = /[A-Za-z\u00c0-\u024f]/;

export type SpeechLanguage = 'ar' | 'en';

export function detectSpeechLanguage(
  text: string,
  fallback: SpeechLanguage = 'ar'
): SpeechLanguage {
  let arabic = 0;
  let latin = 0;

  for (const character of text) {
    if (ARABIC_LETTER.test(character)) arabic += 1;
    else if (LATIN_LETTER.test(character)) latin += 1;
  }

  if (arabic === 0 && latin === 0) return fallback;
  if (latin > arabic * 1.25) return 'en';
  if (arabic > latin * 1.25) return 'ar';
  return fallback;
}

/**
 * Cleans PDF-extracted text just enough for a speech engine: collapsed
 * whitespace, no control characters, and no soft hyphens left by line wraps.
 */
export function prepareTextForSpeech(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
