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
});
