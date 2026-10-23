export type ThemeMode = 'paper' | 'midnight' | 'eink' | 'amber' | 'pure' | 'amoled' | 'parchment';

export type PaperStyle = 'smooth' | 'book' | 'parchment' | 'linen' | 'kraft' | 'moleskine';

export type FontFamilyId = 'tajawal' | 'cairo' | 'amiri' | 'almarai' | 'ibm' | 'lora' | 'jakarta' | 'system';

export type ViewMode = 'continuous' | 'single' | 'dual';

export interface ReaderSettings {
  fontFamily: FontFamilyId;
  uiScale: 'compact' | 'standard' | 'relaxed';
  defaultViewMode: ViewMode;
  showToastFeedback: boolean;
}

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

export interface AnnotationRect {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
}

export interface TextAnnotation {
  id: string;
  pageNumber: number;
  type: 'highlight' | 'underline';
  color: string;
  rects: AnnotationRect[];
  text: string;
  createdAt: number;
}

