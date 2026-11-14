export interface LaserPoint {
  x: number;
  y: number;
  time: number;
}

export function drawLaserTrailFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  trail: LaserPoint[],
  now: number
): void {
  while (trail[0] && now - trail[0].time > 1100) {
    trail.shift();
  }

  ctx.clearRect(0, 0, width, height);
  const latest = trail[trail.length - 1];
  if (!latest) return;

  ctx.save();
  ctx.scale(width / 1920, height / 1080);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 1; i < trail.length; i++) {
    const p1 = trail[i - 1];
    const p2 = trail[i];
    if (!p1 || !p2) continue;
    const age = now - p2.time;
    const alpha = Math.max(0, 1 - age / 1100);

    ctx.beginPath();
    ctx.strokeStyle = `rgba(239, 68, 68, ${alpha * 0.75})`;
    ctx.lineWidth = Math.max(2, 8 * (1 - age / 1100));
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 10;
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(latest.x, latest.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#ef4444';
  ctx.shadowColor = '#f87171';
  ctx.shadowBlur = 16;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(latest.x, latest.y, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.restore();
}
