export interface TeachingPreferences {
  position: 'left' | 'center' | 'right';
  offset: number;
  size: number;
  color: string;
  width: number;
  stylusOnly: boolean;
  /** The whiteboard is an optional teaching workspace, never shown by default. */
  boardEnabled: boolean;
}
export const DEFAULT_TEACHING: TeachingPreferences = { position: 'center', offset: 12, size: 52, color: '#e11d48', width: 4, stylusOnly: false, boardEnabled: false };
const KEY = 'otium-teaching-preferences-v1';
export function normalizeTeaching(value: Partial<TeachingPreferences> | null): TeachingPreferences {
  const v = value || {};
  return {
    position: v.position === 'left' || v.position === 'right' ? v.position : 'center',
    offset: Number.isFinite(v.offset) ? Math.max(8, Math.min(120, v.offset!)) : 12,
    size: Number.isFinite(v.size) ? Math.max(44, Math.min(64, v.size!)) : 52,
    color: typeof v.color === 'string' && /^#[\da-f]{6}$/i.test(v.color) ? v.color : DEFAULT_TEACHING.color,
    width: Number.isFinite(v.width) ? Math.max(2, Math.min(12, v.width!)) : 4,
    stylusOnly: v.stylusOnly === true,
    boardEnabled: v.boardEnabled === true
  };
}
export function readTeaching(): TeachingPreferences {
  try { return normalizeTeaching(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return { ...DEFAULT_TEACHING }; }
}
export function saveTeaching(value: TeachingPreferences): void {
  try { localStorage.setItem(KEY, JSON.stringify(normalizeTeaching(value))); } catch { /* Device privacy settings may disable preferences. */ }
}
