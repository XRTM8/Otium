import type { BookmarkItem, FontFamilyId, TextAnnotation, ThemeMode, ViewMode } from '../types';
import type { Language } from '../i18n/translations';
import { normalizeAnnotation } from './annotations';

export const BACKUP_FORMAT = 'otium-backup';
export const BACKUP_VERSION = 1;

const THEMES: ThemeMode[] = ['paper', 'midnight', 'eink', 'amber', 'pure', 'amoled', 'parchment'];
const VIEW_MODES: ViewMode[] = ['continuous', 'single', 'dual'];
const FONT_IDS: FontFamilyId[] = [
  'tajawal',
  'cairo',
  'amiri',
  'almarai',
  'ibm',
  'lora',
  'jakarta',
  'system'
];

export interface BackupPreferences {
  theme?: ThemeMode;
  language?: Language;
  viewMode?: ViewMode;
  fontFamily?: FontFamilyId;
}

export interface BackupDocument {
  id: string;
  name: string;
  totalPages: number;
  lastPage: number;
  lastOpened: number;
  sizeBytes: number;
  annotations: TextAnnotation[];
  bookmarks: BookmarkItem[];
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  appVersion: string;
  preferences?: BackupPreferences;
  documents: BackupDocument[];
}

export interface RestoreSummary {
  documents: number;
  annotations: number;
  bookmarks: number;
  preferences?: BackupPreferences;
}

export class BackupValidationError extends Error {
  readonly code: 'invalid-json' | 'invalid-format' | 'unsupported-version' | 'invalid-document';

  constructor(
    code: 'invalid-json' | 'invalid-format' | 'unsupported-version' | 'invalid-document',
    message: string
  ) {
    super(message);
    this.name = 'BackupValidationError';
    this.code = code;
  }
}

function clampPage(value: unknown, totalPages: number): number {
  const page = Math.round(Number(value));
  if (!Number.isFinite(page)) return 1;
  return Math.min(totalPages, Math.max(1, page));
}

function sanitiseBookmark(raw: unknown, totalPages: number): BookmarkItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<BookmarkItem>;
  if (typeof value.id !== 'string' || !value.id) return null;
  if (!Number.isFinite(value.pageNumber)) return null;

  return {
    id: value.id,
    pageNumber: clampPage(value.pageNumber, totalPages),
    createdAt: Number.isFinite(value.createdAt) ? (value.createdAt as number) : Date.now()
  };
}

export function sanitiseBackupDocument(raw: unknown): BackupDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<BackupDocument>;
  if (typeof value.id !== 'string' || !value.id.trim()) return null;
  if (typeof value.name !== 'string' || !value.name.trim()) return null;
  if (!Number.isFinite(value.totalPages) || (value.totalPages as number) < 1) return null;

  const totalPages = Math.min(100_000, Math.round(value.totalPages as number));
  const annotations = Array.isArray(value.annotations)
    ? value.annotations
        .map(normalizeAnnotation)
        .filter((annotation): annotation is TextAnnotation => annotation !== null)
    : [];
  const bookmarks = Array.isArray(value.bookmarks)
    ? value.bookmarks
        .map((bookmark) => sanitiseBookmark(bookmark, totalPages))
        .filter((bookmark): bookmark is BookmarkItem => bookmark !== null)
    : [];

  return {
    id: value.id.trim().slice(0, 256),
    name: value.name.trim().slice(0, 512),
    totalPages,
    lastPage: clampPage(value.lastPage, totalPages),
    lastOpened: Number.isFinite(value.lastOpened) ? (value.lastOpened as number) : Date.now(),
    sizeBytes: Math.max(0, Number(value.sizeBytes) || 0),
    annotations,
    bookmarks
  };
}

function sanitisePreferences(raw: unknown): BackupPreferences | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as BackupPreferences;
  const preferences: BackupPreferences = {};

  if (THEMES.includes(value.theme as ThemeMode)) preferences.theme = value.theme;
  if (value.language === 'ar' || value.language === 'en') preferences.language = value.language;
  if (VIEW_MODES.includes(value.viewMode as ViewMode)) preferences.viewMode = value.viewMode;
  if (FONT_IDS.includes(value.fontFamily as FontFamilyId)) {
    preferences.fontFamily = value.fontFamily;
  }

  return Object.keys(preferences).length > 0 ? preferences : undefined;
}

export function buildBackupFile(input: {
  documents: BackupDocument[];
  preferences?: BackupPreferences;
  appVersion: string;
  exportedAt?: Date;
}): BackupFile {
  const documents = input.documents
    .map(sanitiseBackupDocument)
    .filter((document): document is BackupDocument => document !== null)
    .sort((a, b) => b.lastOpened - a.lastOpened);

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: (input.exportedAt ?? new Date()).toISOString(),
    appVersion: input.appVersion,
    preferences: sanitisePreferences(input.preferences),
    documents
  };
}

export function serialiseBackupFile(file: BackupFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function parseBackupFile(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupValidationError('invalid-json', 'The backup is not valid JSON.');
  }

  if (!raw || typeof raw !== 'object') {
    throw new BackupValidationError('invalid-format', 'The backup has an unexpected shape.');
  }

  const value = raw as Partial<BackupFile>;
  if (value.format !== BACKUP_FORMAT) {
    throw new BackupValidationError('invalid-format', 'This is not an Otium backup.');
  }
  if (value.version !== BACKUP_VERSION) {
    throw new BackupValidationError(
      'unsupported-version',
      'This backup was created by a newer Otium version.'
    );
  }
  if (!Array.isArray(value.documents)) {
    throw new BackupValidationError('invalid-document', 'The backup contains no documents list.');
  }

  const documents = value.documents.map(sanitiseBackupDocument);
  if (documents.some((document) => document === null)) {
    throw new BackupValidationError('invalid-document', 'A document entry is incomplete.');
  }

  const parsedDocuments = documents as BackupDocument[];
  if (parsedDocuments.length > 500) {
    throw new BackupValidationError('invalid-document', 'The backup contains too many documents.');
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt:
      typeof value.exportedAt === 'string' && !Number.isNaN(Date.parse(value.exportedAt))
        ? value.exportedAt
        : new Date().toISOString(),
    appVersion: typeof value.appVersion === 'string' ? value.appVersion.slice(0, 64) : 'unknown',
    preferences: sanitisePreferences(value.preferences),
    documents: parsedDocuments
  };
}

export function mergeAnnotations(
  existing: TextAnnotation[],
  incoming: TextAnnotation[]
): TextAnnotation[] {
  const byId = new Map<string, TextAnnotation>();
  for (const annotation of existing) byId.set(annotation.id, annotation);
  for (const annotation of incoming) byId.set(annotation.id, annotation);

  return [...byId.values()].sort(
    (a, b) =>
      a.pageNumber - b.pageNumber ||
      (a.createdAt || 0) - (b.createdAt || 0) ||
      a.id.localeCompare(b.id)
  );
}
