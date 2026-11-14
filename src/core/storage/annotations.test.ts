import { localStorage } from '../../platform/storage';
import { describe, expect, it, vi } from 'vitest';
import type { TextAnnotation } from '../types';
import { loadStoredAnnotations, saveStoredAnnotations } from './annotations';

const annotation: TextAnnotation = {
  id: 'legacy-anno',
  pageNumber: 4,
  type: 'highlight',
  color: '#fde047',
  rects: [{ xPct: 0.1, yPct: 0.2, widthPct: 0.3, heightPct: 0.04 }],
  text: 'اقتباس قديم',
  createdAt: 1
};

describe('annotation storage', () => {
  it('restores a newer local fallback including deletion when database writes fail', async () => {
    await saveStoredAnnotations('quota-book', [annotation]);
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new Error('Quota reached'); });
    expect(await saveStoredAnnotations('quota-book', [])).toBe(true);
    expect(await loadStoredAnnotations('quota-book')).toEqual([]);
    put.mockRestore();
    expect(await loadStoredAnnotations('quota-book')).toEqual([]);
  });
  it('migrates filename-keyed IndexedDB records to the content fingerprint', async () => {
    await saveStoredAnnotations('legacy-book.pdf', [annotation]);
    localStorage.removeItem('otium_annos_legacy-book.pdf');

    const restored = await loadStoredAnnotations('sha256:new-key', 'legacy-book.pdf');

    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe('legacy-anno');
  });

  it.each([null, '{broken', '{}', '[{"id":"invalid"}]', JSON.stringify([annotation, { id: 'invalid' }])])(
    'keeps the committed annotations when the pending snapshot is unreadable (%s)',
    async (pending) => {
      const id = 'sha256:committed-annotations';
      const committed = [annotation, { ...annotation, id: 'second-committed' }];
      await saveStoredAnnotations(id, committed);
      if (pending === null) localStorage.removeItem(`otium_annos_${id}`);
      else localStorage.setItem(`otium_annos_${id}`, pending);
      localStorage.setItem(`otium_annos_pending_${id}`, '1');
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const expected = committed.map((entry) => expect.objectContaining({ id: entry.id }));
      expect(await loadStoredAnnotations(id)).toEqual(expected);
      localStorage.removeItem(`otium_annos_pending_${id}`);
      expect(await loadStoredAnnotations(id)).toEqual(expected);
    },
  );

  it('recovers the current fingerprint snapshot when IndexedDB is unreadable', async () => {
    const id = 'sha256:current-local-copy';
    await saveStoredAnnotations(id, [annotation]);
    const get = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(() => {
      throw new DOMException('Unavailable', 'InvalidStateError');
    });
    expect(await loadStoredAnnotations(id, 'former-name.pdf')).toEqual([
      expect.objectContaining({ id: annotation.id, text: annotation.text }),
    ]);
    get.mockRestore();
  });
});
