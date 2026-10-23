export type ThemeMode = 'paper' | 'midnight' | 'eink' | 'amber' | 'pure' | 'amoled' | 'parchment';

export type PaperStyle = 'smooth' | 'book' | 'parchment' | 'linen' | 'kraft' | 'moleskine';

export type ViewMode = 'continuous' | 'single' | 'dual';

export interface DocumentMetadata {
  title: string;
  author?: string;
  numPages: number;
  fileSize?: string;
  fingerprint: string;
}

export interface TocItem {
  title: string;
  pageNumber: number;
  items?: TocItem[];
}

export interface RecentDoc {
  id: string;
  name: string;
  lastOpened: number;
  lastPage: number;
  totalPages: number;
}
