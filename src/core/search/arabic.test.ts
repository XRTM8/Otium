import { describe, expect, it } from 'vitest';
import { containsNormalized, normalizeSearchText } from './arabic';

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
});
