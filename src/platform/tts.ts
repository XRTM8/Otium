import { getPlatformId, isTauriRuntime } from './runtime';

/**
 * Speech adapter shared by the selection menu.
 *
 * Android WebView does not reliably expose `speechSynthesis`, and even when it
 * does there is often no installed voice. The native `OtiumTts` bridge owns a
 * real Android TextToSpeech engine; browsers and Windows keep using the Web
 * Speech API.
 */

export type TtsErrorCode = 'unsupported' | 'init' | 'language' | 'synthesis';

export interface TtsCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (code: TtsErrorCode, detail?: string) => void;
}

export interface TtsHandle {
  cancel: () => void;
}

interface NativeTtsEvent {
  requestId?: string;
  type?: 'start' | 'done' | 'error';
  code?: string;
  message?: string;
}

interface NativeTtsBridge {
  speak?: (requestId: string, text: string, language: string, rate: number) => void;
  stop?: () => void;
  openSettings?: () => void;
}

type TtsWindow = Window & {
  OtiumTts?: NativeTtsBridge;
  __OTIUM_TTS_EVENT__?: (event: NativeTtsEvent) => void;
};

const listeners = new Map<string, TtsCallbacks>();
let listenerInstalled = false;
let requestCounter = 0;
let activeRequestId: string | null = null;

function ttsWindow(): TtsWindow | null {
  return typeof window === 'undefined' ? null : (window as TtsWindow);
}

function nativeBridge(): NativeTtsBridge | null {
  if (!isTauriRuntime() || getPlatformId() !== 'android') return null;
  const bridge = ttsWindow()?.OtiumTts;
  return bridge && typeof bridge.speak === 'function' ? bridge : null;
}

function normalizeErrorCode(code: string | undefined): TtsErrorCode {
  if (code === 'init' || code === 'language' || code === 'unsupported') return code;
  return 'synthesis';
}

function installNativeListener(): void {
  if (listenerInstalled) return;
  const win = ttsWindow();
  if (!win) return;

  listenerInstalled = true;
  win.__OTIUM_TTS_EVENT__ = (event) => {
    const requestId = event?.requestId;
    if (!requestId) return;

    const callbacks = listeners.get(requestId);
    if (!callbacks) return;

    if (event.type === 'start') {
      callbacks.onStart?.();
      return;
    }

    listeners.delete(requestId);
    if (activeRequestId === requestId) activeRequestId = null;

    if (event.type === 'done') {
      callbacks.onEnd?.();
    } else if (event.type === 'error') {
      callbacks.onError?.(normalizeErrorCode(event.code), event.message);
    }
  };
}

function webSpeechAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

/** True when the device can start speech, either natively or through the web API. */
export function canSpeakText(): boolean {
  return Boolean(nativeBridge()) || webSpeechAvailable();
}

/** Opens the Android text-to-speech settings page when the native bridge exists. */
export function openTtsSettings(): boolean {
  const bridge = nativeBridge();
  if (!bridge?.openSettings) return false;
  try {
    bridge.openSettings();
    return true;
  } catch {
    return false;
  }
}

export function stopTts(): void {
  const bridge = nativeBridge();
  listeners.clear();
  activeRequestId = null;

  try {
    bridge?.stop?.();
  } catch {
    // The native engine may already be shutting down.
  }

  if (webSpeechAvailable()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Web Speech is best-effort.
    }
  }
}

/**
 * Starts speaking the given text. Exactly one callback is guaranteed when the
 * attempt fails, so callers can always leave their "speaking" state.
 */
export function speakText(
  text: string,
  language: 'ar' | 'en',
  rate: number,
  callbacks: TtsCallbacks
): TtsHandle {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    callbacks.onError?.('synthesis', 'empty text');
    return { cancel: () => {} };
  }

  const bridge = nativeBridge();
  if (bridge?.speak) {
    installNativeListener();

    const requestId = `otium-tts-${Date.now()}-${++requestCounter}`;
    activeRequestId = requestId;
    listeners.set(requestId, callbacks);

    try {
      bridge.speak(requestId, normalized, language === 'ar' ? 'ar-SA' : 'en-US', rate);
    } catch (error) {
      listeners.delete(requestId);
      activeRequestId = null;
      callbacks.onError?.('init', error instanceof Error ? error.message : String(error));
      return { cancel: () => {} };
    }

    return {
      cancel: () => {
        listeners.delete(requestId);
        if (activeRequestId === requestId) activeRequestId = null;
        try {
          bridge.stop?.();
        } catch {
          // Ignore a bridge that is already gone.
        }
      }
    };
  }

  if (!webSpeechAvailable()) {
    callbacks.onError?.('unsupported');
    return { cancel: () => {} };
  }

  const utterance = new SpeechSynthesisUtterance(normalized);
  utterance.lang = language === 'ar' ? 'ar-SA' : 'en-US';
  utterance.rate = rate;
  utterance.pitch = 1;

  try {
    const voices = window.speechSynthesis.getVoices();
    const matching = voices.find((voice) =>
      voice.lang.toLowerCase().startsWith(language === 'ar' ? 'ar' : 'en')
    );
    if (matching) utterance.voice = matching;
  } catch {
    // Voice enumeration is optional.
  }

  let settled = false;
  let started = false;

  const startTimer = window.setTimeout(() => {
    if (settled || started) return;
    // Some WebViews report `speaking` while the first audio buffer is loading.
    if (!window.speechSynthesis.speaking) {
      settled = true;
      callbacks.onError?.('synthesis', 'no playback');
    }
  }, 2400);

  utterance.onstart = () => {
    if (settled) return;
    started = true;
    callbacks.onStart?.();
  };

  utterance.onend = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(startTimer);
    callbacks.onEnd?.();
  };

  utterance.onerror = (event) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(startTimer);
    if (event.error === 'canceled' || event.error === 'interrupted') {
      callbacks.onEnd?.();
    } else {
      callbacks.onError?.('synthesis', event.error);
    }
  };

  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    settled = true;
    window.clearTimeout(startTimer);
    callbacks.onError?.('synthesis', error instanceof Error ? error.message : String(error));
  }

  return {
    cancel: () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(startTimer);
      try {
        if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
      } catch {
        // Ignore a cancelled engine.
      }
    }
  };
}
