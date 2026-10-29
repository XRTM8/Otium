export interface Point {
  x: number;
  y: number;
}

export interface Quad {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

export type FilterType = 'magic' | 'clean' | 'vibrant' | 'bw' | 'grayscale' | 'vintage' | 'original';

export type CropMode = 'full' | 'auto';

export type DocumentCategory = 'all' | 'work' | 'personal' | 'bills' | 'ids' | 'study';

export interface DocumentAnalysisResult {
  quad: Quad;
  confidence: number;
  isDocumentPresent: boolean;
  orientation: 'portrait' | 'landscape';
  aspectCategory: 'a4' | 'idcard' | 'receipt' | 'book' | 'unknown';
  sharpness: number;
}

export interface ScannedPage {
  id: string;
  thumbnailDataUrl: string;
  quad: Quad;
  filter: FilterType;
  timestamp: number;
}

export type ScanStep = 'camera' | 'crop' | 'review';
