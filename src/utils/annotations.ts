import type { TextAnnotation } from '../types';

export interface ColorOption {
  id: string;
  label: string;
  hex: string;
}

export const HIGHLIGHT_COLORS: ColorOption[] = [
  { id: 'yellow', label: 'أصفر', hex: '#fde047' },
  { id: 'green', label: 'أخضر', hex: '#86efac' },
  { id: 'cyan', label: 'سماوي', hex: '#7dd3fc' },
  { id: 'pink', label: 'وردي', hex: '#f472b6' },
  { id: 'orange', label: 'برتقالي', hex: '#fb923c' }
];

export const UNDERLINE_COLORS: ColorOption[] = [
  { id: 'amber', label: 'كهرماني', hex: '#f59e0b' },
  { id: 'red', label: 'أحمر قاني', hex: '#ef4444' },
  { id: 'blue', label: 'أزرق', hex: '#3b82f6' },
  { id: 'emerald', label: 'زمردي', hex: '#10b981' }
];

const STORAGE_PREFIX = 'otium_annos_';

export function getStoredAnnotations(docTitle: string): TextAnnotation[] {
  if (!docTitle || typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${docTitle}`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load annotations from localStorage:', err);
    return [];
  }
}

export function saveStoredAnnotations(docTitle: string, annotations: TextAnnotation[]): void {
  if (!docTitle || typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${docTitle}`, JSON.stringify(annotations));
  } catch (err) {
    console.error('Failed to save annotations to localStorage:', err);
  }
}
