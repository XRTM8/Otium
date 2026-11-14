import React from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Highlighter,
  MoreHorizontal,
  Scissors,
  Search,
  StickyNote,
  Trash2,
  Underline as UnderlineIcon,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import type { Language } from '../core/i18n/translations';
import { HIGHLIGHT_COLORS, UNDERLINE_COLORS } from '../core/storage/annotations';
import type { TextAnnotation } from '../core/types';
import { openTtsSettings } from '../platform/tts';
import { SELECTION_MENU_LABELS as LABELS, type SelectionState } from './textSelectionGeometry';

interface TextSelectionToolbarCardProps {
  menuRef: React.RefObject<HTMLDivElement | null>;
  lang: Language;
  mobile: boolean;
  barStyle: React.CSSProperties;
  selectionState: SelectionState;
  overlappingAnnotation?: TextAnnotation;
  selectedColor: string;
  setSelectedColor: (color: string) => void;
  copied: boolean;
  isSpeaking: boolean;
  speechError: { message: string; voiceSettings: boolean } | null;
  noteMode: boolean;
  setNoteMode: (value: boolean) => void;
  noteText: string;
  setNoteText: (value: string) => void;
  expandedActions: boolean;
  setExpandedActions: React.Dispatch<React.SetStateAction<boolean>>;
  createAnnotation: (type: TextAnnotation['type'], color: string, note?: string) => void;
  onDeleteAnnotation?: (id: string) => void;
  onSearchSelectedText?: (text: string) => void;
  onClipToBoard?: (text: string, pageNumber: number) => void;
  handleCopy: () => void;
  handleSearch: () => void;
  toggleSpeech: () => void;
  clearSelection: () => void;
}

/** Floating desktop / docked mobile card for highlights, notes, speech, search, and board clipping. */
export const TextSelectionToolbarCard: React.FC<TextSelectionToolbarCardProps> = ({
  menuRef,
  lang,
  mobile,
  barStyle,
  selectionState,
  overlappingAnnotation,
  selectedColor,
  setSelectedColor,
  copied,
  isSpeaking,
  speechError,
  noteMode,
  setNoteMode,
  noteText,
  setNoteText,
  expandedActions,
  setExpandedActions,
  createAnnotation,
  onDeleteAnnotation,
  onSearchSelectedText,
  onClipToBoard,
  handleCopy,
  handleSearch,
  toggleSpeech,
  clearSelection,
}) => {
  const labels = LABELS[lang];
  const actionClass = mobile
    ? 'flex min-h-11 min-w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[10px] text-ink-muted transition-colors active:bg-hover'
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
          ? `chrome-surface selection-bar-mobile fixed inset-x-2 bottom-[max(0.4rem,env(safe-area-inset-bottom,0px))] z-[70] ${noteMode ? 'max-h-[60dvh]' : 'max-h-[max(104px,34dvh)]'} select-none overflow-y-auto rounded-2xl px-2 py-1.5 text-ink shadow-2xl`
          : 'chrome-surface fixed z-[70] w-[min(336px,calc(100vw-16px))] select-none rounded-2xl p-1.5 text-ink shadow-2xl fluid-pop'
      }
    >
      {speechError && (
        <div
          className={`flex items-start gap-2 rounded-xl border border-danger-ink/25 bg-danger-ink/10 px-2.5 py-2 text-[11px] leading-relaxed text-danger-ink ${
            mobile ? 'mb-2.5' : 'mx-1 mt-1 mb-1'
          }`}
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{speechError.message}</span>
          {speechError.voiceSettings && (
            <button
              type="button"
              onClick={() => openTtsSettings()}
              className="shrink-0 self-center rounded-lg border border-danger-ink/25 px-2 py-1 text-[10px] font-semibold transition-colors hover:bg-danger-ink/10 active:bg-danger-ink/15"
            >
              {labels.voiceSettings}
            </button>
          )}
        </div>
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
          <div className={`flex items-center gap-1.5 ${mobile ? 'px-0.5 pe-10 pb-1' : 'px-1 pb-1.5'}`}>
            <span className="shrink-0 text-[10px] font-medium text-ink-faint" title={labels.highlightColor}>
              <Highlighter className={mobile ? 'h-5 w-5' : 'h-3.5 w-3.5'} />
            </span>
            <div className="flex flex-1 min-w-0 items-center justify-between gap-1 overflow-x-auto">
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
                    mobile ? 'h-9 w-9 shrink-0' : 'h-5 w-5'
                  } ${
                    selectedColor === color.hex ? 'ring-2 ring-accent ring-offset-1 ring-offset-transparent' : ''
                  }`}
                  style={{ backgroundColor: color.hex }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => createAnnotation('underline', UNDERLINE_COLORS[0]?.hex ?? '#2563eb')}
              title={labels.underline}
              aria-label={labels.underline}
              className={`flex items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-hover hover:text-ink ${
                mobile ? 'h-9 w-9 shrink-0' : 'h-6 w-6'
              }`}
            >
              <UnderlineIcon className={mobile ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
            </button>
          </div>

          {mobile && (
            <button
              type="button"
              onClick={clearSelection}
              aria-label={labels.close}
              className="absolute top-1.5 end-1.5 h-9 w-9 flex items-center justify-center rounded-xl text-ink-muted"
            >
              <X size={16} />
            </button>
          )}
          <div className="h-px bg-line-subtle" />

          <div className={mobile ? 'flex items-stretch justify-between gap-1 overflow-x-auto pt-1' : 'flex items-center gap-0.5 pt-1'}>
            <button
              type="button"
              onClick={handleCopy}
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

            {onClipToBoard && (!mobile || expandedActions) && (
              <button
                type="button"
                onClick={() => {
                  onClipToBoard(selectionState.text, selectionState.pageNumber);
                  clearSelection();
                }}
                className={`${actionClass} text-accent`}
                title={labels.clipToBoard}
              >
                <Scissors className="w-4 h-4" />
                <span>{labels.clipToBoard}</span>
              </button>
            )}

            {onSearchSelectedText && (!mobile || expandedActions) && (
              <button type="button" onClick={handleSearch} className={actionClass} title={labels.search}>
                <Search className="w-4 h-4" />
                <span>{labels.search}</span>
              </button>
            )}

            {(!mobile || expandedActions) && (
              <button
                type="button"
                onClick={toggleSpeech}
                className={`${actionClass} ${isSpeaking ? 'text-highlight' : ''}`}
                title={isSpeaking ? labels.stop : labels.speak}
              >
                {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                <span>{isSpeaking ? labels.stop : labels.speak}</span>
              </button>
            )}

            {mobile && (
              <button
                type="button"
                className={actionClass}
                aria-expanded={expandedActions}
                aria-label={lang === 'ar' ? 'المزيد من أدوات التحديد' : 'More selection tools'}
                onClick={() => setExpandedActions((value) => !value)}
              >
                <MoreHorizontal size={18} />
                <span>{lang === 'ar' ? 'المزيد' : 'More'}</span>
              </button>
            )}

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
