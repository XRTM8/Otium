import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Copy, Underline as UnderlineIcon, Check, X, Trash2 } from 'lucide-react';
import type { TextAnnotation, AnnotationRect } from '../core/types';
import { HIGHLIGHT_COLORS, UNDERLINE_COLORS } from '../core/storage/annotations';

interface TextSelectionMenuProps {
  onAddAnnotation: (annotation: TextAnnotation) => void;
  onDeleteAnnotation?: (id: string) => void;
  annotations?: TextAnnotation[];
  onCopySuccess?: () => void;
}

interface SelectionState {
  text: string;
  pageNumber: number;
  rects: AnnotationRect[];
  coords: { x: number; y: number; isTop: boolean };
}

export const TextSelectionMenu: React.FC<TextSelectionMenuProps> = ({
  onAddAnnotation,
  onDeleteAnnotation,
  annotations = [],
  onCopySuccess
}) => {
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const clearSelection = useCallback(() => {
    setSelectionState(null);
    setCopied(false);
    // Clear native browser text selection range completely
    try {
      window.getSelection()?.removeAllRanges();
    } catch {}
  }, []);

  const handleSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      return;
    }

    const text = sel.toString().trim();
    if (text.length === 0) {
      clearSelection();
      return;
    }

    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const element = container instanceof HTMLElement ? container : container.parentElement;

    // Verify selection is within a PDF page / textLayer
    const pageEl = element?.closest('[data-page-number]') as HTMLElement | null;
    if (!pageEl) {
      return;
    }

    const pageNumber = parseInt(pageEl.getAttribute('data-page-number') || '1', 10);
    const pageRect = pageEl.getBoundingClientRect();
    const rangeRect = range.getBoundingClientRect();

    if (rangeRect.width === 0 && rangeRect.height === 0) {
      return;
    }

    // Extract individual line rects as percentages of page container
    const rawRects = Array.from(range.getClientRects());
    const validRects = rawRects.filter((r) => r.width > 2 && r.height > 2);
    const rectsToUse = validRects.length > 0 ? validRects : [rangeRect];

    const percentageRects: AnnotationRect[] = rectsToUse.map((r) => ({
      xPct: Math.max(0, Math.min(1, (r.left - pageRect.left) / pageRect.width)),
      yPct: Math.max(0, Math.min(1, (r.top - pageRect.top) / pageRect.height)),
      widthPct: Math.max(0.005, Math.min(1, r.width / pageRect.width)),
      heightPct: Math.max(0.005, Math.min(1, r.height / pageRect.height))
    }));

    // Floating position: centered horizontally, above selection if room, else below
    const isTop = rangeRect.top > 70;
    const x = Math.max(140, Math.min(window.innerWidth - 140, rangeRect.left + rangeRect.width / 2));
    const y = isTop ? rangeRect.top - 8 : rangeRect.bottom + 8;

    setSelectionState({
      text,
      pageNumber,
      rects: percentageRects,
      coords: { x, y, isTop }
    });
    setCopied(false);
  }, [clearSelection]);

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      // If clicking inside menu, do not re-evaluate
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
        return;
      }
      setTimeout(handleSelection, 50);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
        return;
      }
      setTimeout(handleSelection, 100);
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        clearSelection();
      }
    };

    // Close menu and clear selection when user scrolls
    const handleScroll = () => {
      if (selectionState) {
        clearSelection();
      }
    };

    // Escape key listener to deselect text
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection();
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [handleSelection, clearSelection, selectionState]);

  if (!selectionState) return null;

  // Check if selected text overlaps an existing highlight or underline on this page
  const overlappingAnnotation = annotations.find(
    (a) =>
      a.pageNumber === selectionState.pageNumber &&
      (a.text.includes(selectionState.text) ||
        selectionState.text.includes(a.text) ||
        a.rects.some((ar) =>
          selectionState.rects.some(
            (sr) =>
              Math.abs(ar.yPct - sr.yPct) < 0.02 &&
              Math.max(ar.xPct, sr.xPct) < Math.min(ar.xPct + ar.widthPct, sr.xPct + sr.widthPct)
          )
        ))
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(selectionState.text);
      setCopied(true);
      if (onCopySuccess) onCopySuccess();
      setTimeout(() => {
        clearSelection();
      }, 500);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleCreateHighlight = (hex: string) => {
    const anno: TextAnnotation = {
      id: `hl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      pageNumber: selectionState.pageNumber,
      type: 'highlight',
      color: hex,
      rects: selectionState.rects,
      text: selectionState.text,
      createdAt: Date.now()
    };
    onAddAnnotation(anno);
    clearSelection();
  };

  const handleCreateUnderline = (hex: string) => {
    const anno: TextAnnotation = {
      id: `ul_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      pageNumber: selectionState.pageNumber,
      type: 'underline',
      color: hex,
      rects: selectionState.rects,
      text: selectionState.text,
      createdAt: Date.now()
    };
    onAddAnnotation(anno);
    clearSelection();
  };

  return (
    <div
      ref={menuRef}
      style={{
        left: `${selectionState.coords.x}px`,
        top: `${selectionState.coords.y}px`,
        transform: selectionState.coords.isTop ? 'translate(-50%, -100%)' : 'translate(-50%, 0%)'
      }}
      className="fixed z-50 flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-neutral-900/98 text-white border border-white/20 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-100 select-none pointer-events-auto"
    >
      {/* 1. Copy Button */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleCopy}
        title="نسخ النص (Ctrl + C)"
        className="flex items-center gap-1 px-2 py-1 rounded-xl hover:bg-white/10 active:bg-white/20 transition-all text-xs font-medium cursor-pointer"
      >
        {copied ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-emerald-300 font-sans text-[11px]">تم النسخ</span>
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5 text-neutral-300" />
            <span className="text-[11px] font-sans">نسخ</span>
          </>
        )}
      </button>

      <div className="w-[1px] h-3.5 bg-white/20" />

      {/* 2. Instant Highlighter Color Dots (1-Click Highlight) */}
      <div className="flex items-center gap-1.5 px-0.5">
        {HIGHLIGHT_COLORS.map((col) => (
          <button
            key={col.id}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleCreateHighlight(col.hex)}
            title={`تظليل ${col.label}`}
            className="w-4.5 h-4.5 rounded-full border border-black/40 shadow-xs hover:scale-125 active:scale-95 transition-transform cursor-pointer"
            style={{ backgroundColor: col.hex }}
          />
        ))}
      </div>

      <div className="w-[1px] h-3.5 bg-white/20" />

      {/* 3. Instant Underline Button */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleCreateUnderline(UNDERLINE_COLORS[0].hex)}
        title="تسطير النص"
        className="p-1.5 rounded-xl hover:bg-white/10 active:bg-white/20 text-sky-300 transition-colors cursor-pointer"
      >
        <UnderlineIcon className="w-3.5 h-3.5" />
      </button>

      {/* 4. Remove / Delete Existing Annotation (if text is already highlighted/underlined) */}
      {overlappingAnnotation && onDeleteAnnotation && (
        <>
          <div className="w-[1px] h-3.5 bg-white/20" />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onDeleteAnnotation(overlappingAnnotation.id);
              clearSelection();
            }}
            title="إلغاء وإزالة هذا التظليل أو التسطير"
            className="flex items-center gap-1 px-2 py-1 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 border border-rose-500/30 transition-all text-xs font-medium cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="text-[11px] font-sans">
              {overlappingAnnotation.type === 'highlight' ? 'إلغاء التظليل' : 'إلغاء التسطير'}
            </span>
          </button>
        </>
      )}

      <div className="w-[1px] h-3.5 bg-white/20" />

      {/* 5. Deselect / Cancel button */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={clearSelection}
        title="إلغاء التحديد (Esc)"
        className="flex items-center gap-1 px-1.5 py-1 rounded-xl hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer text-xs"
      >
        <X className="w-3 h-3" />
        <span className="text-[10px]">إلغاء</span>
      </button>
    </div>
  );
};
