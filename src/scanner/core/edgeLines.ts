import type { Point, Quad } from './types';

type EdgeLine = { slope: number; offset: number; votes: number };

const slopes = Array.from({ length: 25 }, (_, index) => (index - 12) / 16);

function findLines(lum: Uint8Array, width: number, height: number, horizontal: boolean): EdgeLine[] {
  const along = horizontal ? width : height;
  const across = horizontal ? height : width;
  const bins = Math.ceil((along + across) / 2) + 4;
  const center = (along - 1) / 2;
  const shift = along * 0.4;
  const votes = new Uint16Array(bins * slopes.length);
  const stride = Math.max(1, Math.floor(along / 150));
  const sample = horizontal
    ? (u: number, v: number) => lum[v * width + u]!
    : (u: number, v: number) => lum[u * width + v]!;
  for (let u = 3; u < along - 3; u += stride) {
    for (let v = 3; v < across - 3; v++) {
      const gradient = Math.abs(sample(u, v - 2) + sample(u, v - 1) - sample(u, v + 1) - sample(u, v + 2));
      if (gradient < 15 || gradient < Math.abs(sample(u - 2, v) + sample(u - 1, v) - sample(u + 1, v) - sample(u + 2, v))) continue;
      for (let i = 0; i < slopes.length; i++) {
        const bin = Math.round((v - (u - center) * slopes[i]! + shift) / 2);
        if (bin >= 0 && bin < bins) votes[i * bins + bin]!++;
      }
    }
  }

  const candidates: EdgeLine[] = [];
  for (let i = 0; i < slopes.length; i++) {
    const slope = slopes[i]!;
    for (let bin = 1; bin < bins - 1; bin++) {
      const index = i * bins + bin;
      const count = votes[index]!;
      if (count < Math.max(8, along / stride * 0.12) || count <= votes[index - 1]! || count < votes[index + 1]!) continue;
      candidates.push({ slope, offset: bin * 2 - shift - slope * center, votes: count });
    }
  }
  const lines: EdgeLine[] = [];
  for (const candidate of candidates.sort((a, b) => b.votes - a.votes)) {
    if (lines.some((line) =>
      Math.abs(line.offset - candidate.offset + (line.slope - candidate.slope) * center) < 6
      && Math.abs(line.slope - candidate.slope) < 0.14
    )) continue;
    lines.push(candidate);
    if (lines.length === 7) break;
  }
  return lines.sort((a, b) => a.slope * center + a.offset - (b.slope * center + b.offset));
}

function intersection(horizontal: EdgeLine, vertical: EdgeLine): Point {
  const x = (vertical.offset + vertical.slope * horizontal.offset) / (1 - vertical.slope * horizontal.slope);
  return { x, y: horizontal.slope * x + horizontal.offset };
}

export function* findLineQuads(lum: Uint8Array, width: number, height: number): Generator<Quad> {
  const horizontal = findLines(lum, width, height, true);
  const vertical = findLines(lum, width, height, false);
  for (let top = 0; top < horizontal.length - 1; top++) {
    for (let bottom = top + 1; bottom < horizontal.length; bottom++) {
      for (let left = 0; left < vertical.length - 1; left++) {
        for (let right = left + 1; right < vertical.length; right++) {
          yield {
            topLeft: intersection(horizontal[top]!, vertical[left]!),
            topRight: intersection(horizontal[top]!, vertical[right]!),
            bottomRight: intersection(horizontal[bottom]!, vertical[right]!),
            bottomLeft: intersection(horizontal[bottom]!, vertical[left]!),
          };
        }
      }
    }
  }
}

// Locate the strongest nearby transition on each side, then fit the intersections again.
export function refineQuad(quad: Quad, luminanceAt: (x: number, y: number) => number, radius: number): Quad {
  const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  const lines = points.map((a, index) => {
    const b = points[(index + 1) % 4]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = (a.y - b.y) / length;
    const ny = (b.x - a.x) / length;
    const offsets: { t: number; offset: number }[] = [];
    for (let sample = 2; sample <= 14; sample++) {
      const t = sample / 16;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      let strength = 9;
      let bestOffset = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const before = luminanceAt(x + nx * (offset - 2), y + ny * (offset - 2));
        const after = luminanceAt(x + nx * (offset + 2), y + ny * (offset + 2));
        const score = Math.abs(after - before) - Math.abs(offset) * 0.7;
        if (score > strength) { strength = score; bestOffset = offset; }
      }
      if (strength > 9) offsets.push({ t, offset: bestOffset });
    }
    if (offsets.length < 8) return [a, b] as const;
    const median = offsets.map(({ offset }) => offset).sort((first, second) => first - second)[Math.floor(offsets.length / 2)]!;
    const inliers = offsets.filter(({ offset }) => Math.abs(offset - median) <= Math.max(2, radius / 2));
    const meanT = inliers.reduce((sum, item) => sum + item.t, 0) / inliers.length;
    const meanOffset = inliers.reduce((sum, item) => sum + item.offset, 0) / inliers.length;
    const variance = inliers.reduce((sum, item) => sum + (item.t - meanT) ** 2, 0);
    if (inliers.length < 7 || variance < 0.1) return [a, b] as const;
    const slope = inliers.reduce((sum, item) => sum + (item.t - meanT) * (item.offset - meanOffset), 0) / variance;
    const start = meanOffset - slope * meanT;
    const end = start + slope;
    return [{ x: a.x + nx * start, y: a.y + ny * start }, { x: b.x + nx * end, y: b.y + ny * end }] as const;
  });

  const corners = lines.map(([a, b], index) => {
    const [c, d] = lines[(index + 3) % 4]!;
    const ux = b.x - a.x, uy = b.y - a.y;
    const vx = d.x - c.x, vy = d.y - c.y;
    const det = ux * vy - uy * vx;
    if (Math.abs(det) < 1) return points[index]!;
    const t = ((c.x - a.x) * vy - (c.y - a.y) * vx) / det;
    const point = { x: a.x + t * ux, y: a.y + t * uy };
    return Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y) <= radius * 2 ? point : points[index]!;
  });
  return { topLeft: corners[0]!, topRight: corners[1]!, bottomRight: corners[2]!, bottomLeft: corners[3]! };
}
