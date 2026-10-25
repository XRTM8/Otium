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
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
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
    if (!isOpen) {
      setQuery('');
      setResults([]);
      setCurrentIndex(0);
      setIsSearching(false);
      return;
    }

    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  // Selecting text and choosing "Search" opens this bar with the quote already
  // entered, so the user does not have to copy and paste it again.
  useEffect(() => {
    if (!isOpen || !initialQuery?.query) return;
    setQuery(initialQuery.query);
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 40);
    return () => window.clearTimeout(timer);
  }, [isOpen, initialQuery]);

  useEffect(() => {
    if (!isOpen) return;

    const trimmed = query.trim();
    if (!doc || trimmed.length < 2) {
      setResults([]);
      setCurrentIndex(0);
      setIsSearching(false);
      onQueryChangeRef.current('', null);
      return;
    }

    const controller = new AbortController();
    setIsSearching(true);

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const matches = await searchDocumentPages(doc, trimmed, controller.signal);
          if (controller.signal.aborted) return;

          setResults(matches.map((pageNumber) => ({ pageNumber })));
          setCurrentIndex(0);

          if (matches.length > 0) {
            onNavigateToPageRef.current(matches[0]);
            onQueryChangeRef.current(trimmed, matches[0]);
          } else {
            onQueryChangeRef.current(trimmed, null);
          }
        } catch (error) {
          if (!controller.signal.aborted && !(error instanceof SearchCancelledError)) {
            console.warn('Search error:', error);
            onQueryChangeRef.current(trimmed, null);
          }
        } finally {
          if (!controller.signal.aborted) {
            setIsSearching(false);
          }
        }
      })();
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [doc, isOpen, query]);

  const nextMatch = () => {
    if (results.length === 0) return;
    const next = (currentIndex + 1) % results.length;
    setCurrentIndex(next);
    const targetPage = results[next].pageNumber;
    onNavigateToPage(targetPage);
    onQueryChange(query.trim(), targetPage);
  };

  const prevMatch = () => {
    if (results.length === 0) return;
    const prev = (currentIndex - 1 + results.length) % results.length;
    setCurrentIndex(prev);
    const targetPage = results[prev].pageNumber;
    onNavigateToPage(targetPage);
    onQueryChange(query.trim(), targetPage);
  };

  if (!isOpen) return null;

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="fixed top-16 inset-x-4 sm:inset-x-auto sm:right-6 z-40 flex justify-center animate-in fade-in slide-in-from-top-2 duration-150"
    >
      <div className="chrome-surface flex w-full max-w-sm items-center gap-1.5 rounded-2xl p-1.5 text-xs text-ink sm:w-auto">
        <Search className="ml-1 w-3.5 h-3.5 text-ink-muted shrink-0" />
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
              onClose();
            }
          }}
          placeholder={t.searchPlaceholder}
          className="flex-1 rounded-lg bg-transparent px-1.5 py-1 text-xs text-ink outline-none placeholder:text-ink-faint focus:bg-hover-subtle sm:w-48"
        />

        {isSearching && <Loader2 className="w-3.5 h-3.5 animate-spin text-accent shrink-0" />}

        {!isSearching && query.trim().length >= 2 && results.length === 0 && (
          <span className="font-mono text-[10px] text-ink-faint px-1 select-none">
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
              className="toolbar-icon h-7 w-7"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={nextMatch}
              title={lang === 'ar' ? 'النتيجة التالية (Enter)' : 'Next result (Enter)'}
              className="toolbar-icon h-7 w-7"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <button
          onClick={onClose}
          className="toolbar-icon"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
