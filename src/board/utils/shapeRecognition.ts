import type { StrokePoint } from '../types';

export type RecognizedShapeType = 'line' | 'circle' | 'rectangle' | 'triangle';

export interface RecognizedShape {
  type: RecognizedShapeType;
  confidence: number;
  points: StrokePoint[];
}

/**
 * Calculates Euclidean distance between two points.
 */
function dist(p1: StrokePoint, p2: StrokePoint): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.hypot(dx, dy);
}

/**
 * Calculates total path length along an array of points.
 */
function calculatePathLength(points: StrokePoint[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += dist(points[i - 1], points[i]);
  }
  return len;
}

/**
 * Perpendicular distance from a point to a line segment (a -> b).
 */
function distToSegment(p: StrokePoint, a: StrokePoint, b: StrokePoint): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
}

/**
 * Recognizes if points form a straight line, snapping to exact horizontal
 * or vertical if within 6 degrees.
 */
function tryRecognizeLine(points: StrokePoint[]): RecognizedShape | null {
  if (points.length < 5) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const directLen = dist(first, last);

  if (directLen < 40) return null; // Too short to distinguish from a tap/dot

  const pathLen = calculatePathLength(points);
  // Straight line ratio: pathLen should be very close to directLen
  if (pathLen > directLen * 1.18) return null;

  // Maximum perpendicular deviation
  let maxDev = 0;
  for (const pt of points) {
    const d = distToSegment(pt, first, last);
    if (d > maxDev) maxDev = d;
  }

  // Tolerance is 12% of line length or 18px (whichever is larger)
  const allowedDev = Math.max(18, directLen * 0.12);
  if (maxDev > allowedDev) return null;

  // Snap to horizontal / vertical if angle is within ~6 degrees
  let snappedFirst = { ...first };
  let snappedLast = { ...last };

  const dx = Math.abs(last.x - first.x);
  const dy = Math.abs(last.y - first.y);
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

  if (angleDeg < 6) {
    // Horizontal snap
    const avgY = (first.y + last.y) / 2;
    snappedFirst.y = avgY;
    snappedLast.y = avgY;
  } else if (angleDeg > 84) {
    // Vertical snap
    const avgX = (first.x + last.x) / 2;
    snappedFirst.x = avgX;
    snappedLast.x = avgX;
  }

  return {
    type: 'line',
    confidence: Math.max(0.7, 1 - maxDev / directLen),
    points: [snappedFirst, snappedLast]
  };
}

/**
 * Recognizes if points form a circle or ellipse.
 */
function tryRecognizeCircle(points: StrokePoint[]): RecognizedShape | null {
  if (points.length < 16) return null;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = maxX - minX, height = maxY - minY;
  if (width < 30 || height < 30 || dist(points[0], points[points.length - 1]) > Math.max(18, Math.hypot(width, height) * .18)) return null;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const radialError = points.reduce((sum, p) => sum + Math.abs(Math.hypot((p.x - cx) / (width / 2), (p.y - cy) / (height / 2)) - 1), 0) / points.length;
  if (radialError > .12) return null;
  const squareAspect = width / height > .88 && width / height < 1.14;
  const rx = squareAspect ? (width + height) / 4 : width / 2;
  const ry = squareAspect ? (width + height) / 4 : height / 2;
  const result: StrokePoint[] = [];
  for (let i = 0; i <= 72; i++) {
    const angle = i / 72 * Math.PI * 2;
    result.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle), pressure: .5 });
  }
  return { type: 'circle', confidence: 1 - radialError, points: result };
}

/** Simplify a sampled edge while retaining real corners. */
function simplify(points: StrokePoint[], tolerance: number): StrokePoint[] {
  if (points.length < 3) return points;
  let farthest = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distToSegment(points[i], points[0], points[points.length - 1]);
    if (d > farthest) { farthest = d; index = i; }
  }
  if (farthest <= tolerance) return [points[0], points[points.length - 1]];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}

/** Corner detection supports rotated rectangles and triangles in any direction. */
function tryRecognizePolygon(points: StrokePoint[]): RecognizedShape | null {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
  const diagonal = Math.hypot(width, height);
  if (width < 25 || height < 25 || dist(points[0], points[points.length - 1]) > Math.max(18, diagonal * .18)) return null;
  const tolerance = diagonal * .04;
  let split = 1;
  for (let i = 2; i < points.length; i++) if (dist(points[0], points[i]) > dist(points[0], points[split])) split = i;
  const corners = [...simplify(points.slice(0, split + 1), tolerance).slice(0, -1), ...simplify([...points.slice(split), points[0]], tolerance).slice(0, -1)];
  // A stroke may start halfway along an edge: remove that extra collinear point.
  let changed = true;
  while (changed && corners.length > 3) {
    changed = false;
    for (let i = 0; i < corners.length; i++) {
      if (distToSegment(corners[i], corners[(i + corners.length - 1) % corners.length], corners[(i + 1) % corners.length]) < tolerance) {
        corners.splice(i, 1); changed = true; break;
      }
    }
  }
  if (corners.length !== 3 && corners.length !== 4) return null;
  const perimeter = calculatePathLength([...corners, corners[0]]);
  const ratio = calculatePathLength(points) / perimeter;
  if (ratio < .7 || ratio > 1.4) return null;
  const averageError = points.reduce((sum, p) => sum + Math.min(...corners.map((a, i) => distToSegment(p, a, corners[(i + 1) % corners.length]))), 0) / points.length;
  if (averageError > diagonal * .035) return null;
  if (corners.length === 3) return { type: 'triangle', confidence: .9, points: [...corners, corners[0]] };
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4], c = corners[(i + 2) % 4];
    const dot = ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / Math.max(1, dist(a, b) * dist(b, c));
    if (Math.abs(dot) > .45) return null;
  }
  const origin = corners[0], length = dist(origin, corners[1]);
  const ux = (corners[1].x - origin.x) / length, uy = (corners[1].y - origin.y) / length;
  const px = corners.map(p => p.x * ux + p.y * uy), py = corners.map(p => -p.x * uy + p.y * ux);
  let x0 = Math.min(...px), x1 = Math.max(...px), y0 = Math.min(...py), y1 = Math.max(...py);
  const aspect = (x1 - x0) / (y1 - y0);
  if (aspect > .88 && aspect < 1.14) {
    const half = ((x1 - x0) + (y1 - y0)) / 4, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    x0 = cx - half; x1 = cx + half; y0 = cy - half; y1 = cy + half;
  }
  const result = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => ({ x: x * ux - y * uy, y: x * uy + y * ux, pressure: .5 }));
  return { type: 'rectangle', confidence: .9, points: result };
}

/**
 * Primary shape recognizer for Draw-and-Hold gestures.
 * Analyzes raw freehand points and returns a normalized geometric shape if detected.
 */
export function recognizeGeometricShape(points: StrokePoint[]): RecognizedShape | null {
  if (!points || points.length < 5) return null;

  // 1. Check for straight line
  const line = tryRecognizeLine(points);
  if (line) return line;

  // Corners must be considered before radial similarity: a square has a
  // deceptively small radius variance and used to be snapped into a circle.
  const polygon = tryRecognizePolygon(points);
  if (polygon) return polygon;
  return tryRecognizeCircle(points);
}
