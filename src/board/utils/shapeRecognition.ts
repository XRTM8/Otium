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

  const first = points[0];
  const last = points[points.length - 1];
  const pathLen = calculatePathLength(points);

  // Endpoints should meet (closed loop)
  const closureDist = dist(first, last);
  if (closureDist > pathLen * 0.32 && closureDist > 65) return null;

  // Compute centroid
  let sumX = 0;
  let sumY = 0;
  for (const pt of points) {
    sumX += pt.x;
    sumY += pt.y;
  }
  const cx = sumX / points.length;
  const cy = sumY / points.length;

  // Radii analysis
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const radii: number[] = [];
  for (const pt of points) {
    minX = Math.min(minX, pt.x);
    maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y);
    maxY = Math.max(maxY, pt.y);
    radii.push(Math.hypot(pt.x - cx, pt.y - cy));
  }

  const width = maxX - minX;
  const height = maxY - minY;
  if (width < 30 || height < 30) return null;

  const avgRadius = radii.reduce((acc, r) => acc + r, 0) / radii.length;
  const radiusVariance =
    radii.reduce((acc, r) => acc + (r - avgRadius) ** 2, 0) / radii.length;
  const stdDev = Math.sqrt(radiusVariance);

  // Check if radii are consistent (low standard deviation)
  const isCircleCandidate = stdDev / avgRadius < 0.24;

  const aspect = width / height;
  const isSquareAspect = aspect >= 0.78 && aspect <= 1.28;

  if (isCircleCandidate) {
    // Generate 36 smooth points along the perimeter
    const snappedPoints: StrokePoint[] = [];
    const rX = isSquareAspect ? (width + height) / 4 : width / 2;
    const rY = isSquareAspect ? (width + height) / 4 : height / 2;
    const steps = 36;

    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      snappedPoints.push({
        x: cx + rX * Math.cos(angle),
        y: cy + rY * Math.sin(angle),
        pressure: 0.5
      });
    }

    return {
      type: 'circle',
      confidence: Math.max(0.75, 1 - stdDev / avgRadius),
      points: snappedPoints
    };
  }

  return null;
}

/**
 * Recognizes if points form a rectangle or square.
 */
function tryRecognizeRectangle(points: StrokePoint[]): RecognizedShape | null {
  if (points.length < 12) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const pathLen = calculatePathLength(points);

  const closureDist = dist(first, last);
  if (closureDist > pathLen * 0.35 && closureDist > 75) return null;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const pt of points) {
    minX = Math.min(minX, pt.x);
    maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y);
    maxY = Math.max(maxY, pt.y);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  if (width < 35 || height < 35) return null;

  const perimeter = 2 * (width + height);
  // Path length must roughly equal rectangle perimeter (±25%)
  if (Math.abs(pathLen - perimeter) / perimeter > 0.30) return null;

  // Check distance of points to the 4 bounding box edges
  const edgeDistances = points.map((pt) => {
    const dLeft = Math.abs(pt.x - minX);
    const dRight = Math.abs(pt.x - maxX);
    const dTop = Math.abs(pt.y - minY);
    const dBottom = Math.abs(pt.y - maxY);
    return Math.min(dLeft, dRight, dTop, dBottom);
  });

  const avgEdgeDist = edgeDistances.reduce((a, b) => a + b, 0) / edgeDistances.length;
  const maxAllowedDist = Math.max(16, Math.min(width, height) * 0.16);

  if (avgEdgeDist > maxAllowedDist) return null;

  // Check for square aspect ratio snap
  const aspect = width / height;
  let finalMinX = minX;
  let finalMaxX = maxX;
  let finalMinY = minY;
  let finalMaxY = maxY;

  if (aspect >= 0.88 && aspect <= 1.14) {
    const side = (width + height) / 2;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    finalMinX = cx - side / 2;
    finalMaxX = cx + side / 2;
    finalMinY = cy - side / 2;
    finalMaxY = cy + side / 2;
  }

  return {
    type: 'rectangle',
    confidence: Math.max(0.7, 1 - avgEdgeDist / maxAllowedDist),
    points: [
      { x: finalMinX, y: finalMinY, pressure: 0.5 },
      { x: finalMaxX, y: finalMinY, pressure: 0.5 },
      { x: finalMaxX, y: finalMaxY, pressure: 0.5 },
      { x: finalMinX, y: finalMaxY, pressure: 0.5 },
      { x: finalMinX, y: finalMinY, pressure: 0.5 }
    ]
  };
}

/**
 * Recognizes if points form an equilateral or right triangle.
 */
function tryRecognizeTriangle(points: StrokePoint[]): RecognizedShape | null {
  if (points.length < 12) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const pathLen = calculatePathLength(points);

  const closureDist = dist(first, last);
  if (closureDist > pathLen * 0.35 && closureDist > 75) return null;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const pt of points) {
    minX = Math.min(minX, pt.x);
    maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y);
    maxY = Math.max(maxY, pt.y);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  if (width < 40 || height < 40) return null;

  // Approximate top vertex, bottom-left, bottom-right
  const sortedByY = [...points].sort((a, b) => a.y - b.y);
  const apex = sortedByY[0];
  const bottomPoints = points.filter((p) => p.y > minY + height * 0.65);
  if (bottomPoints.length < 4) return null;

  const bLeft = [...bottomPoints].sort((a, b) => a.x - b.x)[0];
  const bRight = [...bottomPoints].sort((a, b) => b.x - a.x)[0];

  if (dist(bLeft, bRight) < width * 0.55) return null;

  // Check point deviations to triangle edges (apex->bRight, bRight->bLeft, bLeft->apex)
  let maxDev = 0;
  for (const pt of points) {
    const d1 = distToSegment(pt, apex, bRight);
    const d2 = distToSegment(pt, bRight, bLeft);
    const d3 = distToSegment(pt, bLeft, apex);
    const minD = Math.min(d1, d2, d3);
    if (minD > maxDev) maxDev = minD;
  }

  if (maxDev > Math.max(22, Math.min(width, height) * 0.22)) return null;

  return {
    type: 'triangle',
    confidence: 0.8,
    points: [
      { x: apex.x, y: apex.y, pressure: 0.5 },
      { x: bRight.x, y: bRight.y, pressure: 0.5 },
      { x: bLeft.x, y: bLeft.y, pressure: 0.5 },
      { x: apex.x, y: apex.y, pressure: 0.5 }
    ]
  };
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

  // 2. Check for circle / ellipse
  const circle = tryRecognizeCircle(points);
  if (circle) return circle;

  // 3. Check for rectangle / square
  const rect = tryRecognizeRectangle(points);
  if (rect) return rect;

  // 4. Check for triangle
  const triangle = tryRecognizeTriangle(points);
  if (triangle) return triangle;

  return null;
}
