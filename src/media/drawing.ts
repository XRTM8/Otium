export type InkPoint = { x: number; y: number };
export type InkStroke = { points: InkPoint[]; color: string; width: number; opacity: number };
export type MediaDrawing = Record<string, InkStroke[]>;
export const MAX_DRAWING_POINTS = 200_000;
export function validStrokes(value: unknown): value is InkStroke[] {
  return Array.isArray(value) && value.length <= 200 && value.every(stroke =>
    stroke && /^#[0-9a-f]{6}$/i.test(stroke.color) && Number.isFinite(stroke.width) && stroke.width > 0 && stroke.width <= 1 &&
    (stroke.opacity === 1 || stroke.opacity === 0.3) && Array.isArray(stroke.points) && stroke.points.length > 0 && stroke.points.length <= 3000 &&
    stroke.points.every((point: InkPoint) => point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1));
}
export function validDrawing(value: unknown): value is MediaDrawing {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  let points = 0;
  return Object.entries(value).length <= 200 && Object.entries(value).every(([page, strokes]) => {
    if (!/^[1-9]\d{0,2}$/.test(page) || Number(page) > 200 || !validStrokes(strokes)) return false;
    points += strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
    return points <= MAX_DRAWING_POINTS;
  });
}
