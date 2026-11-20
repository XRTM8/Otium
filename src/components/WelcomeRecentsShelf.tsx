import React, { useMemo, useState } from 'react';
import { Download, ExternalLink, Search, Trash2 } from 'lucide-react';
import type { Language, getTranslations } from '../core/i18n/translations';
import { isTauriRuntime, openExternalLink } from '../platform/runtime';
import { getCurrentVersion } from '../core/updates/currentVersion';
import { selectFiles, type LibrarySort } from '../library/model';
import { BookCover } from './BookCover';
import { formatLibraryDate, formatLibraryProgressLabel, formatLibrarySize, isPagedLibraryItem, type WelcomeLibraryItem } from './welcomeRecentsHelpers';

interface WelcomeRecentsShelfProps {
  fullLibrary: boolean;
  loaded: boolean;
  currentLang: Language;
  t: ReturnType<typeof getTranslations>;
  recents: WelcomeLibraryItem[];
  libraryError: string;
  libraryLoadFailed: boolean;
  referenceNow: number;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onRetryLoad: () => void;
  onOpenRecent: (item: WelcomeLibraryItem) => void;
  onRequestDelete: (target: WelcomeLibraryItem | 'all') => void;
}

export function WelcomeRecentsShelf({ fullLibrary, loaded, currentLang, t, recents, libraryError, libraryLoadFailed,
  referenceNow, fileInputRef, onRetryLoad, onOpenRecent, onRequestDelete }: WelcomeRecentsShelfProps) {
  const ar = currentLang === 'ar';
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<LibrarySort>('recent');
  const items = useMemo(() => fullLibrary
    ? selectFiles(recents, query, 'all', [], false, sort)
    : recents.slice(0, 4), [fullLibrary, query, recents, sort]);

  return <section className="welcome-shelf">
    {(libraryError || libraryLoadFailed) && <div role="alert" className="mb-4 text-sm text-danger-ink">
      {libraryError || (ar ? 'تعذر تحميل جزء من المكتبة.' : 'Part of the library could not be loaded.')}
      <button type="button" className="ms-2 underline" onClick={onRetryLoad}>{ar ? 'إعادة المحاولة' : 'Retry'}</button>
    </div>}
    {fullLibrary && recents.length > 0 && <div className="shelf-controls">
      <label className="shelf-search"><Search size={17} />
        <input type="search" aria-label={ar ? 'بحث في المكتبة' : 'Search library'} placeholder={ar ? 'بحث باسم الملف' : 'Search by filename'}
          value={query} onChange={event => setQuery(event.target.value)} />
      </label>
      <select aria-label={ar ? 'ترتيب الملفات' : 'Sort files'} value={sort} onChange={event => setSort(event.target.value as LibrarySort)}>
        <option value="recent">{ar ? 'فُتح مؤخراً' : 'Recently opened'}</option>
        <option value="name">{ar ? 'حسب الاسم' : 'By name'}</option>
        <option value="size">{ar ? 'الأكبر حجماً' : 'Largest first'}</option>
      </select>
    </div>}
    {recents.length > 0 && <div className="shelf-label">
      <h2>{fullLibrary ? (ar ? 'الملفات' : 'Files') : (ar ? 'فُتح مؤخراً' : 'Recently opened')} <span>{items.length}</span></h2>
      {fullLibrary && !query.trim() && <button type="button" onClick={() => onRequestDelete('all')}>{t.clearAll}</button>}
    </div>}
    {items.length > 0 && <ul className={fullLibrary ? 'shelf-books' : 'shelf-recents'}>
      {items.map(item => <li key={item.id} className="shelf-item">
        <button type="button" className="shelf-file" aria-label={`${ar ? 'فتح' : 'Open'} ${item.name}`}
          onClick={() => item.available ? onOpenRecent(item) : fileInputRef.current?.click()}>
          <BookCover item={item} large={fullLibrary} />
          <span className="shelf-caption">
            <strong title={item.name}><bdi>{item.name}</bdi></strong>
            <small>{item.available ? formatLibraryProgressLabel(item, currentLang, t) : (ar ? 'أعد استيراد الملف' : 'Re-import file')}</small>
            <small className="file-detail">{fullLibrary ? <bdi dir="ltr">{formatLibrarySize(item.sizeBytes)}</bdi> : formatLibraryDate(item.lastOpened, referenceNow, currentLang, t)}</small>
            {fullLibrary && isPagedLibraryItem(item) && item.totalPages > 0 &&
              <span className="shelf-progress"><i style={{width: `${Math.max(0, Math.min(100, item.lastPage / item.totalPages * 100))}%`}} /></span>}
          </span>
        </button>
        <button type="button" className="shelf-delete" title={t.deleteTooltip}
          aria-label={`${ar ? 'حذف من المكتبة:' : 'Delete from library:'} ${item.name}`} onClick={() => onRequestDelete(item)}><Trash2 size={15} /></button>
      </li>)}
    </ul>}
    {fullLibrary && !items.length && !libraryLoadFailed && <div className="shelf-empty" role="status">
      {!loaded ? (ar ? 'جارٍ تحميل المكتبة…' : 'Loading library…') : recents.length
        ? <>{ar ? 'لا توجد ملفات بهذا الاسم.' : 'No matching files.'} <button type="button" onClick={() => setQuery('')}>{ar ? 'مسح البحث' : 'Clear search'}</button></>
        : (ar ? 'مكتبتك فارغة. افتح ملفاً ليظهر هنا.' : 'Your library is empty. Open a file to add it here.')}
    </div>}
  </section>;
}

export const WelcomeFooterDock: React.FC<{ currentLang: Language; buildLabel?: string }> = ({
  currentLang,
  buildLabel = 'Otium',
}) => {
  if (isTauriRuntime()) return null;
  return (
    <div className="w-full pt-6 pb-2 border-t border-line/40 flex flex-col items-center gap-2 text-ink select-none animate-in fade-in duration-300">
      <a
        href="https://github.com/XRTM8/Otium"
        onClick={(e) => {
          e.preventDefault();
          void openExternalLink('https://github.com/XRTM8/Otium');
        }}
        target="_blank"
        rel="noopener noreferrer"
        className="group fluid-press px-4 py-2 rounded-full chrome-surface hover:border-accent/50 hover:-translate-y-0.5 shadow-sm hover:shadow-md flex items-center gap-2 text-xs font-semibold text-ink hover:text-accent transition-all duration-200"
        title={currentLang === 'ar' ? 'تنزيل Otium' : 'Download Otium'}
      >

        <Download className="w-3.5 h-3.5 text-accent" />
        <span>
          {buildLabel}
        </span>
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-md bg-accent/10 text-accent font-semibold">
          v{getCurrentVersion()}
        </span>
        <ExternalLink className="w-3 h-3 text-ink-muted group-hover:text-accent opacity-70 group-hover:opacity-100 transition-opacity" />
      </a>

      <a
        href="https://instagram.com/ma.xrt"
        onClick={(e) => {
          e.preventDefault();
          void openExternalLink('https://instagram.com/ma.xrt');
        }}
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full hover:bg-hover text-ink-muted hover:text-ink transition-colors cursor-pointer"
        title="Instagram: @ma.xrt"
      >
        <svg
          className="w-3 h-3 text-pink-500/80 group-hover:text-pink-500 transition-colors"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
        <span className="font-medium text-[11px] text-ink-muted group-hover:text-ink transition-colors">MA.XRT</span>
        <span className="text-[10px] text-ink-faint">• Instagram</span>
      </a>
    </div>
  );
};
