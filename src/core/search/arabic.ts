/**
 * Arabic-aware search normalisation.
 *
 * PDF text frequently contains vocalisation marks and different hamza/alef
 * spellings. Readers type the plain form, so both sides are folded before a
 * comparison. The same helper is used for page text and the query, which keeps
 * matching symmetric.
 */

const DIACRITICS = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g;
const TATWEEL = /\u0640/g;
const BIDI_CONTROLS = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

const LETTER_FOLDS: Record<string, string> = {
  '\u0623': '\u0627', // أ
  '\u0625': '\u0627', // إ
  '\u0622': '\u0627', // آ
  '\u0671': '\u0627', // ٱ
  '\u0649': '\u064a', // ى
  '\u0626': '\u064a', // ئ
  '\u0624': '\u0648', // ؤ
  '\u0629': '\u0647', // ة
  '\u06af': '\u0643', // گ
  '\u067e': '\u0628', // پ
  '\u0686': '\u062c', // چ
  '\u0698': '\u0632', // ژ
  '\u06a4': '\u0641' // ڤ
};

const ARABIC_DIGITS: Record<string, string> = {
  '\u0660': '0',
  '\u0661': '1',
  '\u0662': '2',
  '\u0663': '3',
  '\u0664': '4',
  '\u0665': '5',
  '\u0666': '6',
  '\u0667': '7',
  '\u0668': '8',
  '\u0669': '9',
  '\u06f0': '0',
  '\u06f1': '1',
  '\u06f2': '2',
  '\u06f3': '3',
  '\u06f4': '4',
  '\u06f5': '5',
  '\u06f6': '6',
  '\u06f7': '7',
  '\u06f8': '8',
  '\u06f9': '9'
};

export function normalizeSearchText(input: string): string {
  if (!input) return '';

  let text = input.normalize('NFKC');
  text = text.replace(DIACRITICS, '');
  text = text.replace(TATWEEL, '');
  text = text.replace(BIDI_CONTROLS, '');

  // Fold alef/hamza/taa-marbuta variants after the mark removal so combining
  // sequences do not split a letter from its base form.
  text = text.replace(
    /[\u0623\u0625\u0622\u0671\u0649\u0626\u0624\u0629\u06af\u067e\u0686\u0698\u06a4]/g,
    (letter) => LETTER_FOLDS[letter] ?? letter
  );
  text = text.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (digit) => ARABIC_DIGITS[digit] ?? digit);

  // Latin accents are rare in PDFs but cheap to fold. This intentionally
  // leaves Arabic letters intact because their marks were removed above.
  text = text.normalize('NFKD').replace(/\p{M}+/gu, '');
  text = text.toLowerCase();

  return text.replace(/\s+/g, ' ').trim();
}

export function containsNormalized(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizeSearchText(needle);
  if (normalizedNeedle.length < 2) return false;
  return normalizeSearchText(haystack).includes(normalizedNeedle);
}
