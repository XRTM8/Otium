import type { AnnotationQuad, AnnotationRect, TextAnnotation } from '../core/types';
import { normalizeCopiedArabicText } from '../core/search/arabic';
import { copyTextToClipboard } from '../core/utils/clipboard';

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SelectionState {
  text: string;
  pageNumber: number;
  rects: AnnotationRect[];
  quadPoints: AnnotationQuad[];
  screenRects: ScreenRect[];
  coords: { x: number; y: number; isTop: boolean };
}

export interface MergedRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const SELECTION_MENU_LABELS = {
  ar: {
    highlight: 'تظليل',
    underline: 'تسطير',
    highlightColor: 'اختر لون التظليل',
    clipToBoard: 'قص للسبورة',
    copy: 'نسخ',
    copied: 'تم النسخ',
    note: 'ملاحظة',
    search: 'بحث',
    speak: 'استماع',
    stop: 'إيقاف',
    remove: 'إزالة',
    close: 'إلغاء',
    notePlaceholder: 'اكتب ملاحظتك على هذا الاقتباس…',
    save: 'حفظ الملاحظة',
    cancel: 'إلغاء',
    selectedText: 'النص المحدد',
    speechUnsupported: 'الاستماع غير مدعوم على هذا الجهاز.',
    speechFailed: 'تعذر تشغيل الصوت. حاول مرة أخرى.',
    speechNoArabicVoice: 'لا يوجد صوت عربي مثبت. ثبّت حزمة صوت عربية من إعدادات النظام.',
    speechNoEnglishVoice: 'لا يوجد صوت إنجليزي مثبت. ثبّت حزمة صوت إنجليزية من إعدادات النظام.',
    voiceSettings: 'إعدادات الصوت'
  },
  en: {
    highlight: 'Highlight',
    underline: 'Underline',
    highlightColor: 'Highlight colour',
    clipToBoard: 'Clip to Board',
    copy: 'Copy',
    copied: 'Copied',
    note: 'Note',
    search: 'Search',
    speak: 'Speak',
    stop: 'Stop',
    remove: 'Remove',
    close: 'Close',
    notePlaceholder: 'Add a note to this quote…',
    save: 'Save note',
    cancel: 'Cancel',
    selectedText: 'Selected text',
    speechUnsupported: 'Listening is not supported on this device.',
    speechFailed: 'Could not start speech. Please try again.',
    speechNoArabicVoice: 'No Arabic voice is installed. Add one from the system voice settings.',
    speechNoEnglishVoice: 'No English voice is installed. Add one from the system voice settings.',
    voiceSettings: 'Voice settings'
  }
} as const;

/**
 * Extracts client rects only for non-whitespace character ranges inside the
 * selection so PDF.js whitespace spans do not inflate highlight boxes into margins.
 */
export function getAccurateSelectionRects(range: Range): DOMRect[] {
  const container = range.commonAncestorContainer;
  const root =
    container.nodeType === Node.ELEMENT_NODE
      ? (container as HTMLElement)
      : container.parentElement || document.body;

  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const rects: DOMRect[] = [];
    let node = walker.nextNode() as Text | null;

    while (node) {
      const nodeText = node.nodeValue || '';
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : nodeText.length;

      const slice = nodeText.slice(start, end);
      const leadingSpaces = slice.match(/^\s*/)?.[0].length || 0;
      const trailingSpaces = slice.match(/\s*$/)?.[0].length || 0;

      const trimmedStart = start + leadingSpaces;
      const trimmedEnd = end - trailingSpaces;

      if (trimmedStart < trimmedEnd) {
        const subRange = document.createRange();
        subRange.setStart(node, trimmedStart);
        subRange.setEnd(node, trimmedEnd);
        const subRects = Array.from(subRange.getClientRects());
        for (const r of subRects) {
          if (r.width > 0.5 && r.height > 0.5) {
            rects.push(r);
          }
        }
      }

      node = walker.nextNode() as Text | null;
    }

    if (rects.length > 0) return rects;
  } catch {
    // Fall back to native getClientRects if tree walking fails
  }

  return Array.from(range.getClientRects());
}

/**
 * Merges per-glyph client rects from PDF.js text selection into one box per visual line.
 */
export function mergeSelectionRects(rawRects: DOMRect[], pageRect: DOMRect): MergedRect[] {
  const lines: MergedRect[] = [];

  for (const rect of rawRects) {
    if (rect.width < 1 || rect.height < 1) continue;
    if (rect.bottom < pageRect.top || rect.top > pageRect.bottom) continue;

    const left = Math.max(pageRect.left, rect.left);
    const right = Math.min(pageRect.right, rect.right);
    const top = Math.max(pageRect.top, rect.top);
    const bottom = Math.min(pageRect.bottom, rect.bottom);
    if (right - left < 1 || bottom - top < 1) continue;

    const existing = lines.find((line) => {
      const lineH = Math.max(line.bottom - line.top, bottom - top);
      const verticalOverlap = Math.min(line.bottom, bottom) - Math.max(line.top, top);
      const sameRow =
        verticalOverlap > lineH * 0.25 ||
        Math.abs((line.top + line.bottom) / 2 - (top + bottom) / 2) < lineH * 0.55;
      if (!sameRow) return false;

      const gap = Math.max(line.left, left) - Math.min(line.right, right);
      return gap < 14;
    });

    if (existing) {
      existing.left = Math.min(existing.left, left);
      existing.right = Math.max(existing.right, right);

      const isTinyPunctuation = (bottom - top) < (existing.bottom - existing.top) * 0.55;
      if (!isTinyPunctuation) {
        existing.top = Math.min(existing.top, top);
        existing.bottom = Math.max(existing.bottom, bottom);
      }
    } else {
      lines.push({ left, top, right, bottom });
    }
  }

  return lines.sort((a, b) => a.top - b.top || a.left - b.left);
}

export function pageElementFor(node: Node | null): HTMLElement | null {
  const element =
    node instanceof HTMLElement ? node : node?.parentElement ?? null;
  return (
    element?.closest<HTMLElement>('[data-pdf-page]') ??
    element?.closest<HTMLElement>('[data-page-number]') ??
    null
  );
}

export async function copyNormalizedSelectionText(text: string): Promise<boolean> {
  const cleanText = normalizeCopiedArabicText(text);
  return copyTextToClipboard(cleanText);
}

export function createAnnotationRecord(
  selectionState: SelectionState,
  type: TextAnnotation['type'],
  color: string,
  note?: string
): TextAnnotation {
  const now = Date.now();
  return {
    id: `${type === 'highlight' ? 'hl' : 'ul'}_${now}_${Math.random().toString(36).slice(2, 7)}`,
    pageNumber: selectionState.pageNumber,
    type,
    color,
    rects: selectionState.rects,
    quadPoints: selectionState.quadPoints,
    text: selectionState.text,
    note: note?.trim() || undefined,
    createdAt: now
  };
}
