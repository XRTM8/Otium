import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Highlighter,
  Search,
  StickyNote,
  Trash2,
  Underline as UnderlineIcon,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import type { AnnotationQuad, AnnotationRect, TextAnnotation } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { HIGHLIGHT_COLORS, UNDERLINE_COLORS } from '../core/storage/annotations';

interface TextSelectionMenuProps {
  onAddAnnotation: (annotation: TextAnnotation) => void;
  onDeleteAnnotation?: (id: string) => void;
  annotations?: TextAnnotation[];
  onCopySuccess?: () => void;
  onSearchSelectedText?: (text: string) => void;
  lang?: Language;
  /** Touch shells get a reachable bottom bar instead of a floating popover. */
  mobile?: boolean;
}

interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface SelectionState {
  text: string;
  pageNumber: number;
  rects: AnnotationRect[];
  quadPoints: AnnotationQuad[];
  screenRects: ScreenRect[];
  coords: { x: number; y: number; isTop: boolean };
}

interface MergedRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const LABELS = {
  ar: {
    highlight: 'تظليل',
    underline: 'تسطير',
    highlightColor: 'اختر لون التظليل',
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
    selectedText: 'النص المحدد'
  },
  en: {
    highlight: 'Highlight',
    underline: 'Underline',
    highlightColor: 'Highlight colour',
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
    selectedText: 'Selected text'
  }
} as const;

/**
 * Merges the per-glyph client rects produced by a PDF.js text selection into
 * one rectangle per visual line. Without this a selection can contain dozens
 * of overlapping boxes and the highlight looks rough.
 */
function mergeSelectionRects(rawRects: DOMRect[], pageRect: DOMRect): MergedRect[] {
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
      const sameRow = Math.abs((line.top + line.bottom) / 2 - (top + bottom) / 2) < (bottom - top) * 0.55;
      if (!sameRow) return false;
      const gap = Math.max(line.left, left) - Math.min(line.right, right);
      return gap < 6;
    });

    if (existing) {
      existing.left = Math.min(existing.left, left);
      existing.right = Math.max(existing.right, right);
      existing.top = Math.min(existing.top, top);
      existing.bottom = Math.max(existing.bottom, bottom);
    } else {
      lines.push({ left, top, right, bottom });
    }
  }

  return lines.sort((a, b) => a.top - b.top || a.left - b.left);
}

function pageElementFor(node: Node | null): HTMLElement | null {
  const element =
    node instanceof HTMLElement ? node : node?.parentElement ?? null;
  return (
    element?.closest<HTMLElement>('[data-pdf-page]') ??
    element?.closest<HTMLElement>('[data-page-number]') ??
    null
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path (WebViews often block the async API).
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Ephemeral selection layer + floating reading actions. Native selection is
 * captured into normalised page coordinates and then dismissed so Android's
 * copy/share toolbar never replaces the in-app menu.
 */
export const TextSelectionMenu: React.FC<TextSelectionMenuProps> = ({
  onAddAnnotation,
  onDeleteAnnotation,
  annotations = [],
  onCopySuccess,
  onSearchSelectedText,
  lang = 'ar',
  mobile = false
}) => {
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null);
  const [selectedColor, setSelectedColor] = useState(HIGHLIGHT_COLORS[0].hex);
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [noteMode, setNoteMode] = useState(false);
  const [noteText, setNoteText] = useState('');

  const menuRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<SelectionState | null>(null);
  const pointerActiveRef = useRef(false);
  const selectionTimerRef = useRef<number | null>(null);
  const labels = LABELS[lang];

  useEffect(() => {
    selectionRef.current = selectionState;
  }, [selectionState]);

  const stopSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectionState(null);
    setCopied(false);
    setNoteMode(false);
    setNoteText('');
    stopSpeech();
    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      // Selection APIs are unavailable in a few embedded webviews.
    }
  }, [stopSpeech]);

  const captureSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;

    const text = selection.toString().replace(/\s+/g, ' ').trim();
    if (!text) return false;

    const range = selection.getRangeAt(0);
    const startPage = pageElementFor(range.startContainer);
    const endPage = pageElementFor(range.endContainer);

    // Cross-page selections would produce ambiguous page-relative rects.
    if (!startPage || !endPage || startPage !== endPage) return false;

    const pageRect = startPage.getBoundingClientRect();
    if (!pageRect.width || !pageRect.height) return false;

    const lines = mergeSelectionRects(Array.from(range.getClientRects()), pageRect);
    if (lines.length === 0) return false;

    const rects: AnnotationRect[] = lines.map((line) => ({
      xPct: Math.max(0, Math.min(1, (line.left - pageRect.left) / pageRect.width)),
      yPct: Math.max(0, Math.min(1, (line.top - pageRect.top) / pageRect.height)),
      widthPct: Math.max(0.004, Math.min(1, (line.right - line.left) / pageRect.width)),
      heightPct: Math.max(0.004, Math.min(1, (line.bottom - line.top) / pageRect.height))
    }));

    const firstRect = lines[0];
    const lastRect = lines[lines.length - 1];
    const selectionTop = firstRect.top;
    const selectionBottom = lastRect.bottom;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const centerX = (Math.min(...lines.map((line) => line.left)) + Math.max(...lines.map((line) => line.right))) / 2;
    const barHeight = 96;
    const hasRoomAbove = selectionTop > barHeight + 22;
    const hasRoomBelow = selectionBottom + barHeight + 22 < viewportHeight;
    // Prefer above the selection; near the top edge flip below it.
    const isTop = hasRoomAbove;
    const halfWidth = Math.min(168, (viewportWidth - 16) / 2);
    const x = Math.min(viewportWidth - 8 - halfWidth, Math.max(8 + halfWidth, centerX));
    const rawY = isTop
      ? Math.max(12, selectionTop - 12)
      : hasRoomBelow
        ? selectionBottom + 12
        : Math.max(12, viewportHeight - barHeight - 12);

    const nextState: SelectionState = {
      text,
      pageNumber: Number.parseInt(startPage.dataset.pageNumber || '1', 10),
      rects,
      quadPoints: rects.map<AnnotationQuad>((rect) => [
        rect.xPct,
        rect.yPct,
        rect.xPct + rect.widthPct,
        rect.yPct + rect.heightPct
      ]),
      screenRects: lines.map((line) => ({
        left: line.left,
        top: line.top,
        width: line.right - line.left,
        height: line.bottom - line.top
      })),
      coords: {
        x,
        y: rawY,
        isTop
      }
    };

    selectionRef.current = nextState;
    setSelectionState(nextState);
    setCopied(false);
    setNoteMode(false);
    setNoteText('');
    setIsSpeaking(false);
    return true;
  }, []);

  const scheduleCapture = useCallback(
    (delay: number) => {
      if (selectionTimerRef.current !== null) window.clearTimeout(selectionTimerRef.current);
      selectionTimerRef.current = window.setTimeout(() => {
        selectionTimerRef.current = null;
        const captured = captureSelection();
        // A tap that collapses the native selection should dismiss an open
        // bar. During a handle drag the selection stays non-collapsed, so the
        // bar keeps updating instead of vanishing.
        if (!captured && selectionRef.current) clearSelection();
      }, delay);
    },
    [captureSelection, clearSelection]
  );

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      pointerActiveRef.current = true;
      if (menuRef.current?.contains(event.target as Node)) return;
      if (!selectionRef.current) return;

      // Dragging Android's native selection handles starts with a pointerdown
      // on the page. Keep the menu alive so the selection can still be
      // adjusted; tapping outside the page dismisses it.
      const target = event.target as HTMLElement | null;
      const insidePage = Boolean(target?.closest?.('[data-pdf-page]'));
      if (!insidePage) clearSelection();
    };

    const handlePointerUp = (event: PointerEvent) => {
      pointerActiveRef.current = false;
      if (menuRef.current?.contains(event.target as Node)) return;
      scheduleCapture(mobile ? 140 : 30);
    };

    const handleTouchEnd = (event: TouchEvent) => {
      pointerActiveRef.current = false;
      if (menuRef.current?.contains(event.target as Node)) return;
      scheduleCapture(mobile ? 140 : 40);
    };

    // Keyboard selection (Shift + arrows) has no pointer gesture.
    const handleSelectionChange = () => {
      if (pointerActiveRef.current || selectionRef.current) return;
      scheduleCapture(340);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clearSelection();
    };

    const handleScroll = () => {
      // The mobile action bar is pinned to the bottom and does not need to
      // follow the selection. Clearing here is what made the menu disappear
      // whenever Android nudged the page for its selection handles.
      if (!mobile && selectionRef.current) clearSelection();
    };

    const handleResize = () => {
      if (!mobile && selectionRef.current) clearSelection();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('pointerup', handlePointerUp, true);
    document.addEventListener('touchend', handleTouchEnd, true);
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('pointerup', handlePointerUp, true);
      document.removeEventListener('touchend', handleTouchEnd, true);
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      if (selectionTimerRef.current !== null) window.clearTimeout(selectionTimerRef.current);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [clearSelection, mobile, scheduleCapture]);

  if (!selectionState) return null;

  const overlappingAnnotation = annotations.find(
    (annotation) =>
      annotation.pageNumber === selectionState.pageNumber &&
      (annotation.text.includes(selectionState.text) ||
        selectionState.text.includes(annotation.text) ||
        annotation.rects.some((annotationRect) =>
          selectionState.rects.some(
            (selectionRect) =>
              Math.abs(annotationRect.yPct - selectionRect.yPct) < 0.015 &&
              Math.max(annotationRect.xPct, selectionRect.xPct) <
                Math.min(
                  annotationRect.xPct + annotationRect.widthPct,
                  selectionRect.xPct + selectionRect.widthPct
                )
          )
        ))
  );

  const createAnnotation = (type: TextAnnotation['type'], color: string, note?: string) => {
    const annotation: TextAnnotation = {
      id: `${type === 'highlight' ? 'hl' : 'ul'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      pageNumber: selectionState.pageNumber,
      type,
      color,
      rects: selectionState.rects,
      quadPoints: selectionState.quadPoints,
      text: selectionState.text,
      note: note?.trim() || undefined,
      createdAt: Date.now()
    };
    onAddAnnotation(annotation);
    clearSelection();
  };

  const handleCopy = async () => {
    const ok = await copyText(selectionState.text);
    if (!ok) return;
    setCopied(true);
    onCopySuccess?.();
    window.setTimeout(() => setCopied(false), 900);
  };

  const handleSearch = () => {
    if (!onSearchSelectedText) return;
    onSearchSelectedText(selectionState.text);
    clearSelection();
  };

  const toggleSpeech = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    if (isSpeaking) {
      stopSpeech();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(selectionState.text);
    utterance.lang = lang === 'ar' ? 'ar-SA' : 'en-US';
    utterance.rate = 0.98;
    utterance.pitch = 1;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const barStyle: React.CSSProperties = {
    left: `${selectionState.coords.x}px`,
    top: selectionState.coords.isTop
      ? `max(${selectionState.coords.y}px, calc(env(safe-area-inset-top, 0px) + 104px))`
      : `min(${selectionState.coords.y}px, calc(100dvh - env(safe-area-inset-bottom, 0px) - 104px))`,
    transform: selectionState.coords.isTop ? 'translate(-50%, -100%)' : 'translate(-50%, 0)'
  };

  const actionClass = mobile
    ? 'flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] text-ink-muted transition-colors active:bg-hover'
    : 'action-chip';

  return (
    <div
      ref={menuRef}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      style={mobile ? undefined : barStyle}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      className={
        mobile
          ? 'chrome-surface fixed inset-x-0 bottom-0 z-[70] max-h-[78dvh] select-none overflow-y-auto rounded-t-3xl border-x-0 border-b-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 text-ink shadow-2xl'
          : 'chrome-surface fixed z-[70] w-[min(336px,calc(100vw-16px))] select-none rounded-2xl p-1.5 text-ink shadow-2xl animate-in fade-in zoom-in-95 duration-100'
      }
    >
      {mobile && (
        <>
          <div className="mb-2 flex justify-center">
            <div className="h-1.5 w-10 rounded-full bg-line-strong" />
          </div>
          <div className="mb-2 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                {labels.selectedText}
              </div>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-ink-muted">
                “{selectionState.text}”
              </p>
            </div>
            <button
              type="button"
              onClick={clearSelection}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors active:bg-hover"
              title={labels.close}
              aria-label={labels.close}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </>
      )}

      {noteMode ? (
        <div className={mobile ? 'space-y-3 pb-1 pt-1' : 'space-y-2 p-1.5'}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-muted">
            <StickyNote className="w-3.5 h-3.5 text-highlight" />
            <span>{labels.note}</span>
          </div>
          <textarea
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            placeholder={labels.notePlaceholder}
            rows={3}
            autoFocus
            className={`w-full resize-none rounded-xl border border-line-subtle bg-hover-subtle px-2.5 py-2 leading-relaxed text-ink outline-none placeholder:text-ink-faint focus:border-accent/50 ${
              mobile ? 'min-h-24 text-sm' : 'text-[11px]'
            }`}
          />
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setNoteMode(false);
                setNoteText('');
              }}
              className={`rounded-lg text-ink-muted transition-colors hover:bg-hover hover:text-ink ${
                mobile ? 'min-h-11 px-3 text-xs' : 'px-2.5 py-1.5 text-[11px]'
              }`}
            >
              {labels.cancel}
            </button>
            <button
              type="button"
              onClick={() => createAnnotation('highlight', selectedColor, noteText)}
              disabled={!noteText.trim()}
              className={`btn-primary rounded-lg disabled:opacity-40 ${
                mobile ? 'min-h-11 px-4 text-xs' : 'px-3 py-1.5 text-[11px]'
              }`}
            >
              <Check className="w-3 h-3" />
              <span>{labels.save}</span>
            </button>
          </div>
        </div>
      ) : (
          <>
            {/* Colour palette: one tap creates a persistent highlight while
                every existing highlight on the page stays untouched. */}
            <div className={`flex items-center gap-1.5 ${mobile ? 'px-0.5 pb-3' : 'px-1 pb-1.5'}`}>
              <span className="shrink-0 text-[10px] font-medium text-ink-faint" title={labels.highlightColor}>
                <Highlighter className={mobile ? 'h-5 w-5' : 'h-3.5 w-3.5'} />
              </span>
              <div className="flex flex-1 items-center justify-between gap-1">
                {HIGHLIGHT_COLORS.map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    onClick={() => {
                      setSelectedColor(color.hex);
                      createAnnotation('highlight', color.hex);
                    }}
                    title={`${labels.highlight} ${color.label}`}
                    aria-label={`${labels.highlight} ${color.label}`}
                    className={`rounded-full border border-black/20 transition-transform hover:scale-110 active:scale-95 ${
                      mobile ? 'h-11 w-11' : 'h-5 w-5'
                    } ${
                      selectedColor === color.hex ? 'ring-2 ring-accent ring-offset-1 ring-offset-transparent' : ''
                    }`}
                    style={{ backgroundColor: color.hex }}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => createAnnotation('underline', UNDERLINE_COLORS[0].hex)}
                title={labels.underline}
                aria-label={labels.underline}
                className={`flex items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-hover hover:text-ink ${
                  mobile ? 'h-11 w-11' : 'h-6 w-6'
                }`}
              >
                <UnderlineIcon className={mobile ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
              </button>
            </div>

            <div className="h-px bg-line-subtle" />

            <div className={mobile ? 'flex items-stretch gap-1 pt-2' : 'flex items-center gap-0.5 pt-1'}>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className={actionClass}
                title={labels.copy}
              >
                {copied ? <Check className="w-4 h-4 text-success-ink" /> : <Copy className="w-4 h-4" />}
                <span className={copied ? 'text-success-ink' : undefined}>
                  {copied ? labels.copied : labels.copy}
                </span>
              </button>

              <button type="button" onClick={() => setNoteMode(true)} className={actionClass} title={labels.note}>
                <StickyNote className="w-4 h-4" />
                <span>{labels.note}</span>
              </button>

              {onSearchSelectedText && (
                <button type="button" onClick={handleSearch} className={actionClass} title={labels.search}>
                  <Search className="w-4 h-4" />
                  <span>{labels.search}</span>
                </button>
              )}

              <button
                type="button"
                onClick={toggleSpeech}
                className={`${actionClass} ${isSpeaking ? 'text-highlight' : ''}`}
                title={isSpeaking ? labels.stop : labels.speak}
              >
                {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                <span>{isSpeaking ? labels.stop : labels.speak}</span>
              </button>

              {overlappingAnnotation && onDeleteAnnotation && (
                <button
                  type="button"
                  onClick={() => {
                    onDeleteAnnotation(overlappingAnnotation.id);
                    clearSelection();
                  }}
                  className={`${actionClass} text-danger-ink hover:bg-rose-500/10`}
                  title={labels.remove}
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{labels.remove}</span>
                </button>
              )}

              {!mobile && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-hover hover:text-ink"
                  title={labels.close}
                  aria-label={labels.close}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </>
        )}
    </div>
  );
};
