import { simplifyInkWithRust } from '../../platform/rustEngine';
import { isTauriRuntime } from '../../platform/runtime';
import type { BoardStroke } from '../types';

const MIN_POINTS = 64;
const TOLERANCE = 0.1;

async function simplifyStroke(stroke: BoardStroke): Promise<BoardStroke> {
  const { points } = stroke;
  if (stroke.shape || stroke.tool !== 'pen' || points.length < MIN_POINTS) return stroke;
  const retained = await simplifyInkWithRust(points.map(({ x, y, pressure }, index) => ({
    x, y, pressure: pressure ?? 0.5, timestamp_ms: index,
  })), TOLERANCE);
  if (!retained || retained.length >= points.length) return stroke;

  // RDP measures distance to an infinite line. Keep the original stroke if a
  // removed point doubles back or lies beyond an endpoint of the drawn segment.
  const keep = new Set<number>();
  let previousIndex = -1;
  for (const { timestamp_ms: index } of retained) {
    const end = points[index];
    const start = points[previousIndex];
    if (!end || index <= previousIndex || (!start && index !== 0)) return stroke;
    if (start) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const lengthSq = dx * dx + dy * dy;
      let previousProjection = 0;
      for (const point of points.slice(previousIndex + 1, index)) {
        const x = point.x - start.x;
        const y = point.y - start.y;
        const projection = x * dx + y * dy;
        if (projection < previousProjection || projection > lengthSq) return stroke;
        const t = lengthSq ? projection / lengthSq : 0;
        if (Math.hypot(x - t * dx, y - t * dy) > TOLERANCE) return stroke;
        previousProjection = projection;
      }
    }
    // Retain adjacent quadratic control points to preserve the corner radius.
    keep.add(index);
    if (index > 0) keep.add(index - 1);
    if (index < points.length - 1) keep.add(index + 1);
    previousIndex = index;
  }
  if (previousIndex !== points.length - 1 || keep.size === points.length) return stroke;
  return { ...stroke, points: points.filter((_, index) => keep.has(index)) };
}

/** Use native decimation for dense export paths, with the original JS drawing path as fallback. */
export async function prepareExportInk(strokes: BoardStroke[]): Promise<BoardStroke[]> {
  if (!isTauriRuntime()) return strokes;
  const prepared: BoardStroke[] = [];
  for (const stroke of strokes) prepared.push(await simplifyStroke(stroke));
  return prepared;
}
