import React, { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, Search, Trash2 } from 'lucide-react';
import type { Language, getTranslations } from '../core/i18n/translations';
import { isTauriRuntime, openExternalLink } from '../platform/runtime';
import { getCurrentVersion } from '../core/updates/currentVersion';
import { kindOf, selectFiles, type LibrarySort } from '../library/model';
import { BookCover } from './BookCover';
import {
  formatLibraryDate,
  formatLibraryProgressLabel,
  formatLibrarySize,
  isPagedLibraryItem,
  type WelcomeLibraryItem,
  getLibraryNavigationState,
  updateLibraryNavigationState,
  markOpeningRecentItem,
} from './welcomeRecentsHelpers';

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
  const initialNav = getLibraryNavigationState();
  const [query, setQueryState] = useState(initialNav.query);
  const [sort, setSortState] = useState<LibrarySort>(initialNav.sort);

  const setQuery = (q: string) => {
    updateLibraryNavigationState({ query: q });
    setQueryState(q);
  };

  const setSort = (s: LibrarySort) => {
    updateLibraryNavigationState({ sort: s });
    setSortState(s);
  };

  type FilterChip = 'all' | 'pdf' | 'reading' | 'media';
  const [filterChip, setFilterChip] = useState<FilterChip>('all');

  const baseItems = useMemo(() => fullLibrary
    ? selectFiles(recents, query, 'all', [], false, sort)
    : recents.slice(0, 4), [fullLibrary, query, recents, sort]);

  const items = useMemo(() => {
    if (!fullLibrary || filterChip === 'all') return baseItems;
    if (filterChip === 'pdf') {
      return baseItems.filter(item => kindOf(item) === 'pdf');
    }
    if (filterChip === 'reading') {
      return baseItems.filter(item => isPagedLibraryItem(item) && item.lastPage > 1);
    }
    if (filterChip === 'media') {
      return baseItems.filter(item => !!item.mediaKind || /doc-|scan-/i.test(item.name));
    }
    return baseItems;
  }, [baseItems, fullLibrary, filterChip]);

  const totalSizeBytes = useMemo(() => {
    return recents.reduce((acc, item) => acc + (item.sizeBytes || 0), 0);
  }, [recents]);

  useEffect(() => {
    const lastId = getLibraryNavigationState().lastOpenedId;
    if (lastId && loaded && fullLibrary) {
      const el = document.querySelector(`[data-shelf-id="${lastId}"]`);
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [loaded, fullLibrary]);

  const handleOpenItem = (item: WelcomeLibraryItem) => {
    markOpeningRecentItem(item.id, fullLibrary);
    if (item.available) {
      onOpenRecent(item);
    } else {
      fileInputRef.current?.click();
    }
  };

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
    {fullLibrary && recents.length > 0 && (
      <div className="shelf-chips" role="tablist" aria-label={ar ? 'تصفية المكتبة' : 'Filter library'}>
        <button
          type="button"
          role="tab"
          aria-selected={filterChip === 'all'}
          className={`shelf-chip ${filterChip === 'all' ? 'active' : ''}`}
          onClick={() => setFilterChip('all')}
        >
          {ar ? 'الكل' : 'All'}
          <span className="chip-count">{recents.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filterChip === 'pdf'}
          className={`shelf-chip ${filterChip === 'pdf' ? 'active' : ''}`}
          onClick={() => setFilterChip('pdf')}
        >
          {ar ? 'مستندات PDF' : 'PDFs'}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filterChip === 'reading'}
          className={`shelf-chip ${filterChip === 'reading' ? 'active' : ''}`}
          onClick={() => setFilterChip('reading')}
        >
          {ar ? 'قيد القراءة' : 'In Progress'}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filterChip === 'media'}
          className={`shelf-chip ${filterChip === 'media' ? 'active' : ''}`}
          onClick={() => setFilterChip('media')}
        >
          {ar ? 'وسائط ومسح' : 'Media & Scans'}
        </button>
      </div>
    )}
    {recents.length > 0 && <div className="shelf-label">
      <h2>{fullLibrary ? (ar ? 'الملفات' : 'Files') : (ar ? 'فُتح مؤخراً' : 'Recently opened')} <span>{items.length}</span></h2>
      {fullLibrary && !query.trim() && <button type="button" onClick={() => onRequestDelete('all')}>{t.clearAll}</button>}
    </div>}
    {items.length > 0 && <ul className={fullLibrary ? 'shelf-books' : 'shelf-recents'}>
      {items.map(item => <li key={item.id} className="shelf-item" data-shelf-id={item.id}>
        <button
          type="button"
          className="shelf-file"
          title={!item.available ? (ar ? `الملف المحلي "${item.name}" غير متوفر على هذا الجهاز. انقر لاختيار الملف وإعادة فتحه.` : `Local file "${item.name}" is not cached. Click to select the file and restore it.`) : undefined}
          aria-label={`${ar ? (item.available ? 'فتح' : 'إعادة استيراد') : (item.available ? 'Open' : 'Re-import')} ${item.name}`}
          onClick={() => handleOpenItem(item)}
        >
          <BookCover item={item} large={fullLibrary} />
          <span className="shelf-caption">
            <strong title={item.name} className="shelf-title">
              <span className="shelf-title-text" dir="auto">
                {item.name}
              </span>
            </strong>
            <div className="shelf-meta-row">
              <small className={!item.available ? 'text-amber-500 dark:text-amber-400 font-medium' : undefined}>
                {item.available
                  ? formatLibraryProgressLabel(item, currentLang, t)
                  : (ar ? 'النسخة غير متوفرة' : 'Local copy missing')}
              </small>
              <span className="shelf-meta-dot">·</span>
              <small className="file-detail">{fullLibrary ? <bdi dir="ltr">{formatLibrarySize(item.sizeBytes)}</bdi> : formatLibraryDate(item.lastOpened, referenceNow, currentLang, t)}</small>
            </div>
            {fullLibrary && isPagedLibraryItem(item) && item.totalPages > 0 &&
              <span className="shelf-progress"><i style={{width: `${Math.max(0, Math.min(100, item.lastPage / item.totalPages * 100))}%`}} /></span>}
          </span>
        </button>
        <button
          type="button"
          className="shelf-delete"
          title={t.deleteTooltip}
          aria-label={`${ar ? 'حذف من المكتبة:' : 'Delete from library:'} ${item.name}`}
          onClick={(event) => {
            event.stopPropagation();
            onRequestDelete(item);
          }}
        >
          <Trash2 size={15} />
        </button>
      </li>)}
    </ul>}
    {fullLibrary && !items.length && !libraryLoadFailed && <div className="shelf-empty" role="status">
      {!loaded ? (ar ? 'جارٍ تحميل المكتبة…' : 'Loading library…') : recents.length
        ? <>{ar ? 'لا توجد ملفات بهذا الاسم.' : 'No matching files.'} <button type="button" onClick={() => setQuery('')}>{ar ? 'مسح البحث' : 'Clear search'}</button></>
        : (ar ? 'مكتبتك فارغة. افتح ملفاً ليظهر هنا.' : 'Your library is empty. Open a file to add it here.')}
    </div>}
    {fullLibrary && libraryLoadFailed && !recents.length && <div className="shelf-empty shelf-storage-error" role="alert">
      <p className="font-semibold text-danger-ink mb-1">{ar ? 'تعذر قراءة تخزين المكتبة' : 'Could not read library storage'}</p>
      <p className="text-xs text-ink-muted mb-3 max-w-sm mx-auto">{ar ? 'تعذر الوصول إلى قاعدة البيانات المحلية لقراءة كتبك المحفوظة.' : 'Could not access local storage to load your saved books.'}</p>
      <button type="button" className="px-3 py-1.5 rounded-lg bg-hover border border-line text-xs font-semibold" onClick={onRetryLoad}>{ar ? 'إعادة المحاولة' : 'Retry'}</button>
    </div>}
    {fullLibrary && recents.length > 0 && (
      <div className="shelf-footer-summary">
        <span>{ar ? `${recents.length} ملفات محفوظة` : `${recents.length} saved files`}</span>
        <span className="summary-dot">·</span>
        <bdi dir="ltr">{formatLibrarySize(totalSizeBytes)}</bdi>
        <span>{ar ? 'مساحة محلية مستخدمة' : 'local storage used'}</span>
      </div>
    )}
  </section>;
}

export const WelcomeFooterDock: React.FC<{ currentLang: Language; buildLabel?: string }> = ({
  currentLang,
  buildLabel = 'Otium',
}) => {
  if (isTauriRuntime()) return null;
  return (
    <footer className="w-full pt-6 pb-2 border-t border-line/40 flex flex-col items-center gap-2 text-ink select-none animate-in fade-in duration-300">
      <a
        href="https://github.com/XRTM8/Otium"
        onClick={(e) => {
          e.preventDefault();
          void openExternalLink('https://github.com/XRTM8/Otium');
        }}
        target="_blank"
        rel="noopener noreferrer"
        className="group fluid-press px-3.5 py-1.5 rounded-full chrome-surface hover:border-accent/40 shadow-xs flex items-center gap-2 text-xs font-medium text-ink hover:text-accent transition-all duration-150"
        title={currentLang === 'ar' ? 'مشروع مفتوح المصدر على GitHub' : 'Open Source on GitHub'}
      >
        <Download className="w-3.5 h-3.5 text-accent" />
        <span>{buildLabel}</span>
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-md bg-accent/10 text-accent font-semibold">
          v{getCurrentVersion()}
        </span>
        <ExternalLink className="w-3 h-3 text-ink-muted group-hover:text-accent opacity-70 group-hover:opacity-100 transition-opacity" />
      </a>
    </footer>
  );
};
