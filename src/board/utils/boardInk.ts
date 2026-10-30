import type { BoardStroke } from '../types';

/** Shared by the live canvas and exports so curved ink keeps the same finish. */
export function drawBoardInk(ctx: CanvasRenderingContext2D, strokes: BoardStroke[], dark: boolean) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    const points = stroke.points;
    if (!points?.length) continue;
    const neutral = ['#111827', '#f8fafc'].includes(stroke.color.toLowerCase());
    const color = neutral ? dark ? '#f8fafc' : '#111827' : stroke.color;
    ctx.beginPath();
    ctx.globalCompositeOperation = stroke.tool === 'highlighter' ? dark ? 'screen' : 'multiply' : 'source-over';
    ctx.globalAlpha = stroke.tool === 'highlighter' ? dark ? .45 : .55 : 1;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = stroke.width;
    if (points.length === 1) {
      ctx.arc(points[0].x, points[0].y, stroke.width / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const p = points[i], next = points[i + 1];
      ctx.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }
  ctx.restore();
}
