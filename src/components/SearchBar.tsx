import React, { useState, useEffect, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Search, ChevronDown, ChevronUp, X, Loader2 } from 'lucide-react';
import type { Language } from '../core/i18n/translations';
import { getTranslations } from '../core/i18n/translations';
import {
  SearchCancelledError,
  searchDocumentPages
} from '../core/search/documentSearch';

interface SearchResult {
  pageNumber: number;
}

interface SearchBarProps {
  isOpen: boolean;
  doc: PDFDocumentProxy | null;
  lang?: Language;
  initialQuery?: { query: string; id: number } | null;
  onNavigateToPage: (pageNumber: number) => void;
  onQueryChange: (query: string, activePage: number | null) => void;
  onClose: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  isOpen,
  doc,
  lang = 'ar',
  initialQuery = null,
  onNavigateToPage,
  onQueryChange,
  onClose
}) => {
  const initialKey = `${isOpen}:${initialQuery?.id ?? ''}:${initialQuery?.query ?? ''}`;
  const [queryDraft, setQueryDraft] = useState<{ key: string; value: string }>(() => ({
    key: initialKey,
    value: initialQuery?.query ?? ''
  }));
  const query = isOpen
    ? (queryDraft.key === initialKey ? queryDraft.value : (initialQuery?.query ?? ''))
    : '';
  const setQuery = (value: string) => setQueryDraft({ key: initialKey, value });

  const trimmedQuery = query.trim();
  const searchKey = `${isOpen}:${doc ? 'doc' : 'none'}:${trimmedQuery}`;
  const canSearch = isOpen && Boolean(doc) && trimmedQuery.length >= 2;
  const [searchState, setSearchState] = useState<{
    key: string;
    results: SearchResult[];
    currentIndex: number;
    done: boolean;
  }>({ key: '', results: [], currentIndex: 0, done: false });

  const results = canSearch && searchState.key === searchKey ? searchState.results : [];
  const currentIndex = canSearch && searchState.key === searchKey ? searchState.currentIndex : 0;
  const isSearching = canSearch && !(searchState.key === searchKey && searchState.done);
  const setCurrentIndex = (next: number) =>
    setSearchState((prev) =>
      prev.key === searchKey ? { ...prev, currentIndex: next } : prev
    );

  const inputRef = useRef<HTMLInputElement>(null);
  const onNavigateToPageRef = useRef(onNavigateToPage);
  const onQueryChangeRef = useRef(onQueryChange);
  const t = getTranslations(lang);

  useEffect(() => {
    onNavigateToPageRef.current = onNavigateToPage;
  }, [onNavigateToPage]);

  useEffect(() => {
    onQueryChangeRef.current = onQueryChange;
  }, [onQueryChange]);

  useEffect(() => {
    if (!isOpen) return;
    const delay = initialQuery?.query ? 40 : 50;
    const selectText = Boolean(initialQuery?.query);
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      if (selectText) inputRef.current?.select();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [isOpen, initialQuery]);

  useEffect(() => {
    if (!isOpen) return;

    const trimmed = trimmedQuery;
    if (!doc || trimmed.length < 2) {
      onQueryChangeRef.current('', null);
      return;
    }

    const controller = new AbortController();

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const matches = await searchDocumentPages(doc, trimmed, controller.signal);
          if (controller.signal.aborted) return;

          setSearchState({
            key: searchKey,
            results: matches.map((pageNumber) => ({ pageNumber })),
            currentIndex: 0,
            done: true
          });

          const firstMatch = matches[0];
          if (firstMatch !== undefined) {
            onNavigateToPageRef.current(firstMatch);
            onQueryChangeRef.current(trimmed, firstMatch);
          } else {
            onQueryChangeRef.current(trimmed, null);
          }
        } catch (error) {
          if (!controller.signal.aborted && !(error instanceof SearchCancelledError)) {
            console.warn('Search error:', error);
            setSearchState({ key: searchKey, results: [], currentIndex: 0, done: true });
            onQueryChangeRef.current(trimmed, null);
          }
        }
      })();
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [doc, isOpen, searchKey, trimmedQuery]);

  const nextMatch = () => {
    if (results.length === 0) return;
    const next = (currentIndex + 1) % results.length;
    setCurrentIndex(next);
    const targetPage = results[next]?.pageNumber;
    if (targetPage === undefined) return;
    onNavigateToPage(targetPage);
    onQueryChange(query.trim(), targetPage);
  };

  const prevMatch = () => {
    if (results.length === 0) return;
    const prev = (currentIndex - 1 + results.length) % results.length;
    setCurrentIndex(prev);
    const targetPage = results[prev]?.pageNumber;
    if (targetPage === undefined) return;
    onNavigateToPage(targetPage);
    onQueryChange(query.trim(), targetPage);
  };

  if (!isOpen) return null;

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="fixed top-16 inset-x-4 sm:inset-x-auto sm:end-6 z-40 flex justify-center fluid-pop"
    >
      <div className="chrome-surface flex w-full max-w-sm items-center gap-1.5 rounded-2xl p-1.5 text-xs text-ink sm:w-auto shadow-2xl">
        <Search className="ms-1 w-3.5 h-3.5 text-ink-muted shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              if (event.shiftKey) prevMatch();
              else nextMatch();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }
          }}
          placeholder={t.searchPlaceholder}
          className="flex-1 rounded-lg bg-transparent px-1.5 py-1 text-xs text-ink outline-none placeholder:text-ink-faint focus:bg-hover-subtle sm:w-48 font-sans"
        />

        {isSearching && <Loader2 className="w-3.5 h-3.5 animate-spin text-accent shrink-0" />}

        {!isSearching && query.trim().length >= 2 && results.length === 0 && (
          <span className={`text-[10px] text-ink-faint px-1 select-none ${lang === 'ar' ? 'font-sans' : 'font-mono'}`}>
            {lang === 'ar' ? 'لا نتائج' : 'No results'}
          </span>
        )}

        {results.length > 0 && (
          <span className="font-mono text-[10px] text-ink-muted px-1 select-none">
            {currentIndex + 1} / {results.length}
          </span>
        )}

        {results.length > 0 && (
          <div className="flex items-center gap-0.5 rounded-lg bg-hover-subtle">
            <button
              onClick={prevMatch}
              title={lang === 'ar' ? 'النتيجة السابقة (Shift + Enter)' : 'Previous result (Shift + Enter)'}
              className="toolbar-icon h-7 w-7 cursor-pointer"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={nextMatch}
              title={lang === 'ar' ? 'النتيجة التالية (Enter)' : 'Next result (Enter)'}
              className="toolbar-icon h-7 w-7 cursor-pointer"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <button
          onClick={onClose}
          className="toolbar-icon cursor-pointer"
          title={lang === 'ar' ? 'إغلاق البحث' : 'Close search'}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
