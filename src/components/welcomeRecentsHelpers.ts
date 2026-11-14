import type { getTranslations, Language } from '../core/i18n/translations';
import type { RecentDocItem } from '../core/storage/documents';
import { formatTime } from '../media/media';
import type { MediaKind } from '../media/library';

export type WelcomeLibraryItem = RecentDocItem & { mediaKind?: MediaKind; position?: number };

export function isPagedLibraryItem(item: WelcomeLibraryItem): boolean {
  return !item.mediaKind || item.mediaKind === 'presentation';
}

export function formatLibraryProgressLabel(
  item: WelcomeLibraryItem,
  currentLang: Language,
  t: ReturnType<typeof getTranslations>
): string {
  if (isPagedLibraryItem(item)) return t.pageOf(item.lastPage, item.totalPages);
  const names = currentLang === 'ar'
    ? { video: 'فيديو', audio: 'صوت', image: 'صورة', text: 'نص', presentation: 'شرائح' }
    : { video: 'Video', audio: 'Audio', image: 'Image', text: 'Text', presentation: 'Slides' };
  return `${names[item.mediaKind!]}${item.position ? ` · ${formatTime(item.position)}` : ''}`;
}

export function formatLibraryDate(
  timestamp: number,
  referenceNow: number,
  currentLang: Language,
  t: ReturnType<typeof getTranslations>
): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  const now = new Date(referenceNow);

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  const timeStr = date.toLocaleTimeString(currentLang === 'ar' ? 'ar-u-nu-latn' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isToday) return t.todayAt(timeStr);
  if (isYesterday) return t.yesterdayAt(timeStr);

  return date.toLocaleDateString(currentLang === 'ar' ? 'ar-u-nu-latn' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatLibrarySize(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
