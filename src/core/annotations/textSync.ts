import type { AnnotationRect, TextAnnotation } from '../types';

export function validSelectionRects(value: unknown): value is AnnotationRect[] {
  return Array.isArray(value) && value.length <= 1000 && value.every(r => r &&
    [r.xPct, r.yPct, r.widthPct, r.heightPct].every(Number.isFinite) &&
    r.xPct >= 0 && r.yPct >= 0 && r.xPct <= 1 && r.yPct <= 1 &&
    r.widthPct >= 0 && r.widthPct <= 1 && r.heightPct >= 0 && r.heightPct <= 1);
}

export function mergeTextAnnotations(current: TextAnnotation[], updates: TextAnnotation[] = [], deleted: string[] = []): TextAnnotation[] {
  if (!Array.isArray(updates) || !Array.isArray(deleted)) return current;
  const removed = new Set(deleted);
  const result = new Map(current.filter(a => !removed.has(a.id)).map(a => [a.id, a]));
  for (const annotation of updates) {
    if (!annotation || typeof annotation.id !== 'string' || !Number.isInteger(annotation.pageNumber) || annotation.pageNumber < 1 ||
      !['highlight', 'underline'].includes(annotation.type) || !/^#[0-9a-f]{6}$/i.test(annotation.color) ||
      !validSelectionRects(annotation.rects) || typeof annotation.text !== 'string' || annotation.text.length > 20000 ||
      !Number.isFinite(annotation.createdAt) || (annotation.note !== undefined && (typeof annotation.note !== 'string' || annotation.note.length > 4000))) continue;
    const previous = result.get(annotation.id);
    if (!previous || (annotation.updatedAt || annotation.createdAt) >= (previous.updatedAt || previous.createdAt)) result.set(annotation.id, annotation);
  }
  return [...result.values()];
}
