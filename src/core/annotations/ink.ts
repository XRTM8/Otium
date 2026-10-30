export interface InkPoint { x: number; y: number }
export interface InkMark {
  id: string;
  page: number;
  type: 'pen' | 'highlighter' | 'note';
  color: string;
  /** Width relative to displayed page width. */
  width: number;
  points: InkPoint[];
  text?: string;
}

export interface InkHistory { past: InkMark[][]; present: InkMark[]; future: InkMark[][]; revision: number }
export type InkAction = { type: 'load' | 'change'; marks: InkMark[] } | { type: 'undo' | 'redo' } | { type: 'remote'; upsert?: InkMark[]; deleted?: string[] };
export const EMPTY_INK: InkHistory = { past: [], present: [], future: [], revision: 0 };
export function inkHistory(state: InkHistory, action: InkAction): InkHistory {
  if (action.type === 'load') return { ...EMPTY_INK, present: action.marks };
  if (action.type === 'remote') {
    const apply = (marks: InkMark[]) => mergeInk(marks, action.upsert, action.deleted);
    return { past: state.past.map(apply), present: apply(state.present), future: state.future.map(apply), revision: state.revision + 1 };
  }
  if (action.type === 'change') return { past: [...state.past, state.present].slice(-60), present: action.marks, future: [], revision: state.revision + 1 };
  if (action.type === 'undo' && state.past.length) return { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future], revision: state.revision + 1 };
  if (action.type === 'redo' && state.future.length) return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1), revision: state.revision + 1 };
  return state;
}

export function clampPoint(x: number, y: number): InkPoint {
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}

export function mergeInk(marks: InkMark[], upsert: InkMark[] = [], deleted: string[] = []): InkMark[] {
  if (!Array.isArray(upsert) || !Array.isArray(deleted)) return marks;
  const removed = new Set(deleted);
  const result = new Map(marks.filter(mark => !removed.has(mark.id)).map(mark => [mark.id, mark]));
  for (const mark of upsert) {
    if (!mark || typeof mark.id !== 'string' || !Number.isInteger(mark.page) || mark.page < 1 ||
      !['pen', 'highlighter', 'note'].includes(mark.type) || !/^#[0-9a-f]{6}$/i.test(mark.color) ||
      !Number.isFinite(mark.width) || mark.width <= 0 || mark.width > 0.2 ||
      !Array.isArray(mark.points) || !mark.points.length || mark.points.length > 5000 ||
      mark.points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) ||
      (mark.type === 'note' && (typeof mark.text !== 'string' || mark.text.length > 2000))) continue;
    result.set(mark.id, mark);
  }
  return [...result.values()];
}

export function hitInk(mark: InkMark, point: InkPoint, width: number, height: number): boolean {
  const px = point.x * width, py = point.y * height;
  if (mark.type === 'note') {
    const origin = mark.points[0];
    if (!origin) return false;
    return Math.abs(py - origin.y * height) < Math.max(24, mark.width * width * 2) &&
      Math.abs(px - origin.x * width) < Math.max(65, (mark.text?.length || 1) * mark.width * width * 0.65);
  }
  const tolerance = Math.max(10, mark.width * width / 2 + 5);
  for (let i = 0; i < mark.points.length; i++) {
    const a = mark.points[Math.max(0, i - 1)], b = mark.points[i];
    const ax = a.x * width, ay = a.y * height, dx = (b.x - a.x) * width, dy = (b.y - a.y) * height;
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
    if (Math.hypot(px - ax - t * dx, py - ay - t * dy) <= tolerance) return true;
  }
  return false;
}

export function paintInk(ctx: CanvasRenderingContext2D, marks: InkMark[], width: number, height: number): void {
  for (const mark of marks) {
    if (!mark.points.length) continue;
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = mark.color;
    ctx.globalAlpha = mark.type === 'highlighter' ? 0.3 : 1;
    ctx.lineWidth = mark.width * width;
    ctx.lineCap = ctx.lineJoin = 'round';
    const first = mark.points[0];
    if (mark.type === 'note') {
      ctx.font = `${mark.width * width}px Tajawal, Arial, sans-serif`;
      ctx.textBaseline = 'top';
      const rtl = /[\u0600-\u06ff]/.test(mark.text || '');
      ctx.direction = rtl ? 'rtl' : 'ltr';
      ctx.textAlign = rtl ? 'right' : 'left';
      (mark.text || '').split('\n').forEach((line, i) => ctx.fillText(line, first.x * width, first.y * height + i * mark.width * width * 1.35));
    } else if (mark.points.length === 1) {
      ctx.beginPath(); ctx.arc(first.x * width, first.y * height, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(first.x * width, first.y * height);
      for (const p of mark.points.slice(1)) ctx.lineTo(p.x * width, p.y * height);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function inkDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('otium-page-ink', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readInk(id: string): Promise<InkMark[]> {
  const db = await inkDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('documents').objectStore('documents').get(id);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function writeInk(id: string, marks: InkMark[]): Promise<void> {
  const db = await inkDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('documents', 'readwrite');
      transaction.objectStore('documents').put(marks, id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Saving annotations was interrupted'));
    });
  } finally { db.close(); }
}
