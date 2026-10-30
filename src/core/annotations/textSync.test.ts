import { describe, expect, it } from 'vitest';
import { mergeTextAnnotations, validSelectionRects } from './textSync';
import type { TextAnnotation } from '../types';

const highlight: TextAnnotation = { id: 'highlight', pageNumber: 2, type: 'highlight', color: '#fde047',
  rects: [{ xPct: 0.1, yPct: 0.2, widthPct: 0.4, heightPct: 0.03 }], text: 'Selected text', createdAt: 100 };

describe('text annotation synchronization', () => {
  it('merges saved text highlights without duplication and synchronizes deletion', () => {
    const local = { ...highlight, id: 'local' };
    expect(mergeTextAnnotations([local], [highlight, highlight])).toEqual([local, highlight]);
    expect(mergeTextAnnotations([local, highlight], [], ['highlight'])).toEqual([local]);
  });
  it('does not overwrite a newer note when older storage finishes loading', () => {
    const newer = { ...highlight, note: 'Updated note', updatedAt: 200 };
    expect(mergeTextAnnotations([newer], [highlight])).toEqual([newer]);
  });
  it('rejects malformed geometry instead of passing it to the drawing canvas', () => {
    expect(validSelectionRects([{ xPct: NaN, yPct: 0, widthPct: 1, heightPct: 1 }])).toBe(false);
    expect(validSelectionRects([null])).toBe(false);
    expect(mergeTextAnnotations([], [{ ...highlight, rects: [{ xPct: 4, yPct: 0, widthPct: 1, heightPct: 1 }] }])).toEqual([]);
    expect(validSelectionRects(highlight.rects)).toBe(true);
  });
});
