import React from 'react';
import { Check, Copy, FileUp, FolderOpen, RefreshCw } from 'lucide-react';
import type { Language } from '../../core/i18n/translations';
import type { ReaderController } from '../../app/useReaderController';
import type { BeamPeerState, BeamTransferState } from '../types';
import { beamService, type BeamConnectionStatus } from './beamService';
import { QrCodeView } from './QrCodeView';
import { formatBeamBytes } from './beamUtils';

export const BeamReceiveTab: React.FC<{
  lang: Language;
  reader: ReaderController;
  connectedRemotePeer: string | null;
  receiverRoomCode: string;
  onSetBoardOpen: (open: boolean) => void;
  onClose: () => void;
  receiverFileInputRef: React.RefObject<HTMLInputElement | null>;
  transfer: BeamTransferState;
  transferPhaseText: string | null;
  beamError: string | null;
  smartboardUrl: string;
  copiedCode: boolean;
  handleCopyCode: () => void;
  handleRegenerateCode: () => void;
  peerLeft: boolean;
  peer: BeamPeerState;
  connStatus: BeamConnectionStatus;
  local?: boolean;
  lanCode?: string;
  lanAddresses?: string[];
  lanAddress?: string;
  selectLanAddress?: (address: string) => void;
  pairingBusy?: boolean;
}> = ({
  lang,
  reader,
  connectedRemotePeer,
  receiverRoomCode,
  onSetBoardOpen,
  onClose,
  receiverFileInputRef,
  transfer,
  transferPhaseText,
  beamError,
  smartboardUrl,
  copiedCode,
  handleCopyCode,
  handleRegenerateCode,
  peerLeft,
  peer,
  connStatus,
  local,
  lanCode,
  lanAddresses,
  lanAddress,
  selectLanAddress,
  pairingBusy,
}) => (
  <div className="p-5 flex flex-col items-center justify-center space-y-3.5 text-center">
    {connectedRemotePeer && (
      <div className="w-full p-4 rounded-2xl bg-emerald-500/15 border-2 border-emerald-500/40 text-start space-y-2 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <span>{lang === 'ar' ? `✅ متصل الآن بجهازك (${connectedRemotePeer})!` : `✅ Paired with ${connectedRemotePeer}!`}</span>
          </span>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-300">
            {local ? 'LAN' : receiverRoomCode}
          </span>
        </div>
        <p className="text-xs text-ink leading-relaxed">
          {reader.doc
            ? lang === 'ar'
              ? 'قلّب الصفحات من الهاتف.'
              : 'Turn pages from your phone.'
            : lang === 'ar'
              ? 'الشاشة متصلة بالهاتف وتنتظر الملف.'
              : 'Waiting for a file from the phone.'}
        </p>
        {reader.doc ? (
          <button
            type="button"
            onClick={() => {
              onSetBoardOpen(true);
              onClose();
            }}
            className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-all"
          >
            <span>{lang === 'ar' ? '🚀 عرض المحاضرة الآن بملء الشاشة' : '🚀 Present Lecture Fullscreen'}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => receiverFileInputRef.current?.click()}
            className="w-full py-2.5 px-3 rounded-xl bg-accent text-on-accent font-bold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer hover:bg-accent-strong transition-all"
          >
            <FileUp className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'فتح PDF على هذه الشاشة' : 'Open a PDF on this screen'}</span>
          </button>
        )}
      </div>
    )}

    {transfer.active && transfer.direction === 'receive' && (
      <div className="w-full p-3 rounded-2xl bg-accent/10 border border-accent/25 space-y-2 text-start animate-in fade-in duration-150">
        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-accent">
          <span className="flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>{transferPhaseText || (lang === 'ar' ? 'جارٍ استلام الملف…' : 'Receiving the file…')}</span>
          </span>
          <span className="font-mono">
            {formatBeamBytes(transfer.bytesTransferred)} / {formatBeamBytes(transfer.totalBytes)}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-accent/15 overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-200"
            style={{ width: `${Math.max(2, transfer.progress)}%` }}
          />
        </div>
      </div>
    )}

    {beamError && (
      <div className="w-full p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-danger-ink text-xs font-sans text-start">
        {beamError}
      </div>
    )}

    {!connectedRemotePeer && (
      <div className="space-y-0.5">
        <h4 className="text-xs font-bold text-ink">
          {local ? (lang === 'ar' ? 'امسح هذا الرمز من داخل Otium على الهاتف' : 'Scan this code from Otium on your phone') :
            (lang === 'ar' ? 'وجّه كاميرا الهاتف نحو الرمز لبث المحاضرة' : 'Point phone camera at QR to beam')}
        </h4>
        <p className="text-[11px] text-ink-muted">
          {local ? (lang === 'ar' ? 'يكفي أن يكون الجهازان على نفس الشبكة.' : 'Keep both devices on the same local network.') :
            (lang === 'ar' ? 'أو افتح Otium بهاتفك واضغط بث' : 'Or open Otium on phone and tap Beam')}
        </p>
      </div>
    )}

    {!connectedRemotePeer && (!local || lanCode) && (
      <div className="my-0.5 shadow-sm rounded-2xl p-1 bg-white border border-line">
        <QrCodeView key={local ? lanCode : smartboardUrl} value={local ? lanCode! : smartboardUrl} size={170} />
      </div>
    )}

    {local && lanAddresses && lanAddresses.length > 1 && !connectedRemotePeer && (
      <select aria-label={lang === 'ar' ? 'عنوان الشاشة المحلي' : 'Screen LAN address'} dir="ltr"
        className="rounded-lg border border-line bg-surface px-2 py-1 text-xs"
        value={lanAddress} onChange={event => selectLanAddress?.(event.target.value)}>
        {lanAddresses.map(address => <option key={address}>{address}</option>)}
      </select>
    )}
    {local && !connectedRemotePeer && lanCode && (
      <input readOnly dir="ltr" aria-label={lang === 'ar' ? 'رمز LAN' : 'LAN code'} value={lanCode}
        onFocus={event => event.currentTarget.select()}
        className="w-full rounded-lg border border-line bg-hover px-2 py-1 font-mono text-xs" />
    )}
    <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-hover border border-line">
      <span className="font-mono text-xl font-black tracking-[0.2em] text-accent">
        {local ? (lanAddress || 'LAN') : receiverRoomCode}
      </span>
      <button
        type="button"
        onClick={handleCopyCode}
        disabled={local && !lanCode}
        className="p-1 rounded-lg hover:bg-surface text-ink-muted hover:text-ink transition-colors cursor-pointer"
        title={lang === 'ar' ? 'نسخ الرمز' : 'Copy Code'}
      >
        {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        onClick={handleRegenerateCode}
        disabled={pairingBusy}
        className="p-1 rounded-lg hover:bg-surface text-ink-muted hover:text-ink transition-colors cursor-pointer"
        title={lang === 'ar' ? 'توليد رمز جديد' : 'Generate New Code'}
      >
        <RefreshCw className="w-3.5 h-3.5" />
      </button>
    </div>

    {reader.doc ? (
      <div className="w-full p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-start space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
            <Check className="w-3.5 h-3.5 text-emerald-500" />
            <span>{lang === 'ar' ? 'الملزمة معروضة وجاهزة للتحكم:' : 'Document ready for remote:'}</span>
          </span>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            {lang === 'ar' ? `ص ${reader.currentPage}/${reader.numPages}` : `p. ${reader.currentPage}/${reader.numPages}`}
          </span>
        </div>
        <div className="text-xs font-bold text-ink truncate">{reader.docTitle}</div>
      </div>
    ) : (
      <div className="w-full p-3 rounded-2xl bg-hover-subtle border border-line text-start space-y-2">
        <div className="flex items-center gap-1.5 text-ink font-bold text-xs">
          <FolderOpen className="w-4 h-4 text-accent" />
          <span>{lang === 'ar' ? 'ملف على هذه الشاشة أو USB' : 'File on this screen or USB'}</span>
        </div>
        <p className="text-[11px] text-ink-muted leading-tight">
          {lang === 'ar'
            ? 'إذا كانت الملزمة موجودة على هذه الشاشة أو فلاشة USB، افتحها هنا وتحكّم بالصفحات من الهاتف.'
            : 'If you have the PDF on this PC or USB, open it here and use your phone as a wireless clicker.'}
        </p>
        <button
          type="button"
          onClick={() => receiverFileInputRef.current?.click()}
          className="w-full py-2 px-3 rounded-xl bg-accent/15 hover:bg-accent/25 border border-accent/30 text-accent font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
        >
          <FileUp className="w-3.5 h-3.5" />
          <span>{lang === 'ar' ? 'اختيار PDF' : 'Choose PDF'}</span>
        </button>
      </div>
    )}

    <div className="flex items-center gap-1.5 text-[10px] text-ink-muted pt-1 border-t border-line w-full justify-center">
      {peerLeft && !peer.connected ? (
        <span className="font-semibold text-ink-muted">
          {lang === 'ar' ? 'تم فصل الجهاز — بانتظار ربط جديد' : 'Device disconnected — waiting for a new pairing'}
        </span>
      ) : local ? (
        <span role="status">{pairingBusy
          ? (lang === 'ar' ? 'جارٍ فتح الاتصال المحلي…' : 'Starting local receiving…')
          : connectedRemotePeer ? (lang === 'ar' ? 'الهاتف مرتبط عبر LAN' : 'Phone paired over LAN')
          : lanCode ? (lang === 'ar' ? 'LAN جاهز وينتظر الهاتف' : 'Ready for local pairing') : null}</span>
      ) : connStatus === 'connected' ? (
        <>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
            {peer.connected
              ? lang === 'ar'
                ? 'الهاتف مرتبط'
                : 'Phone paired'
              : lang === 'ar'
                ? 'خدمة الربط جاهزة — بانتظار الهاتف'
                : 'Signaling ready — waiting for phone'}
          </span>
        </>
      ) : connStatus === 'connecting' ? (
        <>
          <RefreshCw className="w-3 h-3 text-amber-500 animate-spin shrink-0" />
          <span className="text-amber-500 font-medium">
            {lang === 'ar' ? 'جارٍ الاتصال بالسحابة…' : 'Connecting to cloud…'}
          </span>
        </>
      ) : connStatus === 'error' ? (
        <div className="flex flex-col items-center gap-1">
          <span className="text-rose-500 font-medium flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
            {lang === 'ar'
              ? 'تعذر الاتصال بالسحابة (تحقق من إنترنت القاعة أو استخدم وضع بدون إنترنت)'
              : 'Cloud connection failed (check network or use offline mode)'}
          </span>
          <button
            type="button"
            onClick={() => beamService.retryCloudConnection()}
            className="text-accent underline text-[10px] cursor-pointer"
          >
            {lang === 'ar' ? 'إعادة محاولة السحابة' : 'Retry cloud connection'}
          </button>
        </div>
      ) : (
        <>
          <span className="w-2 h-2 rounded-full bg-line-strong shrink-0" />
          <span>{lang === 'ar' ? 'غير متصل' : 'Disconnected'}</span>
        </>
      )}
    </div>

    <button
      type="button"
      onClick={() => {
        beamService.disconnect();
        onClose();
      }}
      className="text-[11px] text-ink-muted hover:text-danger-ink underline cursor-pointer"
    >
      {lang === 'ar' ? 'إيقاف وضع الاستقبال' : 'Stop Receiving Mode'}
    </button>
  </div>
);
