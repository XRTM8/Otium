import React, { useState } from 'react';
import {
  PenTool,
  Highlighter,
  Eraser,
  Sparkles,
  Undo2,
  Redo2,
  RotateCcw,
  Presentation,
  X,
  ChevronUp,
  ChevronDown,
  Palette
} from 'lucide-react';
import type { SmartboardTool } from '../types';
import type { Language } from '../utils/translations';
import { getTranslations } from '../utils/translations';

interface SmartboardToolbarProps {
  activeTool: SmartboardTool;
  onSelectTool: (tool: SmartboardTool) => void;
  penColor: string;
  onPenColorChange: (color: string) => void;
  penSize: number;
  onPenSizeChange: (size: number) => void;
  highlighterColor: string;
  onHighlighterColorChange: (color: string) => void;
  highlighterSize: number;
  onHighlighterSizeChange: (size: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClearPage: () => void;
  onToggleScratchpad: () => void;
  onClose: () => void;
  lang: Language;
  currentPage: number;
}

const PEN_COLORS = [
  { id: 'red', hex: '#ef4444', label: 'أحمر' },
  { id: 'blue', hex: '#3b82f6', label: 'أزرق' },
  { id: 'emerald', hex: '#10b981', label: 'أخضر' },
  { id: 'amber', hex: '#f59e0b', label: 'كهرماني' },
  { id: 'purple', hex: '#a855f7', label: 'بنفسجي' },
  { id: 'white', hex: '#ffffff', label: 'أبيض' },
  { id: 'black', hex: '#0f172a', label: 'أسود' },
];

const PEN_SIZES = [
  { size: 2, label: 'رفيع' },
  { size: 4, label: 'متوسط' },
  { size: 7, label: 'عريض' },
  { size: 12, label: 'ضخم' },
];

const HIGHLIGHTER_COLORS = [
  { id: 'yellow', hex: '#fde047', label: 'أصفر' },
  { id: 'green', hex: '#86efac', label: 'أخضر' },
  { id: 'cyan', hex: '#38bdf8', label: 'سماوي' },
  { id: 'pink', hex: '#f472b6', label: 'وردي' },
  { id: 'orange', hex: '#fb923c', label: 'برتقالي' },
];

const HIGHLIGHTER_SIZES = [
  { size: 16, label: 'عادي' },
  { size: 24, label: 'عريض' },
  { size: 36, label: 'عريض جداً' },
];

export const SmartboardToolbar: React.FC<SmartboardToolbarProps> = ({
  activeTool,
  onSelectTool,
  penColor,
  onPenColorChange,
  penSize,
  onPenSizeChange,
  highlighterColor,
  onHighlighterColorChange,
  highlighterSize,
  onHighlighterSizeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClearPage,
  onToggleScratchpad,
  onClose,
  lang,
  currentPage,
}) => {
  const [showColorPopup, setShowColorPopup] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isClearConfirm, setIsClearConfirm] = useState(false);

  const t = getTranslations(lang);

  if (isMinimized) {
    return (
      <div
        dir="ltr"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 p-1.5 rounded-full bg-neutral-900/95 text-white border border-emerald-500/50 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95"
      >
        <button
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 px-3 py-2 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-medium text-xs cursor-pointer transition-all active:scale-95"
        >
          <PenTool className="w-4 h-4 text-emerald-400" />
          <span>{t.smartboard}</span>
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      dir="ltr"
      className="fixed bottom-4 sm:bottom-6 inset-x-0 z-50 flex flex-col items-center pointer-events-none px-2 select-none"
    >
      {/* Popover for Pen/Highlighter Colors & Sizes */}
      {showColorPopup && (
        <div className="pointer-events-auto mb-2 p-3 rounded-2xl bg-neutral-900/98 text-white border border-white/20 shadow-2xl backdrop-blur-2xl flex flex-col gap-3 min-w-[280px] animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider">
              {activeTool === 'highlighter' ? t.highlighterTool : t.penTool}
            </span>
            <button
              onClick={() => setShowColorPopup(false)}
              className="p-1 rounded-md hover:bg-white/10 text-neutral-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Color Palettes */}
          <div>
            <div className="text-[10px] text-neutral-400 mb-1.5 font-medium">اللون • Color</div>
            <div className="flex items-center gap-2">
              {(activeTool === 'highlighter' ? HIGHLIGHTER_COLORS : PEN_COLORS).map((c) => {
                const isSelected = (activeTool === 'highlighter' ? highlighterColor : penColor) === c.hex;
                return (
                  <button
                    key={c.id}
                    title={c.label}
                    onClick={() => {
                      if (activeTool === 'highlighter') {
                        onHighlighterColorChange(c.hex);
                      } else {
                        onPenColorChange(c.hex);
                      }
                    }}
                    style={{ backgroundColor: c.hex }}
                    className={`w-7 h-7 rounded-full border-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-white scale-110 shadow-lg ring-2 ring-emerald-400/50'
                        : 'border-white/20 hover:scale-105'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {/* Stroke Width / Size */}
          <div>
            <div className="text-[10px] text-neutral-400 mb-1.5 font-medium">السُمك • Size</div>
            <div className="flex items-center gap-2">
              {(activeTool === 'highlighter' ? HIGHLIGHTER_SIZES : PEN_SIZES).map((s) => {
                const currentSize = activeTool === 'highlighter' ? highlighterSize : penSize;
                const isSelected = currentSize === s.size;
                return (
                  <button
                    key={s.size}
                    onClick={() => {
                      if (activeTool === 'highlighter') {
                        onHighlighterSizeChange(s.size);
                      } else {
                        onPenSizeChange(s.size);
                      }
                    }}
                    className={`flex-1 py-1 px-2 rounded-xl text-xs font-mono transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 font-semibold'
                        : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Floating Glass Dock */}
      <div className="pointer-events-auto flex items-center gap-1 sm:gap-2 px-3 py-2 rounded-full bg-neutral-900/95 text-white border border-white/20 shadow-2xl backdrop-blur-2xl transition-all max-w-[96vw] overflow-x-auto">
        
        {/* Pen Tool Button */}
        <div className="relative flex items-center">
          <button
            onClick={() => {
              if (activeTool === 'pen') {
                setShowColorPopup((prev) => !prev);
              } else {
                onSelectTool('pen');
              }
            }}
            title={t.penTool}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full transition-all cursor-pointer ${
              activeTool === 'pen'
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 font-medium'
                : 'hover:bg-white/10 text-neutral-300'
            }`}
          >
            <PenTool className="w-4 h-4" />
            <span
              className="w-2.5 h-2.5 rounded-full border border-black/30 shrink-0"
              style={{ backgroundColor: penColor }}
            />
            <span className="text-xs hidden sm:inline">{t.penTool}</span>
          </button>
        </div>

        {/* Highlighter Tool Button */}
        <button
          onClick={() => {
            if (activeTool === 'highlighter') {
              setShowColorPopup((prev) => !prev);
            } else {
              onSelectTool('highlighter');
            }
          }}
          title={t.highlighterTool}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-full transition-all cursor-pointer ${
            activeTool === 'highlighter'
              ? 'bg-amber-400 text-neutral-950 shadow-lg shadow-amber-400/30 font-medium'
              : 'hover:bg-white/10 text-neutral-300'
          }`}
        >
          <Highlighter className="w-4 h-4" />
          <span
            className="w-2.5 h-2.5 rounded-full border border-black/30 shrink-0"
            style={{ backgroundColor: highlighterColor }}
          />
          <span className="text-xs hidden sm:inline">{t.highlighterTool}</span>
        </button>

        {/* Eraser Tool Button */}
        <button
          onClick={() => {
            onSelectTool('eraser');
            setShowColorPopup(false);
          }}
          title={t.eraserTool}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-full transition-all cursor-pointer ${
            activeTool === 'eraser'
              ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30 font-medium'
              : 'hover:bg-white/10 text-neutral-300'
          }`}
        >
          <Eraser className="w-4 h-4" />
          <span className="text-xs hidden sm:inline">{t.eraserTool}</span>
        </button>

        {/* Laser Pointer Tool Button */}
        <button
          onClick={() => {
            onSelectTool('laser');
            setShowColorPopup(false);
          }}
          title={t.laserTool}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-full transition-all cursor-pointer ${
            activeTool === 'laser'
              ? 'bg-red-600 text-white shadow-lg shadow-red-500/40 ring-2 ring-red-400 animate-pulse font-medium'
              : 'hover:bg-white/10 text-neutral-300'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-xs hidden md:inline">{t.laserTool}</span>
        </button>

        {/* Color Palette Quick Toggle */}
        <button
          onClick={() => setShowColorPopup((prev) => !prev)}
          title="خيارات الألوان والحجم"
          className={`p-2 rounded-full transition-colors cursor-pointer ${
            showColorPopup ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-neutral-400 hover:text-white'
          }`}
        >
          <Palette className="w-4 h-4" />
        </button>

        {/* Divider */}
        <div className="w-[1px] h-5 bg-white/15 mx-0.5 shrink-0" />

        {/* Undo / Redo */}
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title={t.undo}
          className="p-2 rounded-full hover:bg-white/10 text-neutral-300 disabled:opacity-20 transition-colors cursor-pointer"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo}
          title={t.redo}
          className="p-2 rounded-full hover:bg-white/10 text-neutral-300 disabled:opacity-20 transition-colors cursor-pointer"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        {/* Clear Page Drawings */}
        <div className="relative">
          {isClearConfirm ? (
            <div className="flex items-center gap-1 animate-in fade-in duration-100">
              <button
                onClick={() => {
                  onClearPage();
                  setIsClearConfirm(false);
                }}
                className="px-2.5 py-1 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer"
              >
                تأكيد المسح
              </button>
              <button
                onClick={() => setIsClearConfirm(false)}
                className="p-1 rounded-full hover:bg-white/10 text-neutral-400"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsClearConfirm(true)}
              title={`${t.clearPage} (صفحة ${currentPage})`}
              className="p-2 rounded-full hover:bg-rose-500/20 hover:text-rose-300 text-neutral-300 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="w-[1px] h-5 bg-white/15 mx-0.5 shrink-0" />

        {/* Companion Scratchpad / Whiteboard */}
        <button
          onClick={onToggleScratchpad}
          title={t.whiteboardModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 transition-colors cursor-pointer border border-blue-500/30"
        >
          <Presentation className="w-4 h-4 text-blue-400" />
          <span className="text-xs hidden lg:inline">{t.whiteboardModal}</span>
        </button>

        {/* Minimize Button */}
        <button
          onClick={() => setIsMinimized(true)}
          title="تصغير شريط الأدوات"
          className="p-2 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
        >
          <ChevronDown className="w-4 h-4" />
        </button>

        {/* Close Smart Board Mode */}
        <button
          onClick={onClose}
          title={t.exitSmartboard}
          className="p-2 rounded-full bg-white/10 hover:bg-rose-600 hover:text-white text-neutral-300 transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

      </div>
    </div>
  );
};
