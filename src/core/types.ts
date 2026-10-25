export type ThemeMode = 'paper' | 'midnight' | 'eink' | 'amber' | 'pure' | 'amoled' | 'parchment';

export type FontFamilyId = 'tajawal' | 'cairo' | 'amiri' | 'almarai' | 'ibm' | 'lora' | 'jakarta' | 'system';

export type ViewMode = 'continuous' | 'single' | 'dual';

export interface TocItem {
  title: string;
  pageNumber: number;
  items?: TocItem[];
}

/**
 * Page-relative rectangle. Values are normalised to the page view-box (0..1),
 * so a highlight survives zoom, display scaling and DPI changes.
 */
export interface AnnotationRect {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
}

/** Normalised quad point: [x1, y1, x2, y2] relative to the page view-box. */
export type AnnotationQuad = [number, number, number, number];

export interface TextAnnotation {
  id: string;
  pageNumber: number;
  type: 'highlight' | 'underline';
  color: string;
  rects: AnnotationRect[];
  /** Optional standards-friendly representation of every line box. */
  quadPoints?: AnnotationQuad[];
  text: string;
  note?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface BookmarkItem {
  id: string;
  pageNumber: number;
  title?: string;
  createdAt: number;
}

