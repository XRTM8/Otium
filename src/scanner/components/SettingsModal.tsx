import React, { useState } from 'react';
import {
  X,
  RefreshCw,
  Download,
  ExternalLink,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Shield,
  Lock,
  Unlock,
  Volume2,
  VolumeX,
  Camera,
  HardDrive,
  Smartphone,
  Crop,
  Maximize2,
  FileText,
} from 'lucide-react';
import { OtiumLogo } from './OtiumLogo';
import type { CropMode } from '../core/types';
import { isOcrLanguageCached, preloadOcrLanguage } from '../core/ocr/ocrEngine';
import {
  checkForAppUpdates,
  APP_CURRENT_VERSION,
  detectDeviceArchitecture,
} from '../core/updater';
import type { UpdateCheckResult } from '../core/updater';
import { nativeOpenUrl, nativeInstallApk } from '../core/nativeBridge';
import { hasVaultPin, clearVaultPin, setVaultPin } from '../core/security';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
  autoCaptureEnabled?: boolean;
  onToggleAutoCapture?: () => void;
  onOpenVault?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  isMuted = false,
  onToggleMute,
  autoCaptureEnabled = true,
  onToggleAutoCapture,
  onOpenVault,
}) => {
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Vault PIN quick toggle
  const [pinEnabled, setPinEnabled] = useState(() => hasVaultPin());
  const [isSettingPin, setIsSettingPin] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [pinMsg, setPinMsg] = useState('');

  // Crop mode preference
  const [cropMode, setCropMode] = useState<CropMode>(() => {
    try {
      return (localStorage.getItem('otium_scan_crop_mode') as CropMode) || 'full';
    } catch {
      return 'full';
    }
  });

  const handleToggleCropMode = () => {
    triggerHaptic(15);
    const next: CropMode = cropMode === 'full' ? 'auto' : 'full';
    setCropMode(next);
    try {
      localStorage.setItem('otium_scan_crop_mode', next);
    } catch {}
  };

  // Offline OCR Language Pack State
  const [ocrCached, setOcrCached] = useState(() => isOcrLanguageCached('ara+eng'));
  const [isDownloadingOcr, setIsDownloadingOcr] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);

  const handleDownloadOcr = async () => {
    triggerHaptic(20);
    setIsDownloadingOcr(true);
    setOcrProgress(0);
    try {
      const ok = await preloadOcrLanguage('ara+eng', (prog) => {
        setOcrProgress(prog);
      });
      if (ok) {
        setOcrCached(true);
        triggerHaptic(40);
      }
    } catch {
    } finally {
      setIsDownloadingOcr(false);
    }
  };

  if (!isOpen) return null;

  const triggerHaptic = (ms = 15) => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(ms);
      } catch {}
    }
  };

  const handleCheckUpdate = async () => {
    triggerHaptic(20);
    setIsCheckingUpdate(true);
    setUpdateError(null);
    try {
      const res = await checkForAppUpdates();
      setUpdateResult(res);
      triggerHaptic(30);
    } catch (err: any) {
      setUpdateError(err.message || 'تعذر الاتصال بـ GitHub للتحقق من التحديثات');
      triggerHaptic(40);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleSavePin = async () => {
    if (newPin.length !== 4) {
      setPinMsg('يجب أن يتكون رمز PIN من 4 أرقام بالضبط');
      return;
    }
    triggerHaptic(25);
    await setVaultPin(newPin);
    setPinEnabled(true);
    setIsSettingPin(false);
    setNewPin('');
    setPinMsg('✓ تم تفعيل قفل PIN للخزنة بنجاح');
    setTimeout(() => setPinMsg(''), 2500);
  };

  const handleRemovePin = () => {
    triggerHaptic(20);
    clearVaultPin();
    setPinEnabled(false);
    setPinMsg('✓ تم إزالة رمز PIN');
    setTimeout(() => setPinMsg(''), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-200 select-none">
      <div className="w-full max-w-md max-h-[92vh] bg-[#0c1017] border border-white/[0.12] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[0.08] otium-chrome">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
              <OtiumLogo size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">الإعدادات والتحديثات</h2>
              <p className="text-[10px] text-gray-400">التحكم في خيارات التطبيق والتحديثات المباشرة</p>
            </div>
          </div>
          <button
            onClick={() => {
              triggerHaptic(10);
              onClose();
            }}
            className="p-2 rounded-full glass-button text-gray-400 active:text-white"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-5 text-right font-arabic">
          {/* SECTION 1: App Updates (Prominent Card) */}
          <div className="bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-emerald-500/25 rounded-2xl p-4 space-y-3.5 shadow-lg shadow-black/40">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-white/[0.06] text-gray-400 border border-white/[0.08] flex items-center gap-1">
                <Smartphone className="w-3 h-3 text-emerald-400" />
                <span>{detectDeviceArchitecture()}</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">إصدار التطبيق</span>
                <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  أحدث إصدار: v{APP_CURRENT_VERSION}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-gray-300 leading-relaxed">
              تطبيق أو تيوم يعمل <strong className="text-emerald-400 font-semibold">دون اتصال بالإنترنت 100%</strong> حفاظاً على خصوصيتك؛ لا يتم الاتصال بالشبكة إلا عند نقرك على زر الفحص للتأكد من توفر إصدار أحدث.
            </p>

            {/* Check Button (Default) */}
            {!updateResult && !isCheckingUpdate && !updateError && (
              <button
                onClick={handleCheckUpdate}
                className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                <span>التحقق من وجود تحديثات جديدة</span>
              </button>
            )}

            {/* Loading Spinner */}
            {isCheckingUpdate && (
              <div className="text-center py-4 space-y-2 bg-black/30 rounded-xl border border-white/[0.05]">
                <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin mx-auto" />
                <p className="text-xs text-gray-300 font-medium">جاري فحص أحدث إصدار على GitHub Releases...</p>
              </div>
            )}

            {/* Error Notice */}
            {updateError && (
              <div className="space-y-3">
                <div className="flex items-start gap-2.5 text-rose-300 text-xs bg-rose-500/10 p-3 rounded-xl border border-rose-500/20 leading-relaxed">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{updateError}</span>
                </div>
                <button
                  onClick={() => nativeOpenUrl('https://github.com/XRTM8/Otium/releases/latest')}
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>تنزيل التحديث مباشرة عبر المتصفح</span>
                </button>
                <button
                  onClick={handleCheckUpdate}
                  className="w-full py-2 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white text-xs font-semibold flex items-center justify-center gap-2 border border-white/[0.1]"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>إعادة المحاولة</span>
                </button>
              </div>
            )}

            {/* Update Available Card */}
            {updateResult && updateResult.hasUpdate && (
              <div className="space-y-3 p-3.5 bg-emerald-950/20 border border-emerald-500/35 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400 font-mono">
                    {updateResult.publishedAt ? new Date(updateResult.publishedAt).toLocaleDateString() : ''}
                  </span>
                  <div className="flex items-center gap-1.5 text-emerald-400 font-black text-xs">
                    <Sparkles className="w-4 h-4 text-emerald-300 animate-pulse" />
                    <span>يتوفر إصدار أحدث: v{updateResult.latestVersion}</span>
                  </div>
                </div>

                {updateResult.releaseNotes && (
                  <div className="text-[11px] text-gray-300 bg-black/50 p-2.5 rounded-lg max-h-32 overflow-y-auto whitespace-pre-wrap font-sans border border-white/[0.06] leading-relaxed">
                    {updateResult.releaseNotes}
                  </div>
                )}

                {updateResult.matchedAsset ? (
                  <button
                    onClick={() => {
                      triggerHaptic(20);
                      nativeInstallApk(
                        updateResult.matchedAsset!.downloadUrl,
                        updateResult.matchedAsset!.name
                      );
                    }}
                    className="w-full py-3 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 transition-all font-arabic"
                  >
                    <Download className="w-4 h-4" />
                    <span>
                      تنزيل وتثبيت التحديث مباشرة (APK • {(updateResult.matchedAsset.size / (1024 * 1024)).toFixed(1)} MB)
                    </span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      triggerHaptic(20);
                      nativeOpenUrl(updateResult.releaseUrl);
                    }}
                    className="w-full py-3 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>فتح صفحة الإصدار على GitHub</span>
                  </button>
                )}

                <button
                  onClick={() => nativeOpenUrl(updateResult.releaseUrl)}
                  className="w-full text-center text-[10px] text-gray-400 hover:text-emerald-400 flex items-center justify-center gap-1 pt-1"
                >
                  <span>عرض تفاصيل الإصدار وسجل التغييرات الكامل</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Already Up to Date Card */}
            {updateResult && !updateResult.hasUpdate && (
              <div className="space-y-2.5 p-3.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-center">
                <div className="flex items-center justify-center gap-2 text-emerald-400 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تطبيقك محدث إلى أحدث إصدار (v{updateResult.currentVersion})</span>
                </div>
                <p className="text-[11px] text-gray-400">
                  تم دمج كافة تحسينات الأداء، ومحرك جودة كام سكانر، وتصحيح المنظور الهندسي.
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleCheckUpdate}
                    className="flex-1 py-1.5 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-gray-200 text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-white/[0.08]"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>فحص مجدداً</span>
                  </button>
                  <button
                    onClick={() => nativeOpenUrl(updateResult.releaseUrl)}
                    className="flex-1 py-1.5 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-gray-200 text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-white/[0.08]"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>سجل الإصدارات</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 2: Camera & Capture Preferences */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-white flex items-center justify-end gap-1.5">
              <span>تفضيلات التصوير والماسح</span>
              <Camera className="w-4 h-4 text-emerald-400" />
            </h3>

            {/* Crop Mode Selection */}
            <div className="flex items-center justify-between py-1 border-b border-white/[0.05]">
              <button
                onClick={handleToggleCropMode}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 ${
                  cropMode === 'full'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}
              >
                {cropMode === 'full' ? (
                  <>
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>كامل الإطار</span>
                  </>
                ) : (
                  <>
                    <Crop className="w-3.5 h-3.5" />
                    <span>تحديد ذكي</span>
                  </>
                )}
              </button>
              <div className="text-right">
                <span className="text-xs font-semibold text-gray-200 block">وضع حدود المستند</span>
                <span className="text-[10px] text-gray-400">
                  {cropMode === 'full'
                    ? 'كامل حدود الصورة (حماية 100% لكامل النصوص دون اقتطاع)'
                    : 'كشف وقص أطراف الورقة تلقائياً'}
                </span>
              </div>
            </div>

            {/* Sound Toggle */}
            <div className="flex items-center justify-between py-1 border-b border-white/[0.05]">
              <button
                onClick={() => {
                  triggerHaptic(15);
                  onToggleMute?.();
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  !isMuted
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-white/[0.06] text-gray-400 border border-white/[0.08]'
                }`}
              >
                {!isMuted ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                <span>{!isMuted ? 'مفعل' : 'مكتوم'}</span>
              </button>
              <div className="text-right">
                <span className="text-xs font-semibold text-gray-200 block">صوت الالتقاط</span>
                <span className="text-[10px] text-gray-400">تشغيل صوت الغالق عند التقاط صورة</span>
              </div>
            </div>

            {/* Auto Capture Toggle */}
            <div className="flex items-center justify-between py-1">
              <button
                onClick={() => {
                  triggerHaptic(15);
                  onToggleAutoCapture?.();
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  autoCaptureEnabled
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-white/[0.06] text-gray-400 border border-white/[0.08]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{autoCaptureEnabled ? 'مفعل' : 'معطل'}</span>
              </button>
              <div className="text-right">
                <span className="text-xs font-semibold text-gray-200 block">الالتقاط التلقائي الذكي</span>
                <span className="text-[10px] text-gray-400">التقاط الصفحة فور ثبات الهاتف واستقرار الحواف</span>
              </div>
            </div>
          </div>

          {/* SECTION 2.5: Offline OCR Language Pack */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-white flex items-center justify-end gap-1.5">
              <span>التعرف على النصوص (OCR) بدون إنترنت</span>
              <FileText className="w-4 h-4 text-emerald-400" />
            </h3>

            <div className="flex items-center justify-between py-1">
              {ocrCached ? (
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 rounded-xl">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>محملة وجاهزة</span>
                </div>
              ) : isDownloadingOcr ? (
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{Math.round(ocrProgress * 100)}% جارٍ التنزيل...</span>
                </div>
              ) : (
                <button
                  onClick={handleDownloadOcr}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/[0.06] hover:bg-emerald-500 hover:text-black text-gray-200 border border-white/[0.1] transition-all flex items-center gap-1.5 active:scale-95"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تنزيل الحزمة (عربي + إنجليزي)</span>
                </button>
              )}

              <div className="text-right">
                <span className="text-xs font-semibold text-gray-200 block">حزمة الذكاء اللغوي</span>
                <span className="text-[10px] text-gray-400">
                  {ocrCached
                    ? 'الحزمة مثبتة محلياً لإنشاء ملفات PDF قابلة للبحث دون اتصال'
                    : 'قم بالتنزيل لتمكين استخراج النصوص والبحث داخل PDF أثناء انقطاع الشبكة'}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 3: Vault Security & Storage */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-white flex items-center justify-end gap-1.5">
              <span>أمان الخزنة والتخزين</span>
              <Shield className="w-4 h-4 text-emerald-400" />
            </h3>

            {pinMsg && (
              <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs text-center font-medium">
                {pinMsg}
              </div>
            )}

            {/* PIN Lock */}
            <div className="flex items-center justify-between py-1">
              {pinEnabled ? (
                <button
                  onClick={handleRemovePin}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>إلغاء القفل</span>
                </button>
              ) : isSettingPin ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleSavePin}
                    className="px-2.5 py-1.5 rounded-xl bg-emerald-500 text-black font-bold text-xs"
                  >
                    حفظ
                  </button>
                  <input
                    type="password"
                    maxLength={4}
                    placeholder="4 أرقام"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    className="w-18 bg-white/[0.08] border border-white/[0.15] rounded-xl px-2 py-1 text-center text-xs text-white tracking-widest font-mono"
                  />
                  <button
                    onClick={() => setIsSettingPin(false)}
                    className="text-gray-400 text-xs px-1"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    triggerHaptic(15);
                    setIsSettingPin(true);
                    setNewPin('');
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/[0.06] text-gray-300 border border-white/[0.08] flex items-center gap-1.5 hover:border-emerald-500/40"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>تعيين PIN</span>
                </button>
              )}

              <div className="text-right">
                <span className="text-xs font-semibold text-gray-200 block">قفل الخزنة برمز PIN</span>
                <span className="text-[10px] text-gray-400">
                  {pinEnabled ? 'الخزنة محمية برمز سري' : 'حماية المستندات برمز سري من 4 أرقام'}
                </span>
              </div>
            </div>

            {onOpenVault && (
              <button
                onClick={() => {
                  triggerHaptic(15);
                  onClose();
                  onOpenVault();
                }}
                className="w-full py-2 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-emerald-400 text-xs font-semibold flex items-center justify-center gap-2 border border-white/[0.08] transition-colors"
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>فتح خزنة المستندات والنسخ الاحتياطي</span>
              </button>
            )}
          </div>

          {/* SECTION 4: About Otium Ecosystem */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 text-center space-y-2">
            <div className="flex items-center justify-center gap-2">
              <OtiumLogo size={16} className="text-emerald-400" />
              <span className="text-xs font-bold text-white tracking-wider">Otium Ecosystem</span>
            </div>
            <p className="text-[10px] text-gray-400 leading-relaxed max-w-xs mx-auto">
              تطبيقات أو تيوم مصممة وفق فلسفة صارمة: خصوصية مطلقة، دون خوادم، خالية تماماً من الإعلانات والتتبع، ومفتوحة المصدر لتدوم باستقرار تام.
            </p>
            <button
              onClick={() => {
                triggerHaptic(15);
                nativeOpenUrl('https://github.com/XRTM8/Otium');
              }}
              className="py-1.5 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-gray-300 text-[11px] font-medium inline-flex items-center gap-1.5 border border-white/[0.08] transition-colors"
            >
              <span>مستودع المشروع على GitHub</span>
              <ExternalLink className="w-3 h-3 text-gray-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
