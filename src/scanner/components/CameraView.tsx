import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  Image as ImageIcon,
  Zap,
  ZapOff,
  ScanLine,
  CreditCard,
  FileCheck2,
  FileText,
  RefreshCw,
  Settings,
  ArrowLeft,
  X,
} from 'lucide-react';
import { OtiumLogo } from './OtiumLogo';
import { playShutterSound } from '../core/audio';
import { mergeIdCardSidesToA4 } from '../core/idCard';
import { detectDocumentCorners, getFullFrameQuad } from '../core/edgeDetection';
import type { Quad, CropMode } from '../core/types';

interface CameraViewProps {
  onCapture: (imageDataUrl: string, isBatchMode: boolean, detectedQuad?: Quad) => void;
  pagesCount: number;
  lastThumbnail?: string;
  onFinishBatch: () => void;
  onOpenLibrary?: () => void;
  onOpenSettings?: () => void;
  onClose?: () => void;
}

export const CameraView: React.FC<CameraViewProps> = ({
  onCapture,
  pagesCount,
  lastThumbnail,
  onFinishBatch,
  onOpenLibrary,
  onOpenSettings,
  onClose,
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
  const [cropMode] = useState<CropMode>(() => {
    try {
      return (localStorage.getItem('otium_scan_crop_mode') as CropMode) || 'full';
    } catch {
      return 'full';
    }
  });
  const [viewfinderFit] = useState<'contain' | 'cover'>(() => {
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

  // Sensor & Device States
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const isMuted = false;
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);

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
        if (sourceCanvas) {
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

  // 120 FPS Native Hardware-Accelerated Viewport Bounds Synchronization
  useEffect(() => {
    const handleResize = () => {
      updateRenderedBounds();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateRenderedBounds]);

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
          <span className="px-5 py-2.5 rounded-full bg-accent text-on-accent font-black text-xs shadow-2xl border border-white/20 flex items-center gap-2">
            <FileCheck2 className="w-4 h-4" />
            <span>{captureToast}</span>
          </span>
        </div>
      )}

      {/* Floating ID Card Status Toast */}
      {idStatusToast && (
        <div className="absolute top-20 inset-x-0 flex justify-center z-40 pointer-events-none animate-in fade-in duration-200">
          <span className="px-4 py-2.5 rounded-2xl bg-accent text-on-accent font-bold text-xs shadow-2xl flex items-center gap-2 border border-white/20">
            <CreditCard className="w-4 h-4" />
            <span>{idStatusToast}</span>
          </span>
        </div>
      )}

      {/* Minimalist Safe-Area Header (Apple / Nothing OS Aesthetic) */}
      <div
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px) + 10px, 48px)',
          paddingLeft: 'max(env(safe-area-inset-left, 0px) + 16px, 16px)',
          paddingRight: 'max(env(safe-area-inset-right, 0px) + 16px, 16px)',
        }}
        className="relative z-30 flex items-center justify-between pb-3 bg-gradient-to-b from-black/90 via-black/40 to-transparent select-none"
      >
        {/* Right side (RTL): Close & Vault */}
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={() => {
                triggerHaptic(15);
                onClose();
              }}
              className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 border border-white/15 flex items-center justify-center text-white active:scale-90 transition-transform shadow-lg cursor-pointer"
              title="إغلاق الماسح الضوئي"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          {/* Vault Archive Shortcut */}
          <button
            onClick={() => {
              triggerHaptic(15);
              onOpenLibrary?.();
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-black/60 hover:bg-black/90 border border-white/15 text-xs font-bold text-gray-200 active:scale-95 transition-transform shadow-lg cursor-pointer"
            title="خزنة المستندات المحفوظة"
          >
            <OtiumLogo size={16} className="text-accent shrink-0" />
            <span className="text-xs">الخزنة</span>
          </button>
        </div>

        {/* Center: Live Minimalist Status */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 border border-white/10 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="text-xs font-mono tracking-wider text-gray-200">
            {scanMode === 'idcard' ? 'بطاقة هوية' : scanMode === 'batch' ? 'دفعة متعددة' : 'صفحة مفردة'}
          </span>
        </div>

        {/* Left side: Quick Controls (Flash, Flip, Settings) */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleTorch}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              torchOn
                ? 'bg-accent/20 text-accent border border-accent/50 shadow-lg shadow-accent/20'
                : 'bg-black/60 hover:bg-black/90 text-gray-300 border border-white/15'
            } active:scale-90`}
            title="فلاش الكاميرا"
          >
            {torchOn ? <Zap className="w-4 h-4 fill-accent text-accent" /> : <ZapOff className="w-4 h-4" />}
          </button>

          <button
            onClick={() => {
              triggerHaptic(15);
              const nextMode = facingMode === 'environment' ? 'user' : 'environment';
              setFacingMode(nextMode);
              setTorchOn(false);
              initCamera(nextMode);
            }}
            className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 border border-white/15 flex items-center justify-center text-gray-300 hover:text-white active:scale-90 transition-transform cursor-pointer"
            title="تبديل الكاميرا (أمامية / خلفية)"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              triggerHaptic(15);
              onOpenSettings?.();
            }}
            className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 border border-white/15 flex items-center justify-center text-gray-300 hover:text-white active:scale-90 transition-transform cursor-pointer"
            title="الإعدادات والتحديثات"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Viewfinder Screen — 120 FPS Clean Video Stream */}
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

        {/* Tap-to-Focus Animated Reticle */}
        {focusPoint && (
          <div
            style={{ left: `${focusPoint.x}px`, top: `${focusPoint.y}px` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30"
          >
            <div className="w-14 h-14 rounded-full border-2 border-accent bg-accent/15 animate-ping" />
            <div className="absolute inset-0 w-14 h-14 rounded-full border border-accent shadow-lg" />
          </div>
        )}

        {/* Camera Loading State (eliminates black screen freeze on first tap) */}
        {hasPermission === null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#07090e]/95 backdrop-blur-md p-6 text-center z-30 pointer-events-none animate-in fade-in duration-200">
            <div className="relative w-16 h-16 rounded-full bg-accent/15 border border-accent/40 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border border-accent animate-ping opacity-40" />
              <Camera className="w-8 h-8 text-accent animate-pulse" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-white font-arabic">جاري تشغيل الكاميرا...</p>
              <p className="text-[11px] text-gray-400 font-arabic">تهيئة المستشعر وعدسة المسح</p>
            </div>
          </div>
        )}

        {/* Fallback state when permission is pending or denied */}
        {hasPermission === false && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#07090e]/95 p-6 text-center z-30">
            <div className="w-16 h-16 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center">
              <Camera className="w-8 h-8 text-accent" />
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
                className="px-5 py-2.5 bg-accent text-on-accent font-bold text-xs rounded-xl active:scale-95 transition-transform cursor-pointer"
              >
                تفعيل الكاميرا
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 glass-button text-gray-300 font-medium text-xs rounded-xl active:scale-95 transition-transform cursor-pointer"
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
            className="pointer-events-none absolute border border-accent/25 transition-all duration-150"
          >
            {/* 4 Sensor Frame Corner Marks with Theme Accent */}
            <div className="absolute -top-1 -left-1 w-6 h-6 border-t-2 border-l-2 border-accent" />
            <div className="absolute -top-1 -right-1 w-6 h-6 border-t-2 border-r-2 border-accent" />
            <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-2 border-l-2 border-accent" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-2 border-r-2 border-accent" />
          </div>
        )}

        {/* Dynamic Status Pill */}
        <div className="absolute bottom-4 inset-x-0 text-center pointer-events-none z-20">
          <span className="text-xs bg-black/75 backdrop-blur-md px-4 py-2 rounded-full text-gray-200 border border-white/10 inline-flex items-center justify-center gap-2 font-arabic shadow-lg">
            {scanMode === 'idcard' ? (
              <span className="text-accent font-bold flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" />
                <span>{idCardStep === 'front' ? 'ضع الوجه الأمامي للهوية داخل الإطار' : 'ضع الوجه الخلفي للهوية'}</span>
              </span>
            ) : pagesCount > 0 ? (
              <span className="text-accent font-semibold flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-accent" />
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
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              scanMode === 'batch'
                ? 'bg-accent text-on-accent shadow-lg shadow-accent/30'
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
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              scanMode === 'single'
                ? 'bg-accent text-on-accent shadow-lg shadow-accent/30'
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
            className={`flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              scanMode === 'idcard'
                ? 'bg-accent text-on-accent shadow-lg shadow-accent/30'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>هوية</span>
          </button>
        </div>
      </div>

      {/* Bottom Shutter Dock — Apple / Nothing OS Aesthetic with Safe-Area Padding */}
      <div
        style={{
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 32px)',
        }}
        className="relative z-20 flex items-center justify-around px-8 pt-3 bg-gradient-to-t from-black via-black/80 to-transparent border-t border-white/[0.06]"
      >
        {/* Gallery Import */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-300 active:scale-90 transition-all cursor-pointer"
          title="استيراد من المعرض"
        >
          <ImageIcon className="w-5 h-5 text-gray-200" />
          <span className="text-[10px] text-gray-400 font-bold font-arabic">المعرض</span>
        </button>

        {/* Center: Tactile Shutter Button (Apple / Nothing Concentric Rings) */}
        <button
          onClick={handleCapture}
          disabled={capturing}
          className="relative flex items-center justify-center w-20 h-20 rounded-full border-2 border-white/30 p-1.5 active:scale-90 transition-all disabled:opacity-50 cursor-pointer shadow-2xl"
          title="التقاط صورة"
        >
          <div className="w-full h-full rounded-full bg-accent hover:opacity-95 flex items-center justify-center shadow-lg transition-colors">
            <div className={`w-7 h-7 rounded-full bg-black/30 ${capturing ? 'animate-ping' : ''}`} />
          </div>
        </button>

        {/* Right: CamScanner Multi-Page Review & Finish Button */}
        {pagesCount > 0 ? (
          <button
            onClick={() => {
              triggerHaptic(20);
              onFinishBatch();
            }}
            className="flex flex-col items-center gap-1 active:scale-90 transition-transform group cursor-pointer"
            title="إنهاء ومراجعة ملف الـ PDF"
          >
            <div className="relative w-14 h-14 rounded-2xl border-2 border-accent bg-black overflow-hidden shadow-xl ring-2 ring-accent/30">
              {lastThumbnail ? (
                <img src={lastThumbnail} alt="Page preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-black/40">
                  <FileText className="w-6 h-6 text-accent" />
                </div>
              )}
              {/* Count badge */}
              <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-accent text-on-accent text-xs font-black flex items-center justify-center ring-2 ring-black">
                {pagesCount}
              </div>
            </div>
            <span className="text-[11px] font-bold text-accent font-arabic flex items-center gap-1">
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
