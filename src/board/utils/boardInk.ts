import type { BoardStroke } from '../types';

/** Shared by the live canvas and exports so curved ink keeps the same finish. */
export function drawBoardInk(ctx: CanvasRenderingContext2D, strokes: BoardStroke[], dark: boolean) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    const points = stroke.points;
    const firstPoint = points?.[0];
    if (!firstPoint) continue;
    const neutral = ['#111827', '#f8fafc'].includes(stroke.color.toLowerCase());
    const color = neutral ? (dark ? '#f8fafc' : '#111827') : stroke.color;
    ctx.beginPath();
    ctx.globalCompositeOperation = stroke.tool === 'highlighter' ? (dark ? 'screen' : 'multiply') : 'source-over';
    ctx.globalAlpha = stroke.tool === 'highlighter' ? (dark ? 0.45 : 0.55) : 1;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = stroke.width;
    if (points.length === 1) {
      ctx.arc(firstPoint.x, firstPoint.y, stroke.width / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.moveTo(firstPoint.x, firstPoint.y);
    if (stroke.shape && stroke.shape !== 'circle') {
      for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.stroke();
      continue;
    }
    for (let i = 1; i < points.length - 1; i++) {
      const p = points[i];
      const next = points[i + 1];
      if (!p || !next) continue;
      ctx.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
    }
    const last = points[points.length - 1];
    if (last) ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Geometric point-to-stroke proximity test.
 * Uses AABB early exit and exact point-to-segment projection with stroke width awareness.
 */
export function isStrokeNearPoint(stroke: BoardStroke, x: number, y: number, radius = 20): boolean {
  const points = stroke.points;
  if (!points || points.length === 0) return false;
  const effectiveRadius = radius + (stroke.width > 0 ? stroke.width / 2 : 0);
  const effectiveRadiusSq = effectiveRadius * effectiveRadius;

  const first = points[0];
  if (!first) return false;
  if (points.length === 1) {
    const dx = first.x - x;
    const dy = first.y - y;
    return dx * dx + dy * dy <= effectiveRadiusSq;
  }

  // 1. Fast Axis-Aligned Bounding Box (AABB) early-exit check
  let minX = first.x;
  let maxX = first.x;
  let minY = first.y;
  let maxY = first.y;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (!p) continue;
    if (p.x < minX) minX = p.x;
    else if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    else if (p.y > maxY) maxY = p.y;
  }

  if (
    x < minX - effectiveRadius ||
    x > maxX + effectiveRadius ||
    y < minY - effectiveRadius ||
    y > maxY + effectiveRadius
  ) {
    return false;
  }

  // 2. Exact point-to-segment distance check
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    let distSq: number;
    if (l2 === 0) {
      const px = a.x - x;
      const py = a.y - y;
      distSq = px * px + py * py;
    } else {
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
      const projX = a.x + t * dx;
      const projY = a.y + t * dy;
      const px = projX - x;
      const py = projY - y;
      distSq = px * px + py * py;
    }
    if (distSq <= effectiveRadiusSq) {
      return true;
    }
  }

  return false;
}
