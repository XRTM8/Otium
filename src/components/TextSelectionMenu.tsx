import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { TextAnnotation } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { useDocumentInteraction } from './documentInkContext';
import { HIGHLIGHT_COLORS } from '../core/storage/annotations';
import {
  canSpeakText,
  speakText,
  stopTts,
  type TtsHandle
} from '../platform/tts';
import { detectSpeechLanguage, prepareTextForSpeech } from '../core/tts/speechLanguage';
import {
  copyNormalizedSelectionText as copyText,
  createAnnotationRecord,
  SELECTION_MENU_LABELS as LABELS,
  type SelectionState
} from './textSelectionGeometry';
import {
  buildSelectionSignature,
  captureWindowSelectionState,
  findOverlappingSelectionAnnotation,
} from './textSelectionCapture';
import { useTextSelectionListeners } from './useTextSelectionListeners';
import { TextSelectionToolbarCard } from './TextSelectionToolbarCard';

interface TextSelectionMenuProps {
  onAddAnnotation: (annotation: TextAnnotation) => void;
  onDeleteAnnotation?: (id: string) => void;
  annotations?: TextAnnotation[];
  onCopySuccess?: () => void;
  onSearchSelectedText?: (text: string) => void;
  onClipToBoard?: (text: string, pageNumber: number) => void;
  lang?: Language;
  /** Touch shells get a reachable bottom bar instead of a floating popover. */
  mobile?: boolean;
}

const EMPTY_ANNOTATIONS: TextAnnotation[] = [];

/**
 * Reading actions capture page-relative geometry while preserving the native
 * selection and its adjustment handles until an action is committed.
 */
export const TextSelectionMenu: React.FC<TextSelectionMenuProps> = ({
  onAddAnnotation,
  onDeleteAnnotation,
  annotations = EMPTY_ANNOTATIONS,
  onCopySuccess,
  onSearchSelectedText,
  onClipToBoard,
  lang = 'ar',
  mobile = false
}) => {
  const { mode, publishSelection } = useDocumentInteraction();
  const [prevMode, setPrevMode] = useState(mode);
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null);
  const [selectedColor, setSelectedColor] = useState(HIGHLIGHT_COLORS[0]?.hex ?? '#fde047');
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState<{
    message: string;
    voiceSettings: boolean;
  } | null>(null);
  const [noteMode, setNoteMode] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [expandedActions, setExpandedActions] = useState(false);

  if (prevMode !== mode) {
    setPrevMode(mode);
    if (mode !== 'select') {
      setSelectionState(null);
      setExpandedActions(false);
      setCopied(false);
      setSpeechError(null);
      setNoteMode(false);
      setNoteText('');
      setIsSpeaking(false);
    }
  }

  const menuRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<SelectionState | null>(null);
  const selectionSignatureRef = useRef('');
  const pointerActiveRef = useRef(false);
  const captureTimersRef = useRef<number[]>([]);
  const watchdogRef = useRef<number | null>(null);
  const speechHandleRef = useRef<TtsHandle | null>(null);
  const labels = LABELS[lang];

  useEffect(() => {
    selectionRef.current = selectionState;
    if (selectionState) {
      document.body.dataset.hasSelection = 'true';
    } else {
      delete document.body.dataset.hasSelection;
    }
    return () => {
      delete document.body.dataset.hasSelection;
    };
  }, [selectionState]);

  const stopSpeech = useCallback(() => {
    speechHandleRef.current?.cancel();
    speechHandleRef.current = null;
    stopTts();
    setIsSpeaking(false);
  }, []);

  const clearCaptureTimers = useCallback(() => {
    for (const timer of captureTimersRef.current) window.clearTimeout(timer);
    captureTimersRef.current = [];
  }, []);

  const clearSelection = useCallback(() => {
    clearCaptureTimers();
    if (watchdogRef.current !== null) {
      window.clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
    selectionRef.current = null;
    selectionSignatureRef.current = '';
    publishSelection(null);
    setSelectionState(null);
    setExpandedActions(false);
    setCopied(false);
    setSpeechError(null);
    setNoteMode(false);
    setNoteText('');
    stopSpeech();
    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      // Selection APIs are unavailable in a few embedded webviews.
    }
  }, [clearCaptureTimers, stopSpeech, publishSelection]);

  useEffect(() => {
    if (mode === 'select') return;
    clearCaptureTimers();
    if (watchdogRef.current !== null) {
      window.clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
    selectionRef.current = null;
    selectionSignatureRef.current = '';
    publishSelection(null);
    speechHandleRef.current?.cancel();
    speechHandleRef.current = null;
    stopTts();
    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      // Selection APIs are unavailable in a few embedded webviews.
    }
  }, [mode, clearCaptureTimers, publishSelection]);

  const captureSelection = useCallback(() => {
    if (mode !== 'select') return false;
    const nextState = captureWindowSelectionState();
    if (!nextState) return false;

    const signature = buildSelectionSignature(nextState);
    const changed = !selectionRef.current || selectionSignatureRef.current !== signature;
    const previousCoords = selectionRef.current?.coords;
    selectionRef.current = nextState;
    selectionSignatureRef.current = signature;

    // selectionchange fires repeatedly while Android finalises the selection.
    if (!changed) {
      if (
        !mobile &&
        (previousCoords?.x !== nextState.coords.x ||
          previousCoords?.y !== nextState.coords.y ||
          previousCoords?.isTop !== nextState.coords.isTop)
      ) {
        setSelectionState((previous) => (previous ? { ...previous, coords: nextState.coords } : previous));
      }
      return true;
    }

    setSelectionState(nextState);
    publishSelection({ page: nextState.pageNumber, rects: nextState.rects });
    setCopied(false);
    setSpeechError(null);
    setNoteMode(false);
    setNoteText('');
    stopSpeech();
    return true;
  }, [stopSpeech, mode, publishSelection, mobile]);

  const stopSelectionWatchdog = useCallback(() => {
    if (watchdogRef.current === null) return;
    window.clearInterval(watchdogRef.current);
    watchdogRef.current = null;
  }, []);

  useTextSelectionListeners({
    mode,
    mobile,
    menuRef,
    selectionRef,
    pointerActiveRef,
    captureTimersRef,
    watchdogRef,
    speechHandleRef,
    clearCaptureTimers,
    stopSelectionWatchdog,
    captureSelection,
    clearSelection,
  });

  if (!selectionState) return null;

  const overlappingAnnotation = findOverlappingSelectionAnnotation(annotations, selectionState);

  const createAnnotation = (type: TextAnnotation['type'], color: string, note?: string) => {
    const annotation = createAnnotationRecord(selectionState, type, color, note);
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
    if (isSpeaking) {
      stopSpeech();
      return;
    }

    setSpeechError(null);
    if (!canSpeakText()) {
      setSpeechError({ message: labels.speechUnsupported, voiceSettings: false });
      return;
    }

    const speechLang = detectSpeechLanguage(selectionState.text, lang);
    const textToSpeak = prepareTextForSpeech(selectionState.text);
    const noVoiceMessage =
      speechLang === 'ar' ? labels.speechNoArabicVoice : labels.speechNoEnglishVoice;

    let settled = false;
    const handle = speakText(textToSpeak, speechLang, 0.98, {
      onStart: () => {
        settled = true;
        setIsSpeaking(true);
      },
      onEnd: () => {
        settled = true;
        speechHandleRef.current = null;
        setIsSpeaking(false);
      },
      onError: (code) => {
        settled = true;
        speechHandleRef.current = null;
        setIsSpeaking(false);
        setSpeechError({
          message: code === 'language' ? noVoiceMessage : labels.speechFailed,
          voiceSettings: code === 'language'
        });
      }
    });

    if (settled) {
      handle.cancel();
      return;
    }

    speechHandleRef.current = handle;
    setIsSpeaking(true);
  };

  const barStyle: React.CSSProperties = {
    left: `${selectionState.coords.x}px`,
    top: selectionState.coords.isTop
      ? `max(${selectionState.coords.y}px, calc(env(safe-area-inset-top, 0px) + 104px))`
      : `min(${selectionState.coords.y}px, calc(100dvh - env(safe-area-inset-bottom, 0px) - 104px))`,
    transform: selectionState.coords.isTop ? 'translate(-50%, -100%)' : 'translate(-50%, 0)'
  };

  return (
    <TextSelectionToolbarCard
      menuRef={menuRef}
      lang={lang}
      mobile={mobile}
      barStyle={barStyle}
      selectionState={selectionState}
      overlappingAnnotation={overlappingAnnotation}
      selectedColor={selectedColor}
      setSelectedColor={setSelectedColor}
      copied={copied}
      isSpeaking={isSpeaking}
      speechError={speechError}
      noteMode={noteMode}
      setNoteMode={setNoteMode}
      noteText={noteText}
      setNoteText={setNoteText}
      expandedActions={expandedActions}
      setExpandedActions={setExpandedActions}
      createAnnotation={createAnnotation}
      onDeleteAnnotation={onDeleteAnnotation}
      onSearchSelectedText={onSearchSelectedText}
      onClipToBoard={onClipToBoard}
      handleCopy={() => void handleCopy()}
      handleSearch={handleSearch}
      toggleSpeech={toggleSpeech}
      clearSelection={clearSelection}
    />
  );
};
