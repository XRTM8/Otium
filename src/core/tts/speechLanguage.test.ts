import { describe, expect, it } from 'vitest';
import { detectSpeechLanguage, prepareTextForSpeech } from './speechLanguage';

describe('speech language detection', () => {
  it('reads an English word from an Arabic interface with an English voice', () => {
    expect(detectSpeechLanguage('said', 'ar')).toBe('en');
  });

  it('keeps predominantly Arabic text in Arabic', () => {
    expect(detectSpeechLanguage('هذا نص عربي طويل فيه كلمة PDF')).toBe('ar');
  });

  it('uses the interface language when the text has no letters', () => {
    expect(detectSpeechLanguage('123 — 456', 'en')).toBe('en');
    expect(detectSpeechLanguage('123 — 456', 'ar')).toBe('ar');
  });

  it('strips control characters and soft breaks before speaking', () => {
    expect(prepareTextForSpeech('  hello\u00ad\nworld\u0000  ')).toBe('hello world');
  });
});
