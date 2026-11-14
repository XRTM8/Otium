import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ThemeMode, ViewMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { ignoreBenignRejection } from '../core/utils/bestEffort';
import { saveViewMode } from '../core/settings/preferences';
import { computeOptimalPageScale } from '../core/reader/device';
import { beamService } from '../board/beam/beamService';

export interface ReaderCapabilities {
  keyboard: boolean;
  dragDrop: boolean;
}

export interface PasswordModalState {
  isOpen: boolean;
  isIncorrect: boolean;
  callback: ((password: string) => void) | null;
  title: string;
}

export const EMPTY_PASSWORD_MODAL: PasswordModalState = {
  isOpen: false,
  isIncorrect: false,
  callback: null,
  title: '',
};

export const THEME_ORDER: ThemeMode[] = [
  'paper',
  'amber',
  'amoled',
  'eink',
  'midnight',
  'pure',
  'parchment',
  'sakura',
  'forest',
  'nordic',
];

export const SAMPLE_DOCUMENT_NAME = 'The Art of Vibe Reading.pdf';

/**
 * Page-turn physics. A wheel gesture or a swipe must travel this far before it
 * flips a page, and a short cooldown prevents trackpads from tumbling through
 * several pages when one gesture ends.
 */
export const WHEEL_TURN_THRESHOLD = 96;
export const WHEEL_TURN_COOLDOWN_MS = 320;

export interface ZoomAnchor {
  element: HTMLElement;
  fractionX: number;
  fractionY: number;
}

export function destroyDocumentSoon(doc: PDFDocumentProxy | null): void {
  if (!doc) return;
  window.setTimeout(() => {
    ignoreBenignRejection(doc.loadingTask.destroy(), 'pdf-loading-task-destroy');
  }, 250);
}

export function describeDocumentError(error: unknown, lang?: Language): string {
  const ar = lang === 'ar';
  if (error instanceof Error) {
    if (error.name === 'InvalidPDFException') {
      return ar ? 'هذا الملف ليس مستند PDF صالحاً.' : 'This file is not a valid PDF document.';
    }
    if (error.name === 'PasswordException') {
      return ar ? 'هذا المستند محمي بكلمة مرور.' : 'This document is password protected.';
    }
    if (error.name === 'MissingPDFException') {
      return ar ? 'تعذر العثور على الملف المحدد.' : 'The selected file could not be found.';
    }
    return error.message || (ar ? 'تعذر فتح هذا المستند.' : 'Could not open this document.');
  }
  return ar ? 'تعذر فتح هذا المستند.' : 'Could not open this document.';
}

export function detectIsArabicScript(text: string): boolean {
  if (!text) return false;
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
  const arabicMatches = text.match(arabicRegex);
  const arabicCount = arabicMatches ? arabicMatches.length : 0;
  const latinRegex = /[a-zA-Z]/g;
  const latinMatches = text.match(latinRegex);
  const latinCount = latinMatches ? latinMatches.length : 0;
  if (arabicCount === 0 && latinCount === 0) return false;
  return arabicCount > latinCount;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'button, a, input, textarea, select, [role="button"], [contenteditable="true"]'
    )
  );
}

export function toggleDocumentFullscreen(): void {
  if (typeof document === 'undefined') return;
  const docWithVendor = document as Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
    mozCancelFullScreen?: () => Promise<void> | void;
    msExitFullscreen?: () => Promise<void> | void;
  };
  const root = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    mozRequestFullScreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
  };
  const isFull = Boolean(
    document.fullscreenElement ||
    docWithVendor.webkitFullscreenElement ||
    docWithVendor.mozFullScreenElement ||
    docWithVendor.msFullscreenElement
  );
  if (!isFull) {
    const request =
      root.requestFullscreen ||
      root.webkitRequestFullscreen ||
      root.mozRequestFullScreen ||
      root.msRequestFullscreen;
    if (typeof request === 'function') {
      ignoreBenignRejection(request.call(root), 'fullscreen-request');
    }
  } else {
    const exit =
      document.exitFullscreen ||
      docWithVendor.webkitExitFullscreen ||
      docWithVendor.mozCancelFullScreen ||
      docWithVendor.msExitFullscreen;
    if (typeof exit === 'function') {
      ignoreBenignRejection(exit.call(document), 'fullscreen-exit');
    }
  }
}

export function observeDocumentFullscreen(onChange: (fullscreen: boolean) => void): () => void {
  if (typeof document === 'undefined') return () => {};
  const docWithVendor = document as Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };
  const handleFullscreenChange = () => {
    onChange(
      Boolean(
        document.fullscreenElement ||
        docWithVendor.webkitFullscreenElement ||
        docWithVendor.mozFullScreenElement ||
        docWithVendor.msFullscreenElement
      )
    );
  };
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
  document.addEventListener('mozfullscreenchange', handleFullscreenChange);
  document.addEventListener('MSFullscreenChange', handleFullscreenChange);
  return () => {
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
    document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
  };
}

export function computeNextViewModeFitScale(
  nextMode: ViewMode,
  basePageSize: { width: number; height: number },
  container: HTMLDivElement | null,
  chromeInset: number,
): number | null {
  saveViewMode(nextMode);
  if (beamService.getRole() === 'sender') beamService.sendViewMode(nextMode);
  if (!basePageSize.width || !basePageSize.height || typeof window === 'undefined') return null;
  return computeOptimalPageScale(
    basePageSize.width,
    basePageSize.height,
    container?.clientWidth || window.innerWidth,
    (container?.clientHeight || window.innerHeight) - chromeInset,
    nextMode,
  );
}
