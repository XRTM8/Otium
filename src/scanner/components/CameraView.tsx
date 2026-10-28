import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  Image as ImageIcon,
  Zap,
  ZapOff,
  ScanLine,
  Sparkles,
  CreditCard,
  FileCheck2,
  FileText,
  Volume2,
  VolumeX,
  RefreshCw,
  Settings,
  ArrowLeft,
  Crop,
  Maximize2,
} from 'lucide-react';
import { OtiumLogo } from './OtiumLogo';
import { playShutterSound } from '../core/audio';
import { mergeIdCardSidesToA4 } from '../core/idCard';
import { calculateLaplacianSharpness, detectDocumentCorners, getFullFrameQuad } from '../core/edgeDetection';
import type { Point, Quad, CropMode } from '../core/types';

interface CameraViewProps {
  onCapture: (imageDataUrl: string, isBatchMode: boolean, detectedQuad?: Quad) => void;
  pagesCount: number;
  lastThumbnail?: string;
  onFinishBatch: () => void;
  onOpenLibrary?: () => void;
  onOpenSettings?: () => void;
}

export const CameraView: React.FC<CameraViewProps> = ({
  onCapture,
  pagesCount,
  lastThumbnail,
  onFinishBatch,
  onOpenLibrary,
  onOpenSettings,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewfinderRef = useRef<HTMLDivElement | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [scanMode, setScanMode] = useState<'batch' | 'single' | 'idcard'>('batch');
  const [idCardStep, setIdCardStep] = useState<'front' | 'back'>('front');
  const [idFrontDataUrl, setIdFrontDataUrl] = useState<string | null>(null);
  const [idStatusToast, setIdStatusToast] = useState<string>('');
  const [capturing, setCapturing] = useState(false);
  const [flashAnimation, setFlashAnimation] = useState(false);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(false);
  const [cropMode, setCropMode] = useState<CropMode>(() => {
    try {
      return (localStorage.getItem('otium_scan_crop_mode') as CropMode) || 'full';
    } catch {
      return 'full';
    }
  });
  const [viewfinderFit, setViewfinderFit] = useState<'contain' | 'cover'>(() => {
    try {
      return (localStorage.getItem('otium_scan_viewfinder_fit') as 'contain' | 'cover') || 'contain';
    } catch {
      return 'contain';
    }
  });
  const [renderedBounds, setRenderedBounds] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [captureToast, setCaptureToast] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleToggleCropMode = useCallback(() => {
    setCropMode((prev) => {
      const next: CropMode = prev === 'full' ? 'auto' : 'full';
      try {
        localStorage.setItem('otium_scan_crop_mode', next);
      } catch {}
      setCaptureToast(
        next === 'full'
          ? '🔲 تم تفعيل كامل الإطار (يدوي): حفظ الصورة كاملة بدون قص'
          : '📐 تم تفعيل التحديد الذكي: كشف أطراف المستند وإزالة الخلفية'
      );
      setTimeout(() => setCaptureToast(''), 2500);
      return next;
    });
  }, []);

  const handleToggleViewfinderFit = useCallback(() => {
    setViewfinderFit((prev) => {
      const next = prev === 'contain' ? 'cover' : 'contain';
      try {
        localStorage.setItem('otium_scan_viewfinder_fit', next);
      } catch {}
      setCaptureToast(
        next === 'contain'
          ? '🔲 عرض الحساس 100%: ما تراه في الشاشة هو ما يُلتقط بالضبط'
          : '📱 ملء الشاشة: توسيع الصورة لتملأ شاشة الهاتف'
      );
      setTimeout(() => setCaptureToast(''), 2500);
      return next;
    });
  }, []);

  // Live Real-Time Document Quad Tracker State
  const [liveScreenQuad, setLiveScreenQuad] = useState<{
    topLeft: Point;
    topRight: Point;
    bottomRight: Point;
    bottomLeft: Point;
  } | null>(null);
  const [isQuadSteady, setIsQuadSteady] = useState(false);
  const liveNormalizedQuadRef = useRef<Quad | null>(null);
  const trackerCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Sensor & Device States
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isMuted, setIsMuted] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [tiltAngle, setTiltAngle] = useState<{ x: number; y: number; isLevel: boolean }>({ x: 0, y: 0, isLevel: true });

  const initCamera = useCallback(async (targetFacingMode?: 'environment' | 'user') => {
    const activeFacing = targetFacingMode || facingMode;
    // Cleanly stop any existing stream tracks first
    setStream((prev) => {
      if (prev) {
        prev.getTracks().forEach((track) => track.stop());
      }
      return null;
    });

    // Ultra-compatible camera constraints for Android WebView
    const constraintList: MediaStreamConstraints[] = [
      {
        video: {
          facingMode: { ideal: activeFacing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      },
      {
        video: { facingMode: activeFacing },
        audio: false,
      },
      {
        video: true,
        audio: false,
      },
    ];

    let acquiredStream: MediaStream | null = null;
    for (const constraints of constraintList) {
      try {
        acquiredStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (acquiredStream) break;
      } catch (err) {
        console.warn('Camera constraint tier failed, trying next:', err);
      }
    }

    if (acquiredStream) {
      setStream(acquiredStream);
      setHasPermission(true);
      if (videoRef.current) {
        videoRef.current.srcObject = acquiredStream;
        videoRef.current.play().catch(console.warn);
      }
    } else {
      console.warn('All camera constraints failed');
      setHasPermission(false);
    }
  }, [facingMode]);

  useEffect(() => {
    initCamera();

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTorchOn(false);
        setStream((prev) => {
          if (prev) {
            prev.getTracks().forEach((t) => t.stop());
          }
          return null;
        });
      } else {
        initCamera();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      setStream((prevStream) => {
        if (prevStream) {
          prevStream.getTracks().forEach((track) => track.stop());
        }
        return null;
      });
    };
  }, [initCamera]);

  // Synchronize stream with video DOM element reliably
  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
      video.play().catch((err) => {
        console.warn('Video auto-play interrupted:', err);
      });
    }
  }, [stream]);

  const triggerHaptic = (duration = 25) => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(duration);
      } catch {}
    }
  };

  // 2D Gyroscope Spirit Level Tracker
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      const roll = e.gamma;
      const pitch = e.beta;
      const devX = Math.max(-1, Math.min(1, roll / 20));
      const devY = Math.max(-1, Math.min(1, (pitch > 45 ? pitch - 90 : pitch) / 20));
      const isLevel = Math.abs(roll) < 4.5 && (Math.abs(pitch) < 4.5 || Math.abs(pitch - 90) < 4.5);
      setTiltAngle({ x: devX, y: devY, isLevel });
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);

  const updateRenderedBounds = useCallback(() => {
    const video = videoRef.current;
    const container = viewfinderRef.current;
    if (!video || !container || video.videoWidth === 0 || video.videoHeight === 0) return;
    const vWidth = video.videoWidth;
    const vHeight = video.videoHeight;
    const cWidth = container.clientWidth;
    const cHeight = container.clientHeight;
    if (cWidth === 0 || cHeight === 0) return;

    const scale = viewfinderFit === 'contain'
      ? Math.min(cWidth / vWidth, cHeight / vHeight)
      : Math.max(cWidth / vWidth, cHeight / vHeight);
    const renderedW = Math.round(vWidth * scale);
    const renderedH = Math.round(vHeight * scale);
    const offsetX = Math.round((cWidth - renderedW) / 2);
    const offsetY = Math.round((cHeight - renderedH) / 2);

    setRenderedBounds({ x: offsetX, y: offsetY, width: renderedW, height: renderedH });
  }, [viewfinderFit]);

  useEffect(() => {
    updateRenderedBounds();
    window.addEventListener('resize', updateRenderedBounds);
    return () => window.removeEventListener('resize', updateRenderedBounds);
  }, [updateRenderedBounds]);

  const handleViewfinderTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = viewfinderRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setFocusPoint({ x, y });
    triggerHaptic(12);

    if (stream) {
      const track = stream.getVideoTracks()[0];
      try {
        const capabilities = track.getCapabilities?.() as any;
        if (capabilities?.focusMode?.includes('continuous')) {
          track.applyConstraints({
            advanced: [{ focusMode: 'continuous' } as any],
          }).catch(() => {});
        }
      } catch {}
    }

    setTimeout(() => setFocusPoint(null), 1200);
  };

  const handleCapture = useCallback(async () => {
    if (capturing) return;
    triggerHaptic(35);
    if (!isMuted) {
      playShutterSound();
    }
    setCapturing(true);

    // Shutter flash animation
    setFlashAnimation(true);
    setTimeout(() => setFlashAnimation(false), 120);

    const processCapturedImage = async (
      dataUrl: string,
      frameW?: number,
      frameH?: number,
      sourceCanvas?: HTMLCanvasElement
    ) => {
      let detectedQuad: Quad | undefined = undefined;
      if (cropMode === 'full') {
        if (frameW && frameH && frameW > 0 && frameH > 0) {
          detectedQuad = getFullFrameQuad(frameW, frameH, 0.005);
        }
      } else {
        const norm = liveNormalizedQuadRef.current;
        if (norm && frameW && frameH && frameW > 0 && frameH > 0) {
          detectedQuad = {
            topLeft: { x: Math.round(norm.topLeft.x * frameW), y: Math.round(norm.topLeft.y * frameH) },
            topRight: { x: Math.round(norm.topRight.x * frameW), y: Math.round(norm.topRight.y * frameH) },
            bottomRight: { x: Math.round(norm.bottomRight.x * frameW), y: Math.round(norm.bottomRight.y * frameH) },
            bottomLeft: { x: Math.round(norm.bottomLeft.x * frameW), y: Math.round(norm.bottomLeft.y * frameH) },
          };
        } else if (sourceCanvas) {
          try {
            detectedQuad = detectDocumentCorners(sourceCanvas);
          } catch {
            if (frameW && frameH) detectedQuad = getFullFrameQuad(frameW, frameH, 0.005);
          }
        } else if (frameW && frameH && frameW > 0 && frameH > 0) {
          detectedQuad = getFullFrameQuad(frameW, frameH, 0.005);
        }
      }

      if (scanMode === 'idcard') {
        if (idCardStep === 'front') {
          setIdFrontDataUrl(dataUrl);
          setIdCardStep('back');
          setIdStatusToast('✓ تم تصوير الوجه الأمامي — الآن اقلب الهوية وصور الوجه الخلفي');
          setTimeout(() => setIdStatusToast(''), 3500);
          setCapturing(false);
          return;
        } else if (idFrontDataUrl) {
          setIdStatusToast('⏳ جاري دمج وجهي الهوية على ورقة A4...');
          try {
            const [frontImg, backImg] = await Promise.all([
              new Promise<HTMLImageElement>((res, rej) => {
                const img = new Image();
                img.onload = () => res(img);
                img.onerror = rej;
                img.src = idFrontDataUrl;
              }),
              new Promise<HTMLImageElement>((res, rej) => {
                const img = new Image();
                img.onload = () => res(img);
                img.onerror = rej;
                img.src = dataUrl;
              }),
            ]);

            const makeCanvas = (img: HTMLImageElement) => {
              const c = document.createElement('canvas');
              c.width = img.naturalWidth;
              c.height = img.naturalHeight;
              const ctx = c.getContext('2d');
              if (ctx) ctx.drawImage(img, 0, 0);
              return c;
            };

            const mergedCanvas = await mergeIdCardSidesToA4(makeCanvas(frontImg), makeCanvas(backImg));
            const mergedDataUrl = mergedCanvas.toDataURL('image/jpeg', 0.92);

            setIdFrontDataUrl(null);
            setIdCardStep('front');
            setIdStatusToast('');
            setCapturing(false);
            setCaptureToast('✓ تم دمج الهوية بنجاح!');
            setTimeout(() => setCaptureToast(''), 2000);
            onCapture(mergedDataUrl, false);
            return;
          } catch (e) {
            console.warn('ID Card merge failed:', e);
          }
        }
      }

      setCapturing(false);
      const isBatch = scanMode === 'batch';
      setCaptureToast(isBatch ? `✓ تمت إضافة صفحة ${pagesCount + 1}` : '✓ تم حفظ الصورة');
      setTimeout(() => setCaptureToast(''), 1800);
      onCapture(dataUrl, isBatch, detectedQuad);
    };

    const checkCanvasNonBlack = (ctx: CanvasRenderingContext2D, w: number, h: number): boolean => {
      try {
        const pts = [
          { x: Math.floor(w * 0.5), y: Math.floor(h * 0.5) },
          { x: Math.floor(w * 0.25), y: Math.floor(h * 0.25) },
          { x: Math.floor(w * 0.75), y: Math.floor(h * 0.25) },
          { x: Math.floor(w * 0.25), y: Math.floor(h * 0.75) },
          { x: Math.floor(w * 0.75), y: Math.floor(h * 0.75) },
          { x: Math.floor(w * 0.5), y: Math.floor(h * 0.3) },
          { x: Math.floor(w * 0.5), y: Math.floor(h * 0.7) },
        ];
        let total = 0;
        let nonZeroCount = 0;
        for (const p of pts) {
          const pixel = ctx.getImageData(p.x, p.y, 1, 1).data;
          total += pixel[0] + pixel[1] + pixel[2];
          if (pixel[3] > 0 && (pixel[0] > 0 || pixel[1] > 0 || pixel[2] > 0)) {
            nonZeroCount++;
          }
        }
        const avg = total / (pts.length * 3);
        return avg >= 5 && nonZeroCount >= 3;
      } catch {
        return true;
      }
    };

    const tryGrabFrame = async (): Promise<{
      dataUrl: string;
      width: number;
      height: number;
      canvas?: HTMLCanvasElement;
    } | null> => {
      if (!stream) return null;
      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState !== 'live') return null;

      const ImageCaptureConstructor = (window as unknown as { ImageCapture?: new (track: MediaStreamTrack) => any }).ImageCapture;
      if (typeof ImageCaptureConstructor === 'function') {
        try {
          const capturer = new ImageCaptureConstructor(track);
          if (typeof capturer.grabFrame === 'function') {
            const bitmap = await capturer.grabFrame();
            if (bitmap && bitmap.width > 0 && bitmap.height > 0) {
              const canvas = document.createElement('canvas');
              canvas.width = bitmap.width;
              canvas.height = bitmap.height;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(bitmap, 0, 0);
                if (checkCanvasNonBlack(ctx, canvas.width, canvas.height)) {
                  return {
                    dataUrl: canvas.toDataURL('image/jpeg', 0.95),
                    width: canvas.width,
                    height: canvas.height,
                    canvas,
                  };
                }
              }
            }
          }
        } catch (e) {
          console.warn('ImageCapture.grabFrame fallback:', e);
        }
      }
      return null;
    };

    const tryTakePhoto = async (): Promise<{ dataUrl: string; width: number; height: number } | null> => {
      if (!stream) return null;
      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState !== 'live') return null;

      const ImageCaptureConstructor = (window as unknown as { ImageCapture?: new (track: MediaStreamTrack) => any }).ImageCapture;
      if (typeof ImageCaptureConstructor === 'function') {
        try {
          const capturer = new ImageCaptureConstructor(track);
          if (typeof capturer.takePhoto === 'function') {
            const blob: Blob = await capturer.takePhoto();
            if (blob && blob.size > 2000) {
              const dataUrl = await new Promise<string>((res, rej) => {
                const reader = new FileReader();
                reader.onload = () => res(reader.result as string);
                reader.onerror = rej;
                reader.readAsDataURL(blob);
              });
              const img = await new Promise<HTMLImageElement>((res, rej) => {
                const i = new Image();
                i.onload = () => res(i);
                i.onerror = rej;
                i.src = dataUrl;
              });
              return { dataUrl, width: img.naturalWidth, height: img.naturalHeight };
            }
          }
        } catch (e) {
          console.warn('ImageCapture.takePhoto fallback:', e);
        }
      }
      return null;
    };

    const tryVideoCanvas = async (): Promise<{
      dataUrl: string;
      width: number;
      height: number;
      canvas?: HTMLCanvasElement;
    } | null> => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return null;

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (!checkCanvasNonBlack(ctx, canvas.width, canvas.height)) {
        await new Promise((r) => requestAnimationFrame(r));
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }

      return {
        dataUrl: canvas.toDataURL('image/jpeg', 0.95),
        width: canvas.width,
        height: canvas.height,
        canvas,
      };
    };

    try {
      let captureResult = await tryVideoCanvas();
      if (!captureResult) {
        captureResult = await tryGrabFrame();
      }
      if (!captureResult) {
        captureResult = await tryTakePhoto();
      }

      if (captureResult) {
        await processCapturedImage(
          captureResult.dataUrl,
          captureResult.width,
          captureResult.height,
          (captureResult as any).canvas
        );
      } else {
        fileInputRef.current?.click();
        setCapturing(false);
      }
    } catch (err) {
      console.warn('Capture error:', err);
      fileInputRef.current?.click();
      setCapturing(false);
    }
  }, [capturing, cropMode, idCardStep, idFrontDataUrl, isMuted, onCapture, pagesCount, scanMode, stream]);

  // Real-Time Live Document Boundary Tracker (15-20 FPS, Lerp-smoothed)
  useEffect(() => {
    if (hasPermission !== true || scanMode === 'idcard' || cropMode === 'full') {
      setLiveScreenQuad(null);
      liveNormalizedQuadRef.current = null;
      setIsQuadSteady(false);
      return;
    }

    let animationFrameId: number;
    let lastSampleTime = 0;
    let steadyFramesCount = 0;
    let lastCornerPos: Point | null = null;

    const sampleIntervalMs = 60; // Smooth 16 FPS with negligible CPU impact

    const trackLoop = (timestamp: number) => {
      animationFrameId = requestAnimationFrame(trackLoop);

      if (document.hidden) return;
      if (timestamp - lastSampleTime < sampleIntervalMs) return;
      lastSampleTime = timestamp;

      const video = videoRef.current;
      const container = viewfinderRef.current;
      if (!video || !container || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        return;
      }

      const vWidth = video.videoWidth;
      const vHeight = video.videoHeight;
      const cWidth = container.clientWidth;
      const cHeight = container.clientHeight;
      if (cWidth === 0 || cHeight === 0) return;

      if (!trackerCanvasRef.current) {
        trackerCanvasRef.current = document.createElement('canvas');
      }
      const canvas = trackerCanvasRef.current;
      const sampleW = 160;
      const sampleH = Math.round(160 * (vHeight / vWidth));
      if (canvas.width !== sampleW || canvas.height !== sampleH) {
        canvas.width = sampleW;
        canvas.height = sampleH;
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, sampleW, sampleH);

      const detected = detectDocumentCorners(canvas);

      const normQuad: Quad = {
        topLeft: { x: detected.topLeft.x / sampleW, y: detected.topLeft.y / sampleH },
        topRight: { x: detected.topRight.x / sampleW, y: detected.topRight.y / sampleH },
        bottomRight: { x: detected.bottomRight.x / sampleW, y: detected.bottomRight.y / sampleH },
        bottomLeft: { x: detected.bottomLeft.x / sampleW, y: detected.bottomLeft.y / sampleH },
      };

      const isTrivialFullFrame =
        normQuad.topLeft.x < 0.04 && normQuad.topLeft.y < 0.04 &&
        normQuad.bottomRight.x > 0.96 && normQuad.bottomRight.y > 0.96;

      if (isTrivialFullFrame) {
        setLiveScreenQuad(null);
        liveNormalizedQuadRef.current = null;
        setIsQuadSteady(false);
        steadyFramesCount = 0;
        return;
      }

      // Lerp smoothing (EMA alpha = 0.35)
      if (!liveNormalizedQuadRef.current) {
        liveNormalizedQuadRef.current = {
          topLeft: { ...normQuad.topLeft },
          topRight: { ...normQuad.topRight },
          bottomRight: { ...normQuad.bottomRight },
          bottomLeft: { ...normQuad.bottomLeft },
        };
      } else {
        const cur = liveNormalizedQuadRef.current;
        const alpha = 0.35;
        cur.topLeft.x += (normQuad.topLeft.x - cur.topLeft.x) * alpha;
        cur.topLeft.y += (normQuad.topLeft.y - cur.topLeft.y) * alpha;
        cur.topRight.x += (normQuad.topRight.x - cur.topRight.x) * alpha;
        cur.topRight.y += (normQuad.topRight.y - cur.topRight.y) * alpha;
        cur.bottomRight.x += (normQuad.bottomRight.x - cur.bottomRight.x) * alpha;
        cur.bottomRight.y += (normQuad.bottomRight.y - cur.bottomRight.y) * alpha;
        cur.bottomLeft.x += (normQuad.bottomLeft.x - cur.bottomLeft.x) * alpha;
        cur.bottomLeft.y += (normQuad.bottomLeft.y - cur.bottomLeft.y) * alpha;
      }

      const cur = liveNormalizedQuadRef.current;

      // Steady movement tracking
      if (lastCornerPos) {
        const delta = Math.hypot(cur.topLeft.x - lastCornerPos.x, cur.topLeft.y - lastCornerPos.y);
        if (delta < 0.015) {
          steadyFramesCount++;
        } else {
          steadyFramesCount = Math.max(0, steadyFramesCount - 1);
        }
      }
      lastCornerPos = { x: cur.topLeft.x, y: cur.topLeft.y };
      const steady = steadyFramesCount >= 5;
      setIsQuadSteady(steady);

      // Map to container coordinates based on viewfinderFit
      const scale = viewfinderFit === 'contain'
        ? Math.min(cWidth / vWidth, cHeight / vHeight)
        : Math.max(cWidth / vWidth, cHeight / vHeight);
      const renderedW = Math.round(vWidth * scale);
      const renderedH = Math.round(vHeight * scale);
      const offsetX = Math.round((cWidth - renderedW) / 2);
      const offsetY = Math.round((cHeight - renderedH) / 2);

      setRenderedBounds({ x: offsetX, y: offsetY, width: renderedW, height: renderedH });

      const mapPt = (p: Point) => ({
        x: Math.round(offsetX + p.x * renderedW),
        y: Math.round(offsetY + p.y * renderedH),
      });

      setLiveScreenQuad({
        topLeft: mapPt(cur.topLeft),
        topRight: mapPt(cur.topRight),
        bottomRight: mapPt(cur.bottomRight),
        bottomLeft: mapPt(cur.bottomLeft),
      });
    };

    animationFrameId = requestAnimationFrame(trackLoop);
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [cropMode, hasPermission, scanMode, viewfinderFit]);

  // Enterprise Hands-Free Auto-Capture Engine
  useEffect(() => {
    if (!autoCaptureEnabled || hasPermission !== true) return;

    let isChecking = false;
    let steadyCount = 0;
    let lastSharpness = 0;
    let lastCaptureTime = 0;

    const intervalId = setInterval(async () => {
      const now = Date.now();
      if (isChecking || capturing || now - lastCaptureTime < 2800) return;
      const video = videoRef.current;
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

      isChecking = true;
      try {
        const testCanvas = document.createElement('canvas');
        testCanvas.width = 160;
        testCanvas.height = Math.round(160 * (video.videoHeight / video.videoWidth));
        const ctx = testCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, testCanvas.width, testCanvas.height);
          const currentSharpness = calculateLaplacianSharpness(testCanvas);

          // Focus check with steady quad confirmation
          const isSharp = currentSharpness > 42 && Math.abs(currentSharpness - lastSharpness) < 25;
          if (isSharp && (isQuadSteady || liveNormalizedQuadRef.current !== null)) {
            steadyCount++;
            if (steadyCount >= 2) {
              steadyCount = 0;
              lastCaptureTime = Date.now();
              setCaptureToast('🎯 ثبات تام — التقاط تلقائي');
              await handleCapture();
            }
          } else {
            steadyCount = 0;
          }
          lastSharpness = currentSharpness;
        }
      } catch (e) {
        console.warn('Auto-capture check error:', e);
      } finally {
        isChecking = false;
      }
    }, 400);

    return () => clearInterval(intervalId);
  }, [autoCaptureEnabled, hasPermission, capturing, isQuadSteady, handleCapture]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Support importing multiple photos from gallery at once
    const isMulti = files.length > 1 || scanMode === 'batch';
    Array.from(files).forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          onCapture(reader.result, isMulti);
          if (index === files.length - 1) {
            setCaptureToast(`✓ تم استيراد ${files.length} صورة من المعرض`);
            setTimeout(() => setCaptureToast(''), 2200);
          }
        }
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const toggleTorch = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    try {
      const capabilities = track.getCapabilities?.() as { torch?: boolean } | undefined;
      if (capabilities && 'torch' in capabilities && capabilities.torch) {
        await track.applyConstraints({
          advanced: [{ torch: !torchOn } as MediaTrackConstraintSet],
        });
        setTorchOn(!torchOn);
        triggerHaptic(15);
      } else {
        setCaptureToast('الفلاش غير مدعوم في هذه الكاميرا');
        setTimeout(() => setCaptureToast(''), 2200);
      }
    } catch (e) {
      console.warn('Torch unsupported:', e);
      setCaptureToast('تعذر تشغيل الفلاش');
      setTimeout(() => setCaptureToast(''), 2200);
    }
  };

  return (
    <div className="relative w-full h-full bg-[#07090e] flex flex-col justify-between overflow-hidden select-none font-sans">
      {/* Visual Shutter Flash */}
      {flashAnimation && <div className="absolute inset-0 z-50 bg-white pointer-events-none animate-out fade-out duration-150" />}

      {/* Floating Status Toast */}
      {captureToast && (
        <div className="absolute top-20 inset-x-0 flex justify-center z-40 pointer-events-none animate-in fade-in slide-in-from-top-3 duration-200">
          <span className="px-5 py-2.5 rounded-full bg-emerald-500 text-black font-black text-xs shadow-2xl border border-white/20 flex items-center gap-2">
            <FileCheck2 className="w-4 h-4" />
            <span>{captureToast}</span>
          </span>
        </div>
      )}

      {/* Floating ID Card Status Toast */}
      {idStatusToast && (
        <div className="absolute top-20 inset-x-0 flex justify-center z-40 pointer-events-none animate-in fade-in duration-200">
          <span className="px-4 py-2.5 rounded-2xl bg-emerald-500 text-black font-bold text-xs shadow-2xl flex items-center gap-2 border border-white/20">
            <CreditCard className="w-4 h-4" />
            <span>{idStatusToast}</span>
          </span>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="relative z-20 flex items-center justify-between px-4 pt-12 pb-3.5 otium-chrome border-b border-white/[0.08] select-none">
        {/* Left: Vault & Settings/Updates */}
        <div className="flex items-center gap-2">
          {/* Brand Logo & Vault Shortcut */}
          <button
            onClick={() => {
              triggerHaptic(15);
              onOpenLibrary?.();
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full glass-button hover:border-emerald-500/40 active:scale-95 transition-all shadow-sm"
            title="خزنة المستندات المحفوظة"
          >
            <OtiumLogo size={18} className="text-emerald-400" />
            <span className="text-xs font-bold text-gray-200">الخزنة</span>
          </button>

          {/* Prominent Settings & Updates Button */}
          <button
            onClick={() => {
              triggerHaptic(15);
              onOpenSettings?.();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] active:scale-95 transition-all text-xs"
            title="الإعدادات والتحديثات"
          >
            <Settings className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-bold text-gray-200">الإعدادات</span>
          </button>
        </div>

        {/* Right: Quick Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              triggerHaptic(15);
              setIsMuted(!isMuted);
            }}
            className={`p-2 rounded-full glass-button transition-colors ${
              isMuted ? 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10' : 'text-gray-300'
            }`}
            title={isMuted ? 'الصوت مكتوم' : 'صوت الالتقاط مفعل'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            onClick={() => {
              triggerHaptic(15);
              const nextMode = facingMode === 'environment' ? 'user' : 'environment';
              setFacingMode(nextMode);
              setTorchOn(false);
              initCamera(nextMode);
            }}
            className="p-2 rounded-full glass-button text-gray-300 hover:text-white active:scale-90"
            title="تبديل الكاميرا (أمامية / خلفية)"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              triggerHaptic(15);
              setAutoCaptureEnabled(!autoCaptureEnabled);
            }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              autoCaptureEnabled
                ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/30'
                : 'glass-button text-gray-300'
            }`}
            title="التقاط تلقائي عند ثبات الهاتف"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>تلقائي</span>
          </button>

          <button
            onClick={toggleTorch}
            className={`p-2 rounded-full glass-button transition-colors ${
              torchOn ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' : 'text-gray-300'
            }`}
            title="فلاش الكاميرا"
          >
            {torchOn ? <Zap className="w-4 h-4 fill-emerald-400" /> : <ZapOff className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Viewfinder Screen */}
      <div
        ref={viewfinderRef}
        onClick={handleViewfinderTap}
        className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden cursor-crosshair"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          disablePictureInPicture
          onLoadedMetadata={() => {
            videoRef.current?.play().catch(console.warn);
            updateRenderedBounds();
          }}
          className={`absolute inset-0 w-full h-full pointer-events-none transition-all duration-200 ${
            viewfinderFit === 'contain' ? 'object-contain' : 'object-cover'
          }`}
        />

        {/* Unified Top Viewfinder HUD */}
        <div className="absolute top-3 inset-x-0 z-20 flex items-center justify-between px-3 gap-1.5 pointer-events-none">
          {/* Left: 2D Gyroscope Spirit Level Bubble */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/10 shadow-lg pointer-events-auto shrink-0">
            <div className="relative w-3.5 h-3.5 rounded-full border border-white/30 flex items-center justify-center">
              <div
                style={{
                  transform: `translate(${tiltAngle.x * 3}px, ${tiltAngle.y * 3}px)`,
                }}
                className={`w-1.5 h-1.5 rounded-full transition-transform duration-75 ${
                  tiltAngle.isLevel ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-yellow-400'
                }`}
              />
            </div>
            <span className={`text-[10px] font-bold font-arabic ${tiltAngle.isLevel ? 'text-emerald-400' : 'text-gray-400'}`}>
              {tiltAngle.isLevel ? 'مستوى مثالي' : 'اضبط الزاوية'}
            </span>
          </div>

          {/* Center: Viewfinder Aspect Fit Switcher */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleViewfinderFit();
            }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full backdrop-blur-md shadow-lg transition-all active:scale-95 font-arabic select-none pointer-events-auto shrink-0 ${
              viewfinderFit === 'contain'
                ? 'bg-black/80 text-emerald-300 border border-emerald-500/50'
                : 'bg-black/80 text-gray-300 border border-white/10'
            }`}
            title={
              viewfinderFit === 'contain'
                ? 'وضع كامل الحساس مفعل (WYSIWYG) — انقر للتوسيع لملء الشاشة'
                : 'وضع ملء الشاشة مفعل — انقر للتبديل لعرض كامل الحساس 100%'
            }
          >
            <ScanLine className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] font-bold whitespace-nowrap">
              {viewfinderFit === 'contain' ? 'الحساس 100%' : 'ملء الشاشة'}
            </span>
          </button>

          {/* Right: Crop Mode Switcher */}
          {scanMode !== 'idcard' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleCropMode();
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full backdrop-blur-md shadow-lg transition-all active:scale-95 font-arabic select-none pointer-events-auto shrink-0 ${
                cropMode === 'full'
                  ? 'bg-black/80 text-emerald-300 border border-emerald-500/50'
                  : 'bg-black/80 text-amber-300 border border-amber-500/50'
              }`}
              title={
                cropMode === 'full'
                  ? 'وضع كامل الإطار مفعل — انقر للتبديل للتحديد الذكي'
                  : 'وضع التحديد الذكي مفعل — انقر للتبديل إلى كامل الإطار'
              }
            >
              {cropMode === 'full' ? (
                <>
                  <Maximize2 className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] font-bold whitespace-nowrap">كامل الإطار</span>
                </>
              ) : (
                <>
                  <Crop className="w-3 h-3 text-amber-400" />
                  <span className="text-[10px] font-bold whitespace-nowrap">تحديد ذكي</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Tap-to-Focus Animated Reticle */}
        {focusPoint && (
          <div
            style={{ left: `${focusPoint.x}px`, top: `${focusPoint.y}px` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30"
          >
            <div className="w-14 h-14 rounded-full border-2 border-emerald-400 bg-emerald-500/15 animate-ping" />
            <div className="absolute inset-0 w-14 h-14 rounded-full border border-emerald-300 shadow-lg" />
          </div>
        )}

        {/* Real-Time Live Document Boundary Overlay */}
        {liveScreenQuad && scanMode !== 'idcard' && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 transition-opacity duration-200">
            {/* Translucent Glowing Polygon */}
            <polygon
              points={`${liveScreenQuad.topLeft.x},${liveScreenQuad.topLeft.y} ${liveScreenQuad.topRight.x},${liveScreenQuad.topRight.y} ${liveScreenQuad.bottomRight.x},${liveScreenQuad.bottomRight.y} ${liveScreenQuad.bottomLeft.x},${liveScreenQuad.bottomLeft.y}`}
              fill={isQuadSteady ? 'rgba(16, 185, 129, 0.20)' : 'rgba(16, 185, 129, 0.10)'}
              stroke={isQuadSteady ? '#34D399' : '#10B981'}
              strokeWidth={isQuadSteady ? '2.5' : '1.8'}
              strokeDasharray={isQuadSteady ? 'none' : '6 4'}
              className="transition-all duration-150"
            />

            {/* Dynamic Reticle Brackets at 4 Corners */}
            {[
              { p: liveScreenQuad.topLeft, dx: 1, dy: 1 },
              { p: liveScreenQuad.topRight, dx: -1, dy: 1 },
              { p: liveScreenQuad.bottomRight, dx: -1, dy: -1 },
              { p: liveScreenQuad.bottomLeft, dx: 1, dy: -1 },
            ].map(({ p, dx, dy }, idx) => (
              <path
                key={idx}
                d={`M ${p.x + dx * 18} ${p.y} L ${p.x} ${p.y} L ${p.x} ${p.y + dy * 18}`}
                fill="none"
                stroke={isQuadSteady ? '#34D399' : '#10B981'}
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            ))}
          </svg>
        )}

        {/* Fallback state when permission is pending or denied */}
        {hasPermission === false && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#07090e]/95 p-6 text-center z-30">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Camera className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-base font-bold text-white font-arabic">إذن الكاميرا مطلوب</h3>
            <p className="text-xs text-gray-400 max-w-xs leading-relaxed font-arabic">
              يرجى منح صلاحية الكاميرا لمسح المستندات وتجميعها في ملف PDF، أو اختر صوراً من الاستوديو.
            </p>
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={() => {
                  triggerHaptic(20);
                  initCamera();
                }}
                className="px-5 py-2.5 bg-emerald-500 text-black font-bold text-xs rounded-xl active:scale-95 transition-transform"
              >
                تفعيل الكاميرا
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 glass-button text-gray-300 font-medium text-xs rounded-xl active:scale-95 transition-transform"
              >
                اختيار من المعرض
              </button>
            </div>
          </div>
        )}

        {/* Exact Sensor Framing Boundary — 100% WYSIWYG Camera Sensor Bounds */}
        {renderedBounds && (
          <div
            style={{
              left: `${renderedBounds.x}px`,
              top: `${renderedBounds.y}px`,
              width: `${renderedBounds.width}px`,
              height: `${renderedBounds.height}px`,
            }}
            className="pointer-events-none absolute border border-emerald-500/25 transition-all duration-150"
          >
            {/* 4 Sensor Frame Corner Marks */}
            <div className="absolute -top-1 -left-1 w-6 h-6 border-t-2 border-l-2 border-emerald-400" />
            <div className="absolute -top-1 -right-1 w-6 h-6 border-t-2 border-r-2 border-emerald-400" />
            <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-2 border-l-2 border-emerald-400" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-2 border-r-2 border-emerald-400" />
          </div>
        )}

        {/* Dynamic Status Pill */}
        <div className="absolute bottom-4 inset-x-0 text-center pointer-events-none z-20">
          <span className="text-xs bg-black/75 backdrop-blur-md px-4 py-2 rounded-full text-gray-200 border border-white/10 inline-flex items-center justify-center gap-2 font-arabic shadow-lg">
            {scanMode === 'idcard' ? (
              <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" />
                <span>{idCardStep === 'front' ? 'ضع الوجه الأمامي للهوية داخل الإطار' : 'ضع الوجه الخلفي للهوية'}</span>
              </span>
            ) : isQuadSteady ? (
              <span className="text-emerald-300 font-bold flex items-center gap-1.5 animate-pulse">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>تم تثبيت المستند بنجاح</span>
              </span>
            ) : pagesCount > 0 ? (
              <span className="text-emerald-300 font-semibold flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                <span>{pagesCount} صفحات مجمعة — التقط المزيد أو اضغط إنهاء</span>
              </span>
            ) : (
              <span className="text-gray-300">وجّه الكاميرا نحو المستند ثم اضغط زر الالتقاط</span>
            )}
          </span>
        </div>
      </div>

      {/* Mode Switcher Bar — Positioned above shutter dock like CamScanner */}
      <div className="relative z-20 flex justify-center py-2.5 px-4 bg-gradient-to-t from-[#07090e] via-[#07090e]/90 to-transparent">
        <div className="flex items-center p-1 rounded-full bg-white/[0.08] border border-white/[0.1] shadow-lg">
          <button
            onClick={() => {
              triggerHaptic(10);
              setScanMode('batch');
            }}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
              scanMode === 'batch'
                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/30'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            <ScanLine className="w-3.5 h-3.5" />
            <span>متعدد (دفعة)</span>
          </button>

          <button
            onClick={() => {
              triggerHaptic(10);
              setScanMode('single');
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
              scanMode === 'single'
                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/30'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            مفرد
          </button>

          <button
            onClick={() => {
              triggerHaptic(10);
              setScanMode('idcard');
              setIdCardStep('front');
              setIdFrontDataUrl(null);
            }}
            className={`flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
              scanMode === 'idcard'
                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/30'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>هوية</span>
          </button>
        </div>
      </div>

      {/* Bottom Shutter Dock — CamScanner Layout */}
      <div className="relative z-20 flex items-center justify-around px-8 pt-2 pb-10 otium-chrome border-t border-white/[0.08]">
        {/* Left: Gallery Import */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center gap-1 p-3 rounded-2xl glass-button text-gray-300 active:scale-90 transition-transform"
          title="استيراد من المعرض / Import from Gallery"
        >
          <ImageIcon className="w-6 h-6 text-gray-200" />
          <span className="text-[10px] text-gray-400 font-arabic">المعرض</span>
        </button>

        {/* Center: Tactile Shutter Button */}
        <button
          onClick={handleCapture}
          disabled={capturing}
          className="relative flex items-center justify-center w-20 h-20 rounded-full border-4 border-emerald-500/30 p-1 active:scale-95 transition-transform disabled:opacity-50"
          title="التقاط صورة"
        >
          <div className="w-full h-full rounded-full bg-emerald-500 emerald-glow flex items-center justify-center shadow-2xl">
            <div className={`w-8 h-8 rounded-full bg-white/25 ${capturing ? 'animate-ping' : ''}`} />
          </div>
        </button>

        {/* Right: CamScanner Multi-Page Review & Finish Button */}
        {pagesCount > 0 ? (
          <button
            onClick={() => {
              triggerHaptic(20);
              onFinishBatch();
            }}
            className="flex flex-col items-center gap-1 active:scale-90 transition-transform group"
            title="إنهاء ومراجعة ملف الـ PDF"
          >
            <div className="relative w-14 h-14 rounded-2xl border-2 border-emerald-400 bg-black overflow-hidden shadow-xl ring-2 ring-emerald-500/30">
              {lastThumbnail ? (
                <img src={lastThumbnail} alt="Page preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-emerald-950">
                  <FileText className="w-6 h-6 text-emerald-400" />
                </div>
              )}
              {/* Count badge */}
              <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 text-black text-xs font-black flex items-center justify-center ring-2 ring-black">
                {pagesCount}
              </div>
            </div>
            <span className="text-[11px] font-bold text-emerald-400 font-arabic flex items-center gap-1">
              <span>إنهاء ومراجعة</span>
              <ArrowLeft className="w-3 h-3" />
            </span>
          </button>
        ) : (
          <div className="w-14 h-14 flex items-center justify-center opacity-30">
            <FileText className="w-6 h-6 text-gray-500" />
          </div>
        )}
      </div>

      {/* Hidden Gallery File Input (supports multiple selections) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
};
