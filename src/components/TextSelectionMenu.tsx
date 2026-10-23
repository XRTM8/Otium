import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Copy, Highlighter, Underline as UnderlineIcon, Check, X } from 'lucide-react';
import type { TextAnnotation, AnnotationRect } from '../types';
import { HIGHLIGHT_COLORS, UNDERLINE_COLORS } from '../utils/annotations';

interface TextSelectionMenuProps {
  onAddAnnotation: (annotation: TextAnnotation) => void;
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
  onCopySuccess
}) => {
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null);
  const [activeTab, setActiveTab] = useState<'main' | 'highlight' | 'underline'>('main');
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const clearSelection = () => {
    setSelectionState(null);
    setActiveTab('main');
    setCopied(false);
  };

  const handleSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      // Don't clear immediately if clicking inside the menu
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

    // Verify selection is within a PDF textLayer
    const textLayer = element?.closest('.textLayer');
    const pageEl = (element?.closest('[data-page-number]') || textLayer?.closest('[data-page-number]')) as HTMLElement | null;

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
    const validRects = rawRects.filter((r) => r.width > 1 && r.height > 1);
    const rectsToUse = validRects.length > 0 ? validRects : [rangeRect];

    const percentageRects: AnnotationRect[] = rectsToUse.map((r) => ({
      xPct: Math.max(0, Math.min(1, (r.left - pageRect.left) / pageRect.width)),
      yPct: Math.max(0, Math.min(1, (r.top - pageRect.top) / pageRect.height)),
      widthPct: Math.max(0.005, Math.min(1, r.width / pageRect.width)),
      heightPct: Math.max(0.005, Math.min(1, r.height / pageRect.height))
    }));

    // Floating position: centered horizontally, above if room, else below
    const isTop = rangeRect.top > 80;
    const x = Math.max(120, Math.min(window.innerWidth - 120, rangeRect.left + rangeRect.width / 2));
    const y = isTop ? rangeRect.top - 10 : rangeRect.bottom + 10;

    setSelectionState({
      text,
      pageNumber,
      rects: percentageRects,
      coords: { x, y, isTop }
    });
    setActiveTab('main');
    setCopied(false);
  }, []);

  useEffect(() => {
    const handleMouseUp = () => {
      // Delay slightly to let selection stabilize
      setTimeout(handleSelection, 60);
    };

    const handleTouchEnd = () => {
      setTimeout(handleSelection, 120);
    };

    const handleMouseDown = (e: MouseEvent) => {
      // If clicking outside menu, close it
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
          clearSelection();
        }
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [handleSelection]);

  if (!selectionState) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(selectionState.text);
      setCopied(true);
      if (onCopySuccess) onCopySuccess();
      setTimeout(() => {
        clearSelection();
        window.getSelection()?.removeAllRanges();
      }, 700);
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
    window.getSelection()?.removeAllRanges();
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
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div
      ref={menuRef}
      style={{
        left: `${selectionState.coords.x}px`,
        top: `${selectionState.coords.y}px`,
        transform: selectionState.coords.isTop ? 'translate(-50%, -100%)' : 'translate(-50%, 0%)'
      }}
      className="fixed z-50 flex items-center gap-1 p-1 rounded-2xl bg-neutral-900/95 text-white border border-white/15 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150 select-none pointer-events-auto"
    >
      {activeTab === 'main' && (
        <div className="flex items-center gap-0.5">
          {/* Copy Button */}
          <button
            onClick={handleCopy}
            title="نسخ النص (Copy)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-white/10 active:bg-white/20 transition-all text-xs font-medium cursor-pointer"
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

          <div className="w-[1px] h-4 bg-white/15 mx-0.5" />

          {/* Highlight Toggle Button */}
          <button
            onClick={() => setActiveTab('highlight')}
            title="تظليل بالهايلايتر (Highlight)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-white/10 active:bg-white/20 transition-all text-xs font-medium cursor-pointer text-amber-300"
          >
            <Highlighter className="w-3.5 h-3.5" />
            <span className="text-[11px] font-sans">تظليل</span>
          </button>

          {/* Underline Toggle Button */}
          <button
            onClick={() => setActiveTab('underline')}
            title="جرّة خط أسفله (Underline)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-white/10 active:bg-white/20 transition-all text-xs font-medium cursor-pointer text-sky-300"
          >
            <UnderlineIcon className="w-3.5 h-3.5" />
            <span className="text-[11px] font-sans">تسطير</span>
          </button>

          <div className="w-[1px] h-4 bg-white/15 mx-0.5" />

          {/* Close */}
          <button
            onClick={clearSelection}
            title="إلغاء"
            className="p-1.5 rounded-xl hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Highlighter Colors Row */}
      {activeTab === 'highlight' && (
        <div className="flex items-center gap-1 px-1">
          <span className="text-[11px] font-sans text-neutral-300 pl-1 pr-1.5 font-medium flex items-center gap-1">
            <Highlighter className="w-3 h-3 text-amber-400" />
            لون التظليل:
          </span>
          {HIGHLIGHT_COLORS.map((col) => (
            <button
              key={col.id}
              onClick={() => handleCreateHighlight(col.hex)}
              title={col.label}
              className="w-5 h-5 rounded-full border border-black/30 shadow-xs hover:scale-115 active:scale-95 transition-transform cursor-pointer relative flex items-center justify-center"
              style={{ backgroundColor: col.hex }}
            />
          ))}
          <button
            onClick={() => setActiveTab('main')}
            className="p-1 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white text-[10px] ml-1 cursor-pointer"
          >
            رجوع
          </button>
        </div>
      )}

      {/* Underline Colors Row */}
      {activeTab === 'underline' && (
        <div className="flex items-center gap-1 px-1">
          <span className="text-[11px] font-sans text-neutral-300 pl-1 pr-1.5 font-medium flex items-center gap-1">
            <UnderlineIcon className="w-3 h-3 text-sky-400" />
            لون الخط:
          </span>
          {UNDERLINE_COLORS.map((col) => (
            <button
              key={col.id}
              onClick={() => handleCreateUnderline(col.hex)}
              title={col.label}
              className="w-5 h-5 rounded-full border border-black/30 shadow-xs hover:scale-115 active:scale-95 transition-transform cursor-pointer relative flex items-center justify-center"
              style={{ backgroundColor: col.hex }}
            />
          ))}
          <button
            onClick={() => setActiveTab('main')}
            className="p-1 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white text-[10px] ml-1 cursor-pointer"
          >
            رجوع
          </button>
        </div>
      )}
    </div>
  );
};
