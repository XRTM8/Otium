export function pinchScale(startZoom: number, startDistance: number, distance: number, min: number, max: number): number {
  if (![startZoom, startDistance, distance, min, max].every(Number.isFinite) || startDistance <= 0 || distance <= 0) return startZoom;
  return Math.min(max, Math.max(min, Math.round(startZoom * distance / startDistance * 100) / 100));
}
