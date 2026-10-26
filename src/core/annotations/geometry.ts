import type { AnnotationRect } from '../types';

const EPSILON = 0.0005;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Normalises highlight geometry from storage. Older versions could persist
 * overlapping or off-page boxes while the text layer was being rebuilt during
 * a zoom gesture; merging them keeps those highlights readable and stops
 * translucent layers from stacking into an opaque block.
 */
export function normalizeAnnotationRects(rects: AnnotationRect[]): AnnotationRect[] {
  const cleaned = rects
    .map((rect) => {
      const xPct = round4(clamp01(rect.xPct));
      const yPct = round4(clamp01(rect.yPct));
      return {
        xPct,
        yPct,
        widthPct: round4(Math.min(1 - xPct, clamp01(rect.widthPct))),
        heightPct: round4(Math.min(1 - yPct, clamp01(rect.heightPct)))
      };
    })
    .filter((rect) => rect.widthPct > EPSILON && rect.heightPct > EPSILON)
    .sort((a, b) => a.yPct - b.yPct || a.xPct - b.xPct);

  const merged: AnnotationRect[] = [];

  for (const rect of cleaned) {
    const line = merged.find((candidate) => {
      const overlap = Math.min(
        candidate.yPct + candidate.heightPct,
        rect.yPct + rect.heightPct
      ) - Math.max(candidate.yPct, rect.yPct);
      if (overlap < Math.min(candidate.heightPct, rect.heightPct) * 0.5) return false;

      const gap = Math.max(candidate.xPct, rect.xPct) -
        Math.min(candidate.xPct + candidate.widthPct, rect.xPct + rect.widthPct);
      return gap < 0.003;
    });

    if (!line) {
      merged.push({ ...rect });
      continue;
    }

    const left = Math.min(line.xPct, rect.xPct);
    const right = Math.max(line.xPct + line.widthPct, rect.xPct + rect.widthPct);
    const top = Math.min(line.yPct, rect.yPct);
    const bottom = Math.max(line.yPct + line.heightPct, rect.yPct + rect.heightPct);

    line.xPct = round4(left);
    line.yPct = round4(top);
    line.widthPct = round4(right - left);
    line.heightPct = round4(bottom - top);
  }

  return merged;
}
