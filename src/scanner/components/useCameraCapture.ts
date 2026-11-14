import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { playShutterSound } from '../core/audio';
import type { Language } from '../../core/i18n/translations';
import type { CropMode, Quad } from '../core/types';
import {
  analyzeLiveVideoFrame,
  pageContentChanged,
  cropIdCardSide,
  mergeIdCardSides,
  tryCaptureVideoCanvas,
  tryTakeCameraPhoto,
} from './cameraCaptureHelpers';

interface MediaTrackFocusCapabilities extends MediaTrackCapabilities {
  focusMode?: string[];
}

interface MediaTrackFocusConstraintSet extends MediaTrackConstraintSet {
  focusMode?: string;
  pointsOfInterest?: { x: number; y: number }[];
}

export interface UseCameraCaptureOptions {
  cropMode: CropMode;
  viewfinderFit: 'contain' | 'cover';
  autoCapture: boolean;
  facingMode: 'environment' | 'user';
  scanMode: 'document' | 'idcard';
  lang?: Language;
  paused?: boolean;
  inactive?: boolean;
  idCardStep: 'front' | 'back';
  setIdCardStep: (step: 'front' | 'back') => void;
  idFront: HTMLCanvasElement | null;
  setIdFront: (canvas: HTMLCanvasElement | null) => void;
  setIdStatusToast: (msg: string) => void;
  setCaptureToast: (msg: string) => void;
  setTorchOn: (on: boolean) => void;
  triggerHaptic: (duration?: number) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onCapture: (images: Blob[], autoCrop: boolean) => Promise<number>;
}

export function useCameraCapture(options: UseCameraCaptureOptions) {
  const {
    cropMode, viewfinderFit, autoCapture, facingMode, scanMode, idCardStep, lang = 'ar', paused = false, inactive = false,
    setIdCardStep, idFront, setIdFront, setIdStatusToast,
    setCaptureToast, setTorchOn, triggerHaptic, fileInputRef, onCapture,
  } = options;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewfinderRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevFrameLumRef = useRef<Uint8Array | null>(null);
  const stabilityStepRef = useRef<number>(0);
  const cameraRequestRef = useRef(0);
  const captureLock = useRef(false);
  const previousQuad = useRef<Quad | null>(null);
  const waitingForNextPage = useRef(false);
  const missingFrames = useRef(0);
  const currentSignature = useRef<Int8Array | null>(null);
  const capturedSignature = useRef<Int8Array | null>(null);
  const previousSignature = useRef<Int8Array | null>(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [flashAnimation, setFlashAnimation] = useState(false);
  const [stabilityProgress, setStabilityProgress] = useState<number>(0);
  const [liveQuad, setLiveQuad] = useState<Quad | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [renderedBounds, setRenderedBounds] = useState<{
    x: number; y: number; width: number; height: number;
  } | null>(null);

  const visibleQuad = hasPermission && stream && !capturing && !paused ? liveQuad : null;
  const effectiveStabilityProgress = hasPermission && stream && !capturing && !paused ? stabilityProgress : 0;

  const stopCamera = useCallback(() => {
    cameraRequestRef.current++;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const initCamera = useCallback(async () => {
    stopCamera();
    const request = cameraRequestRef.current;
    setStream(null);
    setHasPermission(null);
    setLiveQuad(null);
    setStabilityProgress(0);
    stabilityStepRef.current = 0;
    prevFrameLumRef.current = null;
    previousQuad.current = null;
    waitingForNextPage.current = false;
    currentSignature.current = null;
    capturedSignature.current = null;
    previousSignature.current = null;
    missingFrames.current = 0;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      console.warn('Camera API (navigator.mediaDevices.getUserMedia) is not available');
      setHasPermission(false);
      return;
    }

    const constraintList: MediaStreamConstraints[] = [
      { video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
      { video: { facingMode }, audio: false },
      { video: true, audio: false },
    ];

    let acquiredStream: MediaStream | null = null;
    for (const constraints of constraintList) {
      try {
        acquiredStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (acquiredStream) break;
      } catch (err) {
        if (request !== cameraRequestRef.current) return;
        if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
          setHasPermission(false);
          return;
        }
        console.warn('Camera constraint tier failed, trying next:', err);
      }
    }

    if (request !== cameraRequestRef.current) {
      acquiredStream?.getTracks().forEach((track) => track.stop());
      return;
    }
    if (acquiredStream) {
      streamRef.current = acquiredStream;
      setStream(acquiredStream);
      setHasPermission(true);
    } else {
      console.warn('All camera constraints failed');
      setHasPermission(false);
    }
  }, [facingMode, stopCamera]);

  useEffect(() => {
    if (inactive) return;
    let mounted = true;
    void Promise.resolve().then(() => { if (mounted) void initCamera(); });
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTorchOn(false);
        stopCamera();
        setStream(null);
      } else {
        void initCamera();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopCamera();
    };
  }, [inactive, initCamera, setTorchOn, stopCamera]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
      video.play().catch((err) => console.warn('Video auto-play interrupted:', err));
    }
  }, [stream]);

  const updateRenderedBounds = useCallback(() => {
    const video = videoRef.current;
    const container = viewfinderRef.current;
    if (!video || !container || video.videoWidth === 0 || video.videoHeight === 0) return;
    const cWidth = container.clientWidth;
    const cHeight = container.clientHeight;
    if (cWidth === 0 || cHeight === 0) return;
    const scale =
      viewfinderFit === 'contain'
        ? Math.min(cWidth / video.videoWidth, cHeight / video.videoHeight)
        : Math.max(cWidth / video.videoWidth, cHeight / video.videoHeight);
    const renderedW = Math.round(video.videoWidth * scale);
    const renderedH = Math.round(video.videoHeight * scale);
    setRenderedBounds({
      x: Math.round((cWidth - renderedW) / 2),
      y: Math.round((cHeight - renderedH) / 2),
      width: renderedW,
      height: renderedH,
    });
  }, [viewfinderFit]);

  useEffect(() => {
    updateRenderedBounds();
    window.addEventListener('resize', updateRenderedBounds);
    return () => window.removeEventListener('resize', updateRenderedBounds);
  }, [updateRenderedBounds]);

  const handleViewfinderTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = viewfinderRef.current?.getBoundingClientRect();
    if (!rect) return;
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const bounds = renderedBounds;
    const track = stream?.getVideoTracks()[0];
    if (!bounds || !track) return;
    const x = (point.x - bounds.x) / bounds.width;
    const y = (point.y - bounds.y) / bounds.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    try {
      const capabilities = track.getCapabilities?.() as MediaTrackFocusCapabilities | undefined;
      if (!capabilities?.focusMode?.includes('single-shot')) return;
      const focusConstraint: MediaTrackFocusConstraintSet = { focusMode: 'single-shot', pointsOfInterest: [{ x, y }] };
      void track.applyConstraints({ advanced: [focusConstraint] }).then(() => {
        setFocusPoint(point);
        triggerHaptic(12);
        window.setTimeout(() => setFocusPoint(null), 900);
      }).catch(console.debug);
    } catch (error) {
      console.debug('Point focus unavailable:', error);
    }
  };

  const handleCapture = useCallback(async () => {
    if (captureLock.current || paused) return;
    if (!stream) {
      fileInputRef.current?.click();
      return;
    }
    captureLock.current = true;
    const cameraRequest = cameraRequestRef.current;
    const signatureAtShutter = currentSignature.current;
    setCapturing(true);
    setCaptureToast('');
    triggerHaptic(35);
    playShutterSound();
    setFlashAnimation(true);
    window.setTimeout(() => setFlashAnimation(false), 120);
    try {
      const started = performance.now();
      const still = await tryTakeCameraPhoto(stream);
      const blob = still ?? await tryCaptureVideoCanvas(videoRef.current);
      if (import.meta.env.DEV) {
        console.debug('Scan shutter', { source: still ? 'still' : blob ? 'video' : 'none', ms: Math.round(performance.now() - started), bytes: blob?.size });
      }
      if (cameraRequest !== cameraRequestRef.current) return;
      if (!blob) throw new Error('No camera image available');
      if (scanMode === 'idcard') {
        const side = await cropIdCardSide(blob);
        if (cameraRequest !== cameraRequestRef.current) return;
        if (!side) {
          setIdStatusToast(lang === 'ar' ? 'أظهر الحواف الأربع للبطاقة وأعد التصوير' : 'Show all four card edges and try again');
          return;
        }
        if (idCardStep === 'front' || !idFront) {
          setIdFront(side);
          setIdCardStep('back');
          setIdStatusToast('');
          return;
        }
        const merged = await mergeIdCardSides(idFront, side);
        side.width = side.height = 1;
        if (!merged?.size || cameraRequest !== cameraRequestRef.current) return;
        if (await onCapture([merged], false) !== 1) throw new Error('ID card could not be saved');
        setIdFront(null);
        setIdCardStep('front');
        setIdStatusToast('');
      } else {
        if (await onCapture([blob], cropMode === 'auto') !== 1) throw new Error('Page could not be saved');
        waitingForNextPage.current = true;
        capturedSignature.current = signatureAtShutter;
        missingFrames.current = 0;
      }
    } catch (error) {
      console.warn('Scan capture failed:', error);
      setCaptureToast(lang === 'ar' ? 'تعذّر التقاط الصفحة أو حفظها. أعد المحاولة.' : 'Could not capture or save the page. Try again.');
    } finally {
      captureLock.current = false;
      setCapturing(false);
    }
  }, [cropMode, fileInputRef, idCardStep, idFront, lang, onCapture, paused, scanMode, setCaptureToast,
    setIdCardStep, setIdFront, setIdStatusToast, stream, triggerHaptic]);

  const handleCaptureRef = useRef(handleCapture);
  useEffect(() => { handleCaptureRef.current = handleCapture; }, [handleCapture]);

  const autoCaptureRef = useRef(autoCapture);
  useEffect(() => { autoCaptureRef.current = autoCapture; }, [autoCapture]);

  useEffect(() => {
    if (!hasPermission || !stream || paused || capturing || cropMode !== 'auto' || scanMode === 'idcard') return;
    let cancelled = false;
    let resetWasmPrev = true;
    let analysisBusy = false;

    const intervalId = window.setInterval(async () => {
      if (analysisBusy || cancelled) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0 || capturing) return;
      analysisBusy = true;
      try {
        const canvas = scratchCanvasRef.current ??= document.createElement('canvas');
        const scale = Math.min(1, 260 / Math.max(video.videoWidth, video.videoHeight));
        const width = Math.max(1, Math.round(video.videoWidth * scale));
        const height = Math.max(1, Math.round(video.videoHeight * scale));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          resetWasmPrev = true;
          previousQuad.current = null;
        }
        const metrics = await analyzeLiveVideoFrame(video, canvas, prevFrameLumRef.current, resetWasmPrev);
        resetWasmPrev = false;
        if (cancelled || !metrics) return;
        prevFrameLumRef.current = metrics.nextLum;
        currentSignature.current = metrics.pageSignature;
        const quad = metrics.quad;
        const normalized = quad && {
          topLeft: { x: quad.topLeft.x / width, y: quad.topLeft.y / height },
          topRight: { x: quad.topRight.x / width, y: quad.topRight.y / height },
          bottomRight: { x: quad.bottomRight.x / width, y: quad.bottomRight.y / height },
          bottomLeft: { x: quad.bottomLeft.x / width, y: quad.bottomLeft.y / height },
        };
        const previous = previousQuad.current;
        previousQuad.current = normalized;
        setLiveQuad(normalized);
        missingFrames.current = normalized ? 0 : missingFrames.current + 1;
        if (missingFrames.current >= 2) waitingForNextPage.current = false;

        const stable = previous && normalized && (['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const)
          .every((corner) => Math.hypot(previous[corner].x - normalized[corner].x, previous[corner].y - normalized[corner].y) <= 0.025);
        const signature = metrics.pageSignature;
        const previousContent = previousSignature.current;
        previousSignature.current = signature;
        const differentContent = capturedSignature.current && signature && previousContent &&
          pageContentChanged(capturedSignature.current, signature) && !pageContentChanged(previousContent, signature);
        if (autoCaptureRef.current && metrics.reliableCrop && (!waitingForNextPage.current || differentContent) && stable && metrics.motionScore < 8.5 && metrics.sharpness >= 15) {
          stabilityStepRef.current += 1;
          setStabilityProgress(Math.min(100, Math.round(stabilityStepRef.current / 3 * 100)));
          if (stabilityStepRef.current >= 3) {
            stabilityStepRef.current = 0;
            previousQuad.current = null;
            waitingForNextPage.current = true;
            missingFrames.current = 0;
            setStabilityProgress(0);
            void handleCaptureRef.current();
          }
        } else {
          stabilityStepRef.current = 0;
          setStabilityProgress(0);
        }
      } catch (error) {
        if (cancelled) return;
        console.warn('Camera frame analysis failed:', error);
        stabilityStepRef.current = 0;
        setLiveQuad(null);
        setStabilityProgress(0);
      } finally {
        analysisBusy = false;
      }
    }, 220);

    return () => {
      cancelled = true;
      previousQuad.current = null;
      previousSignature.current = null;
      stabilityStepRef.current = 0;
      window.clearInterval(intervalId);
    };
  }, [capturing, cropMode, hasPermission, paused, scanMode, stream]);

  return {
    videoRef, viewfinderRef, hasPermission, stream, capturing, flashAnimation, renderedBounds,
    visibleQuad, effectiveStabilityProgress, focusPoint,
    initCamera, updateRenderedBounds, handleViewfinderTap, handleCapture,
  };
}
