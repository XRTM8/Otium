import { useCallback, useEffect, useRef, useState } from 'react';
import type { Language } from '../../core/i18n/translations';
import { lanPairingCode, parseLanTarget } from './beamLanTransport';

interface UseBeamModalCameraOptions {
  isOpen: boolean;
  lang: Language;
  onDetectedRoom: (roomCode: string) => void;
}

export function useBeamModalCamera({
  isOpen,
  lang,
  onDetectedRoom,
}: UseBeamModalCameraOptions) {
  const [scanState, setScanState] = useState<{ open: boolean; active: boolean }>({
    open: isOpen,
    active: false,
  });
  const isScanningCamera = isOpen && scanState.open && scanState.active;
  const setIsScanningCamera = useCallback(
    (active: boolean) => {
      setScanState({ open: isOpen, active });
    },
    [isOpen]
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scanAnimFrameRef = useRef<number | null>(null);
  const scanRequest = useRef(0);

  const stopHardwareCamera = useCallback(() => {
    scanRequest.current++;
    if (scanAnimFrameRef.current) {
      cancelAnimationFrame(scanAnimFrameRef.current);
      scanAnimFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    stopHardwareCamera();
    setIsScanningCamera(false);
  }, [stopHardwareCamera, setIsScanningCamera]);

  useEffect(() => {
    if (!isOpen) {
      stopHardwareCamera();
    }
  }, [isOpen, stopHardwareCamera]);

  useEffect(() => () => stopHardwareCamera(), [stopHardwareCamera]);

  const startCameraScanner = async () => {
    setCameraError(null);
    stopHardwareCamera();
    const request = scanRequest.current;
    setIsScanningCamera(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 960 }, height: { ideal: 720 } },
      });
      if (scanRequest.current !== request) { stream.getTracks().forEach(track => track.stop()); return; }
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const { default: decodeQr } = await import('jsqr');
      if (scanRequest.current !== request) return;
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Could not initialize the QR reader.');
      let lastScan = 0;
      const scanLoop = (now: number) => {
        const video = videoRef.current;
        if (!video || scanRequest.current !== request) return;
        scanAnimFrameRef.current = requestAnimationFrame(scanLoop);
        if (now - lastScan < 160 || video.readyState < 2 || !video.videoWidth) return;
        lastScan = now;
        try {
          const width = Math.min(720, video.videoWidth);
          const height = Math.max(1, Math.round(video.videoHeight * width / video.videoWidth));
          if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
          context.drawImage(video, 0, 0, width, height);
          const raw = decodeQr(context.getImageData(0, 0, width, height).data, width, height,
            { inversionAttempts: 'dontInvert' })?.data;
          if (raw) {
            const target = parseLanTarget(raw);
            const match =
              raw.match(/room=([A-Za-z0-9_-]+)/) ||
              raw.match(/(OTM-[A-Za-z0-9_-]+)/i) ||
              raw.match(/^([0-9]{4,6})$/);
            const detected = target ? lanPairingCode(target) : match?.[1]?.toUpperCase();
            if (detected) {
              stopCamera();
              onDetectedRoom(detected);
              return;
            }
          }
        } catch (err) {
          console.debug('[BeamModalCamera] Frame barcode detection skipped:', err);
        }
      };
      scanAnimFrameRef.current = requestAnimationFrame(scanLoop);
    } catch (err: unknown) {
      if (scanRequest.current !== request) return;
      stopCamera();
      console.warn('Camera access error:', err);
      setCameraError(lang === 'ar' ? 'تعذر تشغيل الكاميرا، يمكنك كتابة الكود يدوياً' : 'Camera inaccessible, enter code manually');
    }
  };

  return {
    isScanningCamera,
    cameraError,
    videoRef,
    stopCamera,
    startCameraScanner,
  };
}
