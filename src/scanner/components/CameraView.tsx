import { localStorage } from '../../platform/storage';
import React, { useRef, useState } from 'react';
import { CameraViewfinderHud } from './CameraViewfinderHud';
import { useCameraCapture } from './useCameraCapture';
import type { Language } from '../../core/i18n/translations';
import type { CropMode } from '../core/types';

interface CameraViewProps {
  onCapture: (images: Blob[], autoCrop: boolean) => Promise<number>;
  lang?: Language;
  busy?: boolean;
  inactive?: boolean;
  pagesCount: number;
  lastThumbnail?: string;
  onFinishBatch: () => void;
  onOpenLibrary?: () => void;
  onOpenSettings?: () => void;
  onClose?: () => void;
}

export const CameraView: React.FC<CameraViewProps> = ({
  onCapture,
  lang = 'ar',
  busy = false,
  inactive = false,
  pagesCount,
  lastThumbnail,
  onFinishBatch,
  onOpenLibrary,
  onOpenSettings,
  onClose,
}) => {
  const [torchOn, setTorchOn] = useState(false);
  const [scanMode, setScanMode] = useState<'document' | 'idcard'>('document');
  const [idCardStep, setIdCardStep] = useState<'front' | 'back'>('front');
  const [idFront, setIdFront] = useState<HTMLCanvasElement | null>(null);
  const [idStatusToast, setIdStatusToast] = useState<string>('');
  const [captureToast, setCaptureToast] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [autoCapture, setAutoCapture] = useState<boolean>(() => {
    try {
      return localStorage.getItem('otium_scan_auto_capture') === 'true';
    } catch {
      return false;
    }
  });
  const cropMode: CropMode = localStorage.getItem('otium_scan_crop_mode') === 'full' ? 'full' : 'auto';
  const [viewfinderFit] = useState<'contain' | 'cover'>(() => {
    try {
      return (localStorage.getItem('otium_scan_viewfinder_fit') as 'contain' | 'cover') || 'contain';
    } catch {
      return 'contain';
    }
  });

  const triggerHaptic = (duration = 25) => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(duration);
      } catch (err) {
        console.debug('[CameraView] Haptic vibrate skipped:', err);
      }
    }
  };

  const {
    videoRef,
    viewfinderRef,
    hasPermission,
    stream,
    capturing,
    flashAnimation,
    renderedBounds,
    visibleQuad,
    effectiveStabilityProgress,
    focusPoint,
    initCamera,
    updateRenderedBounds,
    handleViewfinderTap,
    handleCapture,
  } = useCameraCapture({
    cropMode,
    viewfinderFit,
    autoCapture,
    facingMode,
    scanMode,
    idCardStep,
    setIdCardStep,
    idFront,
    setIdFront,
    setIdStatusToast,
    setCaptureToast,
    setTorchOn,
    lang,
    paused: busy || inactive,
    inactive,
    triggerHaptic,
    fileInputRef,
    onCapture,
  });

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length || busy || capturing) return;
    const images = files.filter((file) => (
      (file.type.startsWith('image/') && file.type !== 'image/svg+xml' || !file.type && /\.(jpe?g|png|webp|heic|heif|avif)$/i.test(file.name))
      && file.size <= 50 * 1024 * 1024
    ));
    const saved = images.length ? await onCapture(images, cropMode === 'auto') : 0;
    if (saved !== files.length) {
      setCaptureToast(lang === 'ar' ? `حُفظت ${saved} من ${files.length} صور` : `Saved ${saved} of ${files.length} images`);
    }
  };

  const torchSupported = Boolean((stream?.getVideoTracks()[0]?.getCapabilities?.() as { torch?: boolean } | undefined)?.torch);

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
        setCaptureToast(lang === 'ar' ? 'الفلاش غير مدعوم' : 'Flash unavailable');
        setTimeout(() => setCaptureToast(''), 2200);
      }
    } catch (e) {
      console.warn('Torch unsupported:', e);
      setCaptureToast(lang === 'ar' ? 'تعذّر تشغيل الفلاش' : 'Could not turn on the flash');
      setTimeout(() => setCaptureToast(''), 2200);
    }
  };

  return (
    <CameraViewfinderHud
      lang={lang}
      flashAnimation={flashAnimation}
      captureToast={captureToast}
      idStatusToast={idStatusToast}
      hasClose={Boolean(onClose)}
      onCloseClick={() => {
        triggerHaptic(15);
        onClose?.();
      }}
      onOpenLibraryClick={() => {
        triggerHaptic(15);
        onOpenLibrary?.();
      }}
      autoCapture={autoCapture}
      onToggleAutoCapture={() => {
        const next = !autoCapture;
        setAutoCapture(next);
        try {
          localStorage.setItem('otium_scan_auto_capture', String(next));
        } catch (err) {
          console.warn('[CameraView] Failed to persist auto-capture setting:', err);
        }
        triggerHaptic(15);
      }}
      torchOn={torchOn}
      torchSupported={torchSupported}
      autoCaptureAvailable={cropMode === 'auto' && scanMode === 'document'}
      onToggleTorch={toggleTorch}
      onFlipCamera={() => {
        triggerHaptic(15);
        const nextMode = facingMode === 'environment' ? 'user' : 'environment';
        setFacingMode(nextMode);
        setTorchOn(false);
      }}
      onOpenSettingsClick={() => {
        triggerHaptic(15);
        onOpenSettings?.();
      }}
      viewfinderRef={viewfinderRef}
      onViewfinderTap={handleViewfinderTap}
      videoRef={videoRef}
      onVideoLoadedMetadata={() => {
        videoRef.current?.play().catch(console.warn);
        updateRenderedBounds();
      }}
      viewfinderFit={viewfinderFit}
      focusPoint={focusPoint}
      hasPermission={hasPermission}
      onRetryCamera={() => {
        triggerHaptic(20);
        initCamera();
      }}
      fileInputRef={fileInputRef}
      scanMode={scanMode}
      idCardStep={idCardStep}
      renderedBounds={renderedBounds}
      visibleQuad={visibleQuad}
      effectiveStabilityProgress={effectiveStabilityProgress}
      pagesCount={pagesCount}
      onSelectScanMode={(mode) => {
        triggerHaptic(10);
        setScanMode(mode);
        setIdCardStep('front');
        setIdFront(null);
        setIdStatusToast('');
      }}
      capturing={capturing || busy}
      onCaptureClick={handleCapture}
      onFinishBatchClick={() => {
        triggerHaptic(20);
        onFinishBatch();
      }}
      lastThumbnail={lastThumbnail}
      onFileChange={handleFileChange}
    />
  );
};
