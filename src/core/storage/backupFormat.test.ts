import { describe, expect, it } from 'vitest';
import type { TextAnnotation } from '../types';
import {
  BackupValidationError,
  buildBackupFile,
  mergeAnnotations,
  parseBackupFile,
  serialiseBackupFile
} from './backupFormat';

function annotation(overrides: Partial<TextAnnotation> = {}): TextAnnotation {
  return {
    id: 'anno-1',
    pageNumber: 2,
    type: 'highlight',
    color: '#fde047',
    rects: [{ xPct: 0.1, yPct: 0.2, widthPct: 0.3, heightPct: 0.04 }],
    text: 'نص مقتبس',
    note: 'ملاحظة',
    createdAt: 100,
    ...overrides
  };
}

describe('backup format', () => {
  it('round-trips documents, notes and preferences', () => {
    const file = buildBackupFile({
      appVersion: '1.5.0',
      exportedAt: new Date('2026-10-25T12:00:00.000Z'),
      preferences: {
        theme: 'midnight',
        language: 'ar',
        viewMode: 'dual',
        fontFamily: 'amiri'
      },
      documents: [
        {
          id: 'sha256:abc',
          name: 'كتاب.pdf',
          totalPages: 20,
          lastPage: 7,
          lastOpened: 1_700_000_000_000,
          sizeBytes: 1024,
          annotations: [annotation()],
          bookmarks: [{ id: 'bm-1', pageNumber: 7, createdAt: 200 }]
        }
      ]
    });

    const parsed = parseBackupFile(serialiseBackupFile(file));

    expect(parsed.format).toBe('otium-backup');
    expect(parsed.version).toBe(1);
    expect(parsed.appVersion).toBe('1.5.0');
    expect(parsed.preferences).toEqual(file.preferences);
    expect(parsed.documents).toHaveLength(1);
    expect(parsed.documents[0].annotations[0].note).toBe('ملاحظة');
    expect(parsed.documents[0].bookmarks[0].pageNumber).toBe(7);
  });

  it('clamps pages into the document and rejects malformed entries', () => {
    const parsed = parseBackupFile(
      JSON.stringify({
        format: 'otium-backup',
        version: 1,
        appVersion: '1.5.0',
        documents: [
          {
            id: 'sha256:abc',
            name: 'book.pdf',
            totalPages: 10,
            lastPage: 99,
            annotations: [],
            bookmarks: [{ id: 'bm', pageNumber: -4, createdAt: 1 }]
          }
        ]
      })
    );

    expect(parsed.documents[0].lastPage).toBe(10);
    expect(parsed.documents[0].bookmarks[0].pageNumber).toBe(1);
  });

  it('reports invalid JSON and unsupported versions with stable codes', () => {
    expect(() => parseBackupFile('{ nope')).toThrow(BackupValidationError);

    try {
      parseBackupFile('{ nope');
      throw new Error('expected a validation error');
    } catch (error) {
      expect(error).toBeInstanceOf(BackupValidationError);
      expect((error as BackupValidationError).code).toBe('invalid-json');
    }

    try {
      parseBackupFile(
        JSON.stringify({ format: 'otium-backup', version: 99, documents: [] })
      );
      throw new Error('expected a validation error');
    } catch (error) {
      expect((error as BackupValidationError).code).toBe('unsupported-version');
    }
  });

  it('merges annotations by id with the incoming copy winning', () => {
    const existing = annotation({ note: 'old', pageNumber: 4 });
    const incoming = annotation({ note: 'new', pageNumber: 5 });
    const extra = annotation({ id: 'anno-2', pageNumber: 1 });

    const merged = mergeAnnotations([existing, extra], [incoming]);

    expect(merged).toHaveLength(2);
    const updated = merged.find((item) => item.id === 'anno-1');
    expect(updated?.note).toBe('new');
    expect(updated?.pageNumber).toBe(5);
    expect(merged[0].pageNumber).toBe(1);
  });
});
