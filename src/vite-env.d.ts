/// <reference types="vite/client" />

export {};

declare global {
  const __APP_VERSION__: string;

  interface OtiumBarcodeResult {
    rawValue: string;
    format: string;
  }

  interface OtiumBarcodeDetectorInstance {
    detect(source: HTMLCanvasElement | HTMLVideoElement | ImageBitmap): Promise<OtiumBarcodeResult[]>;
  }

  interface OtiumBarcodeDetectorConstructor {
    new (options: { formats: string[] }): OtiumBarcodeDetectorInstance;
    getSupportedFormats(): Promise<string[]>;
  }

  interface OtiumImageCaptureInstance {
    grabFrame?: () => Promise<ImageBitmap>;
    takePhoto?: () => Promise<Blob>;
  }

  interface OtiumWakeLockSentinel {
    released: boolean;
    release: () => Promise<void>;
    addEventListener: (type: string, listener: () => void) => void;
  }

  interface Window {
    __OTIUM_HANDLE_BACK__?: () => boolean;
    __OTIUM_CHECK_INCOMING_PDF__?: () => Promise<void>;
    __VITEST__?: boolean;
    OtiumTheme?: {
      setTheme?: (mode: string, background: string, lightTheme: boolean) => void;
    };
    webkitAudioContext?: typeof AudioContext;
    BarcodeDetector?: OtiumBarcodeDetectorConstructor;
    ImageCapture?: new (track: MediaStreamTrack) => OtiumImageCaptureInstance;
  }

  interface Navigator {
    wakeLock?: {
      request: (type: 'screen') => Promise<OtiumWakeLockSentinel>;
    };
  }
}
