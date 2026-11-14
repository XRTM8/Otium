import type { Point, Quad } from './types';

export {
  dewarpBookCurvature,
  dewarpBookCurvatureAsync,
  warpPerspective,
  warpPerspectiveAsync,
} from './perspectiveWarp';

export function orderCorners(pts: Point[]): Quad {
  if (pts.length !== 4) {
    throw new Error('Quad requires exactly 4 points');
  }

  // Classic CV quadrilateral corner assignment:
  // topLeft has min (x + y), bottomRight has max (x + y)
  const firstPt = pts[0];
  if (!firstPt) {
    throw new Error('Quad requires valid corner points');
  }

  // topRight has min (y - x), bottomLeft has max (y - x)
  let tl = firstPt;
  let br = firstPt;
  let tr = firstPt;
  let bl = firstPt;

  let minSum = firstPt.x + firstPt.y;
  let maxSum = minSum;
  let minDiff = firstPt.y - firstPt.x;
  let maxDiff = minDiff;

  for (let i = 1; i < 4; i++) {
    const pt = pts[i];
    if (!pt) continue;
    const sum = pt.x + pt.y;
    const diff = pt.y - pt.x;

    if (sum < minSum) {
      minSum = sum;
      tl = pt;
    }
    if (sum > maxSum) {
      maxSum = sum;
      br = pt;
    }
    if (diff < minDiff) {
      minDiff = diff;
      tr = pt;
    }
    if (diff > maxDiff) {
      maxDiff = diff;
      bl = pt;
    }
  }

  return {
    topLeft: { x: tl.x, y: tl.y },
    topRight: { x: tr.x, y: tr.y },
    bottomRight: { x: br.x, y: br.y },
    bottomLeft: { x: bl.x, y: bl.y },
  };
}

export function isQuadConvex(quad: Quad): boolean {
  const pts = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % 4];
    const p3 = pts[(i + 2) % 4];
    if (!p1 || !p2 || !p3) return false;
    const cp = (p2.x - p1.x) * (p3.y - p2.y) - (p2.y - p1.y) * (p3.x - p2.x);
    if (Math.abs(cp) > 1e-4) {
      if (sign === 0) {
        sign = cp > 0 ? 1 : -1;
      } else if ((cp > 0 ? 1 : -1) !== sign) {
        return false; // Cross-over / self-intersecting / concave
      }
    }
  }
  return sign !== 0;
}

export function computeQuadArea(tl: Point, tr: Point, br: Point, bl: Point): number {
  return 0.5 * Math.abs(
    tl.x * tr.y + tr.x * br.y + br.x * bl.y + bl.x * tl.y -
    (tl.y * tr.x + tr.y * br.x + br.y * bl.x + bl.y * tl.x)
  );
}

export function getQuadAspectRatio(quad: Quad): number {
  const topW = Math.hypot(quad.topRight.x - quad.topLeft.x, quad.topRight.y - quad.topLeft.y);
  const botW = Math.hypot(quad.bottomRight.x - quad.bottomLeft.x, quad.bottomRight.y - quad.bottomLeft.y);
  const leftH = Math.hypot(quad.bottomLeft.x - quad.topLeft.x, quad.bottomLeft.y - quad.topLeft.y);
  const rightH = Math.hypot(quad.bottomRight.x - quad.topRight.x, quad.bottomRight.y - quad.topRight.y);

  const avgW = (topW + botW) / 2;
  const avgH = (leftH + rightH) / 2;
  if (avgH === 0) return 1;
  return avgW / avgH;
}

export function expandQuadSafetyMargin(quad: Quad, naturalW: number, naturalH: number, factor: number = 0.008): Quad {
  const cx = (quad.topLeft.x + quad.topRight.x + quad.bottomRight.x + quad.bottomLeft.x) / 4;
  const cy = (quad.topLeft.y + quad.topRight.y + quad.bottomRight.y + quad.bottomLeft.y) / 4;

  const expandPoint = (p: Point): Point => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return {
      x: Math.round(Math.max(0, Math.min(naturalW, p.x + dx * factor))),
      y: Math.round(Math.max(0, Math.min(naturalH, p.y + dy * factor))),
    };
  };

  return {
    topLeft: expandPoint(quad.topLeft),
    topRight: expandPoint(quad.topRight),
    bottomRight: expandPoint(quad.bottomRight),
    bottomLeft: expandPoint(quad.bottomLeft),
  };
}

export function getFullFrameQuad(width: number, height: number, marginPercent: number = 0.005): Quad {
  const insetX = Math.round(width * Math.max(0, Math.min(0.05, marginPercent)));
  const insetY = Math.round(height * Math.max(0, Math.min(0.05, marginPercent)));

  return {
    topLeft: { x: insetX, y: insetY },
    topRight: { x: width - insetX, y: insetY },
    bottomRight: { x: width - insetX, y: height - insetY },
    bottomLeft: { x: insetX, y: height - insetY },
  };
}

export function getDefaultQuad(width: number, height: number): Quad {
  const insetX = width * 0.08;
  const insetY = height * 0.08;

  return {
    topLeft: { x: insetX, y: insetY },
    topRight: { x: width - insetX, y: insetY },
    bottomRight: { x: width - insetX, y: height - insetY },
    bottomLeft: { x: insetX, y: height - insetY },
  };
}
