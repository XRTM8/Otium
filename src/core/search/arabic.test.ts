import { describe, expect, it } from 'vitest';
import { containsNormalized, normalizeSearchText, normalizeCopiedArabicText } from './arabic';

describe('Arabic search normalisation', () => {
  it('removes vocalisation and tatweel', () => {
    expect(normalizeSearchText('مُحَمَّد')).toBe('محمد');
    expect(normalizeSearchText('كتـــاب')).toBe('كتاب');
    expect(normalizeSearchText('كِتَاباً مُفِيداً')).toBe('كتابا مفيدا');
    expect(normalizeSearchText('الرَّحْمَٰنِ الرَّحِيمِ')).toBe('الرحمن الرحيم');
  });

  it('folds alef, hamza and taa-marbuta variants', () => {
    expect(normalizeSearchText('أحمد')).toBe(normalizeSearchText('احمد'));
    expect(normalizeSearchText('إسلام')).toBe(normalizeSearchText('اسلام'));
    expect(normalizeSearchText('آية')).toBe(normalizeSearchText('ايه'));
    expect(normalizeSearchText('مدرسة')).toBe(normalizeSearchText('مدرسه'));
    expect(normalizeSearchText('مسؤول')).toBe(normalizeSearchText('مسوول'));
  });

  it('folds Persian letters used in Arabic typesetting', () => {
    expect(normalizeSearchText('گل')).toBe(normalizeSearchText('كل'));
    expect(normalizeSearchText('پدر')).toBe(normalizeSearchText('بدر'));
  });

  it('converts Arabic-Indic and Persian digits to Latin digits', () => {
    expect(normalizeSearchText('صفحة ١٢٣')).toBe('صفحه 123');
    expect(normalizeSearchText('سال ۱۳۴۵')).toBe('سال 1345');
  });

  it('matches a plain query against vocalised page text', () => {
    expect(containsNormalized('وَقَالَ مُحَمَّدٌ', 'محمد')).toBe(true);
    expect(containsNormalized('الفصل الأول', 'الاول')).toBe(true);
  });

  it('ignores single-letter queries and Latin case', () => {
    expect(containsNormalized('Otium Reader', 'o')).toBe(false);
    expect(containsNormalized('Otium Reader', 'READER')).toBe(true);
  });

  it('normalises copied Arabic text and removes BiDi controls', () => {
    // Isolated/presentation form ligature for 'الله' (\uFDF2) should normalize to standard Arabic letters
    const presentationForm = '\uFDF2';
    expect(normalizeCopiedArabicText(presentationForm)).toBe('الله');

    // Text with hidden directional controls (\u200E, \u200F)
    const textWithBidi = '\u200Eكتاب\u200F \u202Aمفيد\u202C';
    expect(normalizeCopiedArabicText(textWithBidi)).toBe('كتاب مفيد');

    // Preserves line breaks but cleans excessive empty lines
    const multiline = '  السطر الأول  \n\n\n\n  السطر الثاني  ';
    expect(normalizeCopiedArabicText(multiline)).toBe('السطر الأول\n\nالسطر الثاني');
  });
});
