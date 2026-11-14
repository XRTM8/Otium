import { validDrawing, type MediaDrawing } from './drawing';
export const MAX_INK_BACKUP_BYTES = 8 * 1024 * 1024;
export type InkSource = { name: string; size: number; kind: 'image' | 'presentation' };
export function serializeInkBackup(source: InkSource, drawing: MediaDrawing) {
  if (!validDrawing(drawing)) throw new Error('Invalid ink');
  const rounded = Object.fromEntries(Object.entries(drawing).map(([page, strokes]) => [page, strokes.map(stroke => ({ ...stroke, points: stroke.points.map(p => ({ x: +p.x.toFixed(6), y: +p.y.toFixed(6) })) }))]));
  return JSON.stringify({ format: 'otium-media-ink', version: 1, source, pages: rounded });
}
export function parseInkBackup(text: string, expected: InkSource): MediaDrawing {
  if (text.length > MAX_INK_BACKUP_BYTES) throw new Error('ملف النسخة الاحتياطية كبير جداً.');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('تعذر قراءة نسخة الشرح. اختر ملفاً صادراً من Otium.'); }
  if (value?.format !== 'otium-media-ink' || value.version !== 1 || !validDrawing(value.pages)) throw new Error('نسخة الشرح غير صالحة أو غير مدعومة.');
  if (value.source?.name !== expected.name || value.source?.size !== expected.size || value.source?.kind !== expected.kind) throw new Error('هذه النسخة تخص ملفاً آخر. افتح الملف الأصلي ثم استعد شرحه.');
  return value.pages;
}
export function inkSvg(drawing: MediaDrawing, page: number, width: number, height: number) {
  if (!validDrawing(drawing) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 50000 || height > 50000) throw new Error('Invalid ink dimensions');
  const shapes = (drawing[page] ?? []).map((stroke) => {
    const firstPoint = stroke.points[0];
    return stroke.points.length === 1 && firstPoint
      ? `<circle cx="${firstPoint.x * width}" cy="${firstPoint.y * height}" r="${stroke.width * width / 2}" fill="${stroke.color}" opacity="${stroke.opacity}"/>`
      : `<polyline points="${stroke.points.map(p => `${p.x * width},${p.y * height}`).join(' ')}" fill="none" stroke="${stroke.color}" stroke-width="${stroke.width * width}" stroke-linecap="round" stroke-linejoin="round" opacity="${stroke.opacity}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${shapes}</svg>`;
}
