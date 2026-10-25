import { describe, expect, it } from 'vitest';
import { fingerprintDocument, isDocumentId } from './documentIdentity';

const encode = (text: string) => new TextEncoder().encode(text).buffer;

describe('document identity', () => {
  it('returns a stable SHA-256 key for identical bytes', async () => {
    const first = await fingerprintDocument(encode('same book'));
    const second = await fingerprintDocument(encode('same book'));

    expect(first).toBe(second);
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(isDocumentId(first)).toBe(true);
  });

  it('separates different books even when their titles match', async () => {
    const first = await fingerprintDocument(encode('book one'));
    const second = await fingerprintDocument(encode('book two'));

    expect(first).not.toBe(second);
    expect(isDocumentId('book.pdf')).toBe(false);
  });
});
