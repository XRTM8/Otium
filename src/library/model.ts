import type { RecentDocItem } from '../core/storage/documents';
import type { MediaKind } from '../media/library';
import { localStorage } from '../platform/storage';
export type LibraryItem = RecentDocItem & { mediaKind?: MediaKind; position?: number };
export type FileKind = 'pdf' | MediaKind;
export type LibrarySort = 'recent' | 'name' | 'size';
export const kindOf = (item: LibraryItem): FileKind => item.mediaKind ?? 'pdf';
const normalize = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, '').toLocaleLowerCase();
export function selectFiles(items: LibraryItem[], query: string, kind: 'all' | FileKind, favorites: string[], onlyFavorites: boolean, sort: LibrarySort) {
  const search = normalize(query.trim()), starred = new Set(favorites);
  return items.filter(item => (!search || normalize(item.name).includes(search)) && (kind === 'all' || kindOf(item) === kind) && (!onlyFavorites || starred.has(item.id)))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : sort === 'size' ? b.sizeBytes - a.sizeBytes : b.lastOpened - a.lastOpened);
}
export function readFavorites(): string[] {
  try { const value: unknown = JSON.parse(localStorage.getItem('library-favorites-v1') || '[]'); return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length <= 180))].slice(0, 500) : []; } catch { return []; }
}
export function writeFavorites(ids: string[]) { try { localStorage.setItem('library-favorites-v1', JSON.stringify(ids.slice(0, 500))); return true; } catch { return false; } }
export function formatBytes(bytes: number) { return bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : bytes > 0 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : '—'; }
