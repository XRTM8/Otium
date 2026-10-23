export type ThemeMode = 'paper' | 'midnight' | 'eink' | 'amber' | 'pure' | 'amoled' | 'parchment';

export type FontFamilyId = 'tajawal' | 'cairo' | 'amiri' | 'almarai' | 'ibm' | 'lora' | 'jakarta' | 'system';

export type ViewMode = 'continuous' | 'single' | 'dual';

export interface TocItem {
  title: string;
  pageNumber: number;
  items?: TocItem[];
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

export interface BookmarkItem {
  id: string;
  pageNumber: number;
  title?: string;
  createdAt: number;
}
