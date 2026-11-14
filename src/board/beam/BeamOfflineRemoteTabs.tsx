import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Cast,
  Check,
  FileUp,
  FolderOpen,
  Radio,
  RefreshCw,
  Smartphone,
  WifiOff,
} from 'lucide-react';
import type { Language } from '../../core/i18n/translations';
import type { ReaderController } from '../../app/useReaderController';
import { beamService } from './beamService';

export const BeamOfflineTab: React.FC<{
  lang: Language;
  offlineFileInputRef: React.RefObject<HTMLInputElement | null>;
}> = ({ lang, offlineFileInputRef }) => (
  <div className="p-5 space-y-3 text-start">
    <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span className="font-semibold">
        {lang === 'ar' ? 'افتح الملفات الموجودة على هذا الجهاز' : 'Open files stored on this device'}
      </span>
    </div>

    <div className="p-3 rounded-2xl bg-hover-subtle border border-line space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FolderOpen className="w-4 h-4 text-accent" />
          <span className="text-xs font-bold text-ink">
            {lang === 'ar' ? 'فتح من فلاش ميموري USB أو الذاكرة' : 'Open from USB Flash or Storage'}
          </span>
        </div>
      </div>
      <p className="text-[10px] text-ink-muted leading-tight">
        {lang === 'ar'
          ? 'صل فلاشة USB بالسبورة وافتح الكتاب لتفعيل السبورة المنقسمة 50/50 فوراً.'
          : 'Plug USB drive into smartboard to launch PDF with side-by-side whiteboard.'}
      </p>
      <button
        type="button"
        onClick={() => offlineFileInputRef.current?.click()}
        className="w-full py-2 px-3 rounded-xl bg-accent text-on-accent text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-accent-strong active:scale-98 transition-all cursor-pointer shadow-xs"
      >
        <FileUp className="w-3.5 h-3.5" />
        <span>{lang === 'ar' ? 'اختيار ملف من الجهاز أو فلاشة USB' : 'Select PDF from USB or Disk'}</span>
      </button>
    </div>

    <div className="p-3 rounded-2xl bg-hover-subtle border border-line space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Smartphone className="w-4 h-4 text-emerald-500" />
        <span className="text-xs font-bold text-ink">
          {lang === 'ar' ? 'هوتسبوت الهاتف (شبكة محلية بدون رصيد)' : 'Mobile Hotspot (Local Wi-Fi)'}
        </span>
      </div>
      <p className="text-[10px] text-ink-muted leading-relaxed">
        {lang === 'ar'
          ? 'فعّل "نقطة الاتصال / Hotspot" بهاتفك واشبك السبورة عليها (بدون رصيد ولا نت) لنقل الملف بسرعة 100MB/s.'
          : 'Turn on phone hotspot and connect smartboard over local Wi-Fi with zero data.'}
      </p>
    </div>

    <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
      <Check className="w-3.5 h-3.5 shrink-0" />
      <span>
        {lang === 'ar'
          ? 'الموقع مثبت في ذاكرة المتصفح (PWA Cache) ويفتح دائماً أوفلاين.'
          : 'Cached locally in browser; opens anytime offline.'}
      </span>
    </div>
  </div>
);

export const BeamRemoteTab: React.FC<{
  lang: Language;
  reader: ReaderController;
  mediaFile?: File | null;
  isReceiverAcknowledged: boolean;
  peerLeft: boolean;
  connectedRoom: string | null;
  remoteDocTitle: string;
  remoteTotal: number;
  activePage: number;
  activeTotal: number;
  activeDocTitle: string;
  isSending: boolean;
  uploadProgress: number | null;
  beamError?: string | null;
  onDisconnectToSend: () => void;
  beamFileInputRef: React.RefObject<HTMLInputElement | null>;
  handleBeamDocument: (overrideCode?: string) => Promise<void>;
  handleRemotePrev: () => void;
  handleRemoteNext: () => void;
  onReconnect?: () => void;
}> = ({
  lang,
  reader,
  mediaFile,
  isReceiverAcknowledged,
  peerLeft,
  connectedRoom,
  remoteDocTitle,
  remoteTotal,
  activePage,
  activeTotal,
  activeDocTitle,
  isSending,
  uploadProgress,
  beamError,
  onDisconnectToSend,
  beamFileInputRef,
  handleBeamDocument,
  handleRemotePrev,
  handleRemoteNext,
  onReconnect,
}) => (
  <div className="p-5 space-y-4 text-center">
    <div className="flex items-center justify-between text-xs text-ink-muted px-1">
      {isReceiverAcknowledged ? (
        <span className="flex items-center gap-1.5 text-emerald-500 font-semibold text-[11px]">
          <Radio className="w-3 h-3 animate-pulse text-emerald-500" />
          <span>
            {lang === 'ar' ? 'متصل فعلياً بالسبورة:' : 'Live Connected:'}{' '}
            <strong className="font-mono text-ink">{connectedRoom}</strong>
          </span>
        </span>
      ) : peerLeft ? (
        <span className="text-ink-muted">{lang === 'ar' ? 'تم فصل السبورة' : 'Board disconnected'}</span>
      ) : (
        <span className="flex items-center gap-1.5 text-amber-500 font-semibold text-[11px]">
          <RefreshCw className="w-3 h-3 animate-spin text-amber-500" />
          <span>
            {lang === 'ar' ? 'بانتظار استجابة السبورة…' : 'Waiting for board…'}{' '}
            <strong className="font-mono text-ink">{connectedRoom}</strong>
          </span>
        </span>
      )}
      <button
        type="button"
        onClick={() => {
          beamService.disconnect();
          onDisconnectToSend();
        }}
        className="text-[11px] text-danger-ink hover:underline cursor-pointer"
      >
        {lang === 'ar' ? 'قطع الاتصال' : 'Disconnect'}
      </button>
    </div>

    {!isReceiverAcknowledged && !peerLeft && (
      <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-start text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
        <span>
          ⚠️{' '}
          {lang === 'ar'
            ? 'لم تستجب السبورة حتى الآن. تأكد أن المتصفح في الحاسبة مفتوح على نافذة "استقبال" وأن الرمز مطابق.'
            : 'Smartboard has not responded yet. Ensure PC browser is open on "Receiver" tab with matching code.'}
        </span>
      </div>
    )}

    {onReconnect && <button type="button" onClick={onReconnect}
      className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-on-accent cursor-pointer">
      {lang === 'ar' ? 'إعادة الاتصال بالشاشة' : 'Reconnect to the screen'}
    </button>}
    {beamError && <p role="alert" className="text-sm text-danger-ink">{beamError}</p>}
    {isReceiverAcknowledged && !reader.doc && !mediaFile && (!remoteDocTitle || remoteTotal === 0) && (
      <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-start space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
          <FolderOpen className="w-4 h-4 text-amber-500" />
          <span>{lang === 'ar' ? 'السبورة لا تعرض أي ملزمة حالياً!' : 'No document is open on Smartboard!'}</span>
        </div>
        <p className="text-[11px] text-ink-muted leading-tight">
          {lang === 'ar'
            ? 'اختر PDF أو صورة أو فيديو أو PowerPoint لعرضه على الشاشة.'
            : 'Choose a PDF, image, video, or PowerPoint presentation to show on the screen.'}
        </p>
        <button
          type="button"
          onClick={() => beamFileInputRef.current?.click()}
          className="w-full py-2 px-3 rounded-xl bg-accent text-on-accent font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs hover:bg-accent-strong transition-all"
        >
          <FileUp className="w-3.5 h-3.5" />
          <span>{lang === 'ar' ? 'اختيار ملف للبث' : 'Choose file to beam'}</span>
        </button>
      </div>
    )}

    <div className="p-2.5 rounded-2xl bg-accent/10 border border-accent/20 text-start text-[11px] text-ink leading-relaxed">
      <span className="font-bold text-accent">💡 {lang === 'ar' ? 'تقليب مباشر:' : 'Live Page Turning:'} </span>
      {reader.doc
        ? lang === 'ar'
          ? 'يمكنك إغلاق هذه النافذة وتصفح الملزمة بحرية من هاتفك (بالسحب أو الأسهم)، وستتحرك شاشة الحاسبة والسبورة معك فوراً!'
          : 'You can close this modal and turn pages normally in Otium on your phone; your PC will follow in real-time!'
        : lang === 'ar'
          ? 'تم الاقتران بنجاح! يمكنك الآن تقليب شرائح وملزمة الحاسبة والسبورة بالكامل من هاتفك.'
          : 'Paired successfully! You can now control your PC / Smartboard slides directly from your phone.'}
    </div>

    <div className="w-full bg-hover rounded-full h-1.5 overflow-hidden">
      <div
        className="bg-accent h-full transition-all duration-300 rounded-full"
        style={{ width: `${activeTotal > 0 ? (activePage / activeTotal) * 100 : 50}%` }}
      />
    </div>

    <div className="py-3 px-4 rounded-2xl bg-hover-subtle border border-line space-y-0.5">
      <div className="text-3xl font-black text-ink font-mono tracking-tight">
        {activePage} <span className="text-sm font-normal text-ink-muted">/ {activeTotal > 0 ? activeTotal : '-'}</span>
      </div>
      <div className="text-[11px] text-ink-muted truncate max-w-xs mx-auto">{activeDocTitle}</div>
    </div>

    {(reader.doc || mediaFile) && connectedRoom && (
      <button
        type="button"
        onClick={() => void handleBeamDocument(connectedRoom)}
        disabled={isSending}
        className="w-full py-2 px-3 rounded-xl bg-hover border border-line hover:border-accent/40 text-ink text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
      >
        {isSending ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-accent" />
        ) : (
          <Cast className="w-3.5 h-3.5 text-accent" />
        )}
        <span>
          {isSending
            ? uploadProgress
              ? `${uploadProgress}%`
              : lang === 'ar'
                ? 'جارٍ الإرسال...'
                : 'Sending...'
            : lang === 'ar'
              ? 'إعادة بث الملف'
              : 'Send file again'}
        </span>
      </button>
    )}

    <div className="grid grid-cols-2 gap-3">
      <button
        type="button"
        onClick={handleRemotePrev}
        disabled={activeTotal > 0 && activePage <= 1}
        className="py-7 px-4 rounded-2xl bg-hover border border-line hover:bg-hover-strong active:scale-95 text-ink font-bold text-sm flex flex-col items-center justify-center gap-2 cursor-pointer disabled:opacity-25 disabled:pointer-events-none transition-all shadow-xs touch-manipulation"
      >
        <ArrowRight className="w-6 h-6 rtl:rotate-0 ltr:rotate-180 text-ink-muted" />
        <span>{lang === 'ar' ? 'السابقة' : 'Previous'}</span>
      </button>

      <button
        type="button"
        onClick={handleRemoteNext}
        disabled={activeTotal > 0 && activePage >= activeTotal}
        className="py-7 px-4 rounded-2xl bg-accent text-on-accent hover:bg-accent-strong active:scale-95 font-bold text-sm flex flex-col items-center justify-center gap-2 cursor-pointer disabled:opacity-25 disabled:pointer-events-none shadow-md transition-all touch-manipulation"
      >
        <ArrowLeft className="w-6 h-6 rtl:rotate-0 ltr:rotate-180" />
        <span>{lang === 'ar' ? 'التالية' : 'Next'}</span>
      </button>
    </div>

    <div className="pt-1 text-[10px] text-ink-muted/80 flex items-center justify-center gap-2">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500/80" />
      <span>{lang === 'ar' ? 'اهتزاز فيزيائي عند التقليب' : 'Haptic pulse enabled'}</span>
      <span>•</span>
      <span>{lang === 'ar' ? 'مفاتيح الأسهم مدعومة' : 'Arrow keys supported'}</span>
    </div>
  </div>
);
