import React, { useState, useEffect, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Search, ChevronDown, ChevronUp, X, Loader2 } from 'lucide-react';
import type { Language } from '../utils/translations';
import { getTranslations } from '../utils/translations';

interface SearchResult {
  pageNumber: number;
}

interface SearchBarProps {
  isOpen: boolean;
  doc: PDFDocumentProxy | null;
  lang?: Language;
  onNavigateToPage: (pageNumber: number) => void;
  onQueryChange: (query: string, activePage: number | null) => void;
  onClose: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  isOpen,
  doc,
  lang = 'ar',
  onNavigateToPage,
  onQueryChange,
  onClose
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const searchRunRef = useRef(0);
  const onQueryChangeRef = useRef(onQueryChange);
  const t = getTranslations(lang);

  useEffect(() => {
    onQueryChangeRef.current = onQueryChange;
  }, [onQueryChange]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      searchRunRef.current += 1;
      setQuery('');
      setResults([]);
      setCurrentIndex(0);
      setIsSearching(false);
      onQueryChangeRef.current('', null);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
      searchRunRef.current += 1;
    };
  }, []);

  const performSearch = async (searchTerm: string) => {
    const runId = ++searchRunRef.current;
    const normalized = searchTerm.trim().toLowerCase();
    const matches: SearchResult[] = [];

    setIsSearching(true);
    onQueryChangeRef.current('', null);

    try {
      for (let i = 1; i <= doc!.numPages; i++) {
        if (runId !== searchRunRef.current) return;

        const page = await doc!.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ')
          .toLowerCase();

        if (pageText.includes(normalized)) {
          matches.push({ pageNumber: i });
        }

        if (i % 8 === 0) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      }

      if (runId !== searchRunRef.current) return;

      setResults(matches);
      if (matches.length > 0) {
        setCurrentIndex(0);
        onNavigateToPage(matches[0].pageNumber);
        onQueryChangeRef.current(searchTerm.trim(), matches[0].pageNumber);
      } else {
        onQueryChangeRef.current(searchTerm.trim(), null);
      }
    } catch (err) {
      if (runId === searchRunRef.current) {
        console.warn('Search error:', err);
      }
    } finally {
      if (runId === searchRunRef.current) {
        setIsSearching(false);
      }
    }
  };

  const handleSearch = (searchTerm: string) => {
    setQuery(searchTerm);

    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    searchRunRef.current += 1;

    const trimmed = searchTerm.trim();
    if (!doc || trimmed.length < 2) {
      setResults([]);
      setCurrentIndex(0);
      setIsSearching(false);
      onQueryChangeRef.current('', null);
      return;
    }

    setResults([]);
    setCurrentIndex(0);
    setIsSearching(true);
    onQueryChangeRef.current('', null);

    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void performSearch(trimmed);
    }, 250);
  };

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
      <div className="flex items-center gap-1.5 p-1.5 pl-3 w-full max-w-sm sm:w-auto rounded-2xl bg-neutral-900/95 border border-white/10 shadow-2xl backdrop-blur-2xl text-neutral-200 text-xs">
        <Search className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (e.shiftKey) prevMatch();
              else nextMatch();
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
          placeholder={t.searchPlaceholder}
          className="flex-1 sm:w-44 bg-transparent text-white placeholder:text-neutral-500 focus:outline-none text-xs"
        />

        {isSearching && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />}

        {results.length > 0 && (
          <span className="font-mono text-[10px] text-neutral-400 px-1 select-none">
            {currentIndex + 1} / {results.length}
          </span>
        )}

        {results.length > 0 && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={prevMatch}
              title="النتيجة السابقة (Shift + Enter)"
              className="p-1 rounded hover:bg-white/10 text-neutral-300 transition-colors"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={nextMatch}
              title="النتيجة التالية (Enter)"
              className="p-1 rounded hover:bg-white/10 text-neutral-300 transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <button
          onClick={onClose}
          className="p-1 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors ml-1"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
