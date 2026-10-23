export type ThemeMode = 'paper' | 'midnight' | 'eink' | 'amber' | 'pure';

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
