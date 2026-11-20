import React from 'react';
import './camera.css';
import {
  Camera,
  Zap,
  ZapOff,
  CreditCard,
  FileCheck2,
  RefreshCw,
  X,
  MoreHorizontal,
} from 'lucide-react';
import type { Language } from '../../core/i18n/translations';
import type { ScanHint } from './useCameraCapture';
import type { Quad } from '../core/types';
import { CameraShutterControls } from './CameraShutterControls';

export interface CameraViewfinderHudProps {
  lang: Language;
  flashAnimation: boolean;
  captureToast: string;
  idStatusToast: string;
  hasClose: boolean;
  onCloseClick: () => void;
  onOpenLibraryClick: () => void;
  autoCapture: boolean;
  onToggleAutoCapture: () => void;
  torchOn: boolean;
  torchSupported: boolean;
  autoCaptureAvailable: boolean;
  onToggleTorch: () => void;
  onFlipCamera: () => void;
  onOpenSettingsClick: () => void;
  viewfinderRef: React.RefObject<HTMLDivElement | null>;
  onViewfinderTap: (e: React.MouseEvent<HTMLDivElement>) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onVideoLoadedMetadata: () => void;
  viewfinderFit: 'contain' | 'cover';
  focusPoint: { x: number; y: number } | null;
  hasPermission: boolean | null;
  scanHint: ScanHint;
  cameraIssue: 'permission' | 'missing' | 'busy' | 'unavailable';
  onRetryCamera: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  scanMode: 'document' | 'idcard';
  idCardStep: 'front' | 'back';
  renderedBounds: { x: number; y: number; width: number; height: number } | null;
  visibleQuad: Quad | null;
  effectiveStabilityProgress: number;
  pagesCount: number;
  onSelectScanMode: (mode: 'document' | 'idcard') => void;
  capturing: boolean;
  onCaptureClick: () => void;
  onFinishBatchClick: () => void;
  lastThumbnail?: string;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const CameraViewfinderHud: React.FC<CameraViewfinderHudProps> = ({
  lang,
  flashAnimation,
  captureToast,
  idStatusToast,
  hasClose,
  onCloseClick,
  onOpenLibraryClick,
  autoCapture,
  onToggleAutoCapture,
  torchOn,
  torchSupported,
  autoCaptureAvailable,
  onToggleTorch,
  onFlipCamera,
  onOpenSettingsClick,
  viewfinderRef,
  onViewfinderTap,
  videoRef,
  onVideoLoadedMetadata,
  viewfinderFit,
  focusPoint,
  hasPermission,
  cameraIssue,
  scanHint,
  onRetryCamera,
  fileInputRef,
  scanMode,
  idCardStep,
  renderedBounds,
  visibleQuad,
  effectiveStabilityProgress,
  pagesCount,
  onSelectScanMode,
  capturing,
  onCaptureClick,
  onFinishBatchClick,
  lastThumbnail,
  onFileChange,
}) => {
  const [showMore, setShowMore] = React.useState(false);
  const ar = lang === 'ar';
  const scanHints = {
    frame: ar ? 'أظهر زوايا الصفحة الأربع' : 'Show all four page corners',
    ready: ar ? 'اضغط لالتقاط الصفحة' : 'Press the shutter to capture',
    steady: ar ? 'ثبّت الصفحة للالتقاط التلقائي' : 'Hold steady for auto capture',
    next: ar ? 'ضع الصفحة التالية في الإطار' : 'Place the next page in the frame',
  };
  const cameraHelp = {
    permission: ar ? 'اسمح باستخدام الكاميرا في إعدادات الأذونات، ثم أعد المحاولة.' : 'Allow camera access in permissions, then try again.',
    missing: ar ? 'صِل كاميرا بالجهاز أو اختر صوراً من المعرض.' : 'Connect a camera or choose images from your gallery.',
    busy: ar ? 'أغلق أي تطبيق يستخدم الكاميرا، ثم أعد المحاولة.' : 'Close any app using the camera, then try again.',
    unavailable: ar ? 'يمكنك استيراد صور الصفحات من المعرض.' : 'You can import page images from your gallery.',
  };
  const control = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 px-3 text-xs text-white disabled:opacity-50';
  return (
  <div className="scan-camera relative w-full h-full bg-[#07090e] flex flex-col justify-between overflow-hidden select-none font-sans">
    {/* Visual Shutter Flash */}
    {flashAnimation && <div className="absolute inset-0 z-50 bg-white pointer-events-none animate-out fade-out duration-150" />}

    {/* Floating Status Toast */}
    {captureToast && (
      <div className="absolute top-20 inset-x-0 flex justify-center z-40 pointer-events-none animate-in fade-in slide-in-from-top-3 duration-200">
        <span role="status" className="px-5 py-2.5 rounded-full bg-accent text-on-accent font-black text-xs shadow-2xl border border-white/20 flex items-center gap-2">
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

    <div
      style={{ paddingTop: 'max(env(safe-area-inset-top, 0px) + 10px, 24px)' }}
      className="scan-topbar relative z-30 flex items-center justify-between gap-2 px-4 pb-3"
    >
      {hasClose && (
        <button type="button" className={control} onClick={onCloseClick} disabled={capturing}
          aria-label={ar ? 'إغلاق الماسح الضوئي' : 'Close scanner'}>
          <X size={18} />
        </button>
      )}
      <span className="grow text-center text-sm font-semibold" aria-live="polite">
        {capturing ? (ar ? 'جارٍ تجهيز الصفحات…' : 'Processing pages…') : (ar ? `${pagesCount} صفحة` : `${pagesCount} pages`)}
      </span>
      {autoCaptureAvailable && (
        <button type="button" className={control} aria-pressed={autoCapture} disabled={capturing}
          title={ar ? 'تبديل الالتقاط التلقائي عند ثبات المستند' : 'Toggle automatic capture'} onClick={onToggleAutoCapture}>
          {autoCapture ? (ar ? 'تلقائي' : 'Auto') : (ar ? 'يدوي' : 'Manual')}
        </button>
      )}
      {torchSupported && (
        <button type="button" onClick={onToggleTorch} className={control} aria-pressed={torchOn}
          aria-label={ar ? 'فلاش الكاميرا' : 'Flash'}>
          {torchOn ? <Zap size={18} /> : <ZapOff size={18} />}
        </button>
      )}
      <button type="button" className={control} aria-expanded={showMore} disabled={capturing}
        aria-label={ar ? 'المزيد' : 'More'} onClick={() => setShowMore(!showMore)}>
        <MoreHorizontal size={18} />
      </button>
      {showMore && !capturing && (
        <div className="absolute end-4 top-full grid gap-1 rounded-xl border border-white/15 bg-[#131820] p-2 shadow-xl">
          <button type="button" className={control} onClick={() => { onFlipCamera(); setShowMore(false); }}>
            <RefreshCw size={14} className="me-2" />{ar ? 'تبديل الكاميرا' : 'Switch camera'}
          </button>
          <button type="button" className={control} onClick={() => { onOpenLibraryClick(); setShowMore(false); }}>
            {ar ? 'المستندات المحفوظة' : 'Saved documents'}
          </button>
          <button type="button" className={control} onClick={() => { onOpenSettingsClick(); setShowMore(false); }}>
            {ar ? 'إعدادات المسح' : 'Scan settings'}
          </button>
        </div>
      )}
    </div>

    {/* Main Viewfinder Screen */}
    <div
      ref={viewfinderRef}
      onClick={onViewfinderTap}
      className="scan-viewfinder isolate relative flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden cursor-crosshair"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        disablePictureInPicture
        onLoadedMetadata={onVideoLoadedMetadata}
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
          <div className="w-14 h-14 rounded-full border-2 border-accent bg-accent/15 motion-safe:animate-ping" />
          <div className="absolute inset-0 w-14 h-14 rounded-full border border-accent shadow-lg" />
        </div>
      )}

      {/* Camera Loading State */}
      {hasPermission === null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#07090e]/95 backdrop-blur-md p-6 text-center z-30 pointer-events-none animate-in fade-in duration-200">
          <div className="relative w-16 h-16 rounded-full bg-accent/15 border border-accent/40 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-accent animate-ping opacity-40" />
            <Camera className="w-8 h-8 text-accent motion-safe:animate-pulse" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-white font-arabic">{ar ? 'جارٍ تشغيل الكاميرا…' : 'Starting camera…'}</p>
          </div>
        </div>
      )}

      {/* Fallback state when permission is pending or denied */}
      {hasPermission === false && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#07090e]/95 p-6 text-center z-30">
          <div className="w-16 h-16 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center">
            <Camera className="w-8 h-8 text-accent" />
          </div>
          <h3 className="text-base font-bold text-white font-arabic">{ar ? 'الكاميرا غير متاحة' : 'Camera unavailable'}</h3>
          <p className="text-xs text-gray-400 max-w-xs leading-relaxed font-arabic">
            {cameraHelp[cameraIssue]}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={onRetryCamera}
              disabled={capturing}
              className="px-5 py-2.5 bg-accent text-on-accent font-bold text-xs rounded-xl active:scale-95 transition-transform cursor-pointer"
            >
              {ar ? 'تفعيل الكاميرا' : 'Enable camera'}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={capturing}
              className="px-4 py-2.5 glass-button text-gray-300 font-medium text-xs rounded-xl active:scale-95 transition-transform cursor-pointer"
            >
              {ar ? 'اختيار من المعرض' : 'Choose from gallery'}
            </button>
          </div>
        </div>
      )}

      {/* Dedicated ID Card Aspect Ratio Framing Guide */}
      {scanMode === 'idcard' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="relative w-[84%] max-w-[340px] aspect-[1.58/1] rounded-3xl border-2 border-dashed border-accent/70 bg-accent/[0.04] flex flex-col items-center justify-center gap-2 shadow-2xl backdrop-blur-[1px]">
            <CreditCard className="w-8 h-8 text-accent animate-pulse" />
            <span className="text-xs font-bold font-arabic text-accent bg-black/75 px-3 py-1 rounded-full border border-accent/30 shadow-md">
              {idCardStep === 'front' ? (ar ? 'الوجه الأمامي للبطاقة' : 'Front of ID') : (ar ? 'الوجه الخلفي للبطاقة' : 'Back of ID')}
            </span>
            <div className="absolute -top-1 -left-1 w-6 h-6 border-t-2 border-l-2 border-accent rounded-tl-lg" />
            <div className="absolute -top-1 -right-1 w-6 h-6 border-t-2 border-r-2 border-accent rounded-tr-lg" />
            <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-2 border-l-2 border-accent rounded-bl-lg" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-2 border-r-2 border-accent rounded-br-lg" />
          </div>
        </div>
      )}

      {renderedBounds && visibleQuad && scanMode === 'document' && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{ left: renderedBounds.x, top: renderedBounds.y, width: renderedBounds.width, height: renderedBounds.height }}
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
        >
          <polygon
            points={[visibleQuad.topLeft, visibleQuad.topRight, visibleQuad.bottomRight, visibleQuad.bottomLeft]
              .map(({ x, y }) => `${x * 1000},${y * 1000}`).join(' ')}
            fill="#34d39922" stroke="#34d399" strokeWidth="2" vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      {hasPermission && autoCaptureAvailable && !capturing && !captureToast && (
        <p role="status" className="pointer-events-none absolute bottom-4 rounded-full bg-black/75 px-3 py-1 text-sm">
          {scanHints[scanHint]}
        </p>
      )}
    </div>

    <div role="group" aria-label={ar ? 'نوع المسح' : 'Scan mode'} className="scan-modes flex shrink-0 justify-center gap-1 bg-black py-1">
      {(['document', 'idcard'] as const).map(mode => (
        <button key={mode} type="button" aria-pressed={scanMode === mode} disabled={capturing}
          className={`min-h-11 px-5 rounded-full text-sm ${scanMode === mode ? 'bg-white/15 text-white font-semibold' : 'text-gray-400'}`}
          onClick={() => { if (mode !== scanMode) onSelectScanMode(mode); setShowMore(false); }}>
          {mode === 'document' ? (ar ? 'مستند' : 'Document') : (ar ? 'تصوير هوية' : 'ID card')}
        </button>
      ))}
    </div>
    <CameraShutterControls
      fileInputRef={fileInputRef}
      lang={lang}
      cameraReady={hasPermission === true}
      autoCapture={autoCapture}
      effectiveStabilityProgress={effectiveStabilityProgress}
      pagesCount={pagesCount}
      capturing={capturing}
      onCaptureClick={onCaptureClick}
      onFinishBatchClick={onFinishBatchClick}
      lastThumbnail={lastThumbnail}
      onFileChange={onFileChange}
    />
  </div>
);
};
