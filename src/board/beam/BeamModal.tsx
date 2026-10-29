import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Cast,
  Check,
  Copy,
  Radio,
  RefreshCw,
  Send,
  Smartphone,
  Tv,
  X
} from 'lucide-react';
import type { Language } from '../../core/i18n/translations';
import type { ThemeMode } from '../../core/types';
import type { ReaderController } from '../../app/useReaderController';
import { getDocumentFromStorage } from '../../core/storage/documents';
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  beamService,
  generateRoomCode
} from './beamService';
import { QrCodeView } from './QrCodeView';
import type { BeamMessage } from '../types';

interface BeamModalProps {
  isOpen: boolean;
  lang: Language;
  theme?: ThemeMode;
  reader: ReaderController;
  isBoardOpen?: boolean;
  onSetBoardOpen: (open: boolean) => void;
  onClose: () => void;
}

export const BeamModal: React.FC<BeamModalProps> = ({
  isOpen,
  lang,
  reader,
  onSetBoardOpen,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'send' | 'receive' | 'remote'>('send');
  const [targetRoomCode, setTargetRoomCode] = useState('');
  const [receiverRoomCode] = useState(() => generateRoomCode());
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [connectedRoom, setConnectedRoom] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Subscribe to beam messages (for receiver mode & remote page syncing)
  useEffect(() => {
    const unsubscribe = beamService.subscribe(async (msg: BeamMessage) => {
      // Receiver Mode: Handle incoming payload
      if (activeTab === 'receive' && msg.type === 'BEAM_PAYLOAD' && msg.payload) {
        if (msg.roomCode.toUpperCase() === receiverRoomCode.toUpperCase()) {
          try {
            if (msg.payload.pdfBase64) {
              const buffer = base64ToArrayBuffer(msg.payload.pdfBase64);
              await reader.loadDocumentBytes(buffer, msg.payload.title);
              if (msg.payload.pageNumber) {
                reader.scrollToPage(msg.payload.pageNumber);
              }
              if (msg.payload.theme) {
                reader.changeTheme(msg.payload.theme);
              }
            }
            onSetBoardOpen(true);
            onClose();
          } catch (err) {
            console.error('Failed to load beamed PDF:', err);
          }
        }
      }

      // Page Flipping Sync
      if (msg.type === 'BEAM_PAGE_CHANGE' && msg.pageNumber) {
        if (connectedRoom && msg.roomCode.toUpperCase() === connectedRoom.toUpperCase()) {
          reader.scrollToPage(msg.pageNumber);
        }
      }
    });

    return () => unsubscribe();
  }, [activeTab, receiverRoomCode, connectedRoom, reader, onSetBoardOpen, onClose]);

  if (!isOpen) return null;

  // Send current book to Smartboard
  const handleBeamDocument = async () => {
    const code = targetRoomCode.trim().toUpperCase();
    if (!code) return;

    if (!reader.doc || !reader.docId) {
      alert(lang === 'ar' ? 'يرجى فتح كتاب أولاً لبثه إلى السبورة' : 'Please open a document first');
      return;
    }

    setIsSending(true);
    setSendSuccess(false);

    try {
      const buffer = await getDocumentFromStorage(reader.docId);
      if (!buffer) {
        throw new Error('Document buffer not found in storage');
      }

      const base64 = arrayBufferToBase64(buffer);

      const payloadMsg: BeamMessage = {
        type: 'BEAM_PAYLOAD',
        roomCode: code,
        senderName: navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop',
        payload: {
          title: reader.docTitle,
          pageNumber: reader.currentPage,
          totalPages: reader.numPages,
          theme: reader.theme,
          pdfBase64: base64
        },
        timestamp: Date.now()
      };

      beamService.broadcast(payloadMsg);

      setConnectedRoom(code);
      setSendSuccess(true);
      setIsSending(false);

      // Transition to remote controller mode
      setTimeout(() => {
        setActiveTab('remote');
      }, 500);
    } catch (err) {
      console.error('Failed to beam document:', err);
      setIsSending(false);
      alert(lang === 'ar' ? 'تعذر إرسال المستند، تأكد من الرمز وحاول مجدداً' : 'Failed to beam document');
    }
  };

  // Remote clicker controls
  const handleRemoteNext = () => {
    const nextPage = Math.min(reader.numPages, reader.currentPage + 1);
    reader.goToNextPage();
    if (connectedRoom) {
      beamService.broadcast({
        type: 'BEAM_PAGE_CHANGE',
        roomCode: connectedRoom,
        pageNumber: nextPage,
        timestamp: Date.now()
      });
    }
  };

  const handleRemotePrev = () => {
    const prevPage = Math.max(1, reader.currentPage - 1);
    reader.goToPrevPage();
    if (connectedRoom) {
      beamService.broadcast({
        type: 'BEAM_PAGE_CHANGE',
        roomCode: connectedRoom,
        pageNumber: prevPage,
        timestamp: Date.now()
      });
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(receiverRoomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 select-none animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg rounded-3xl bg-surface border border-line shadow-2xl overflow-hidden flex flex-col text-ink">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-line bg-hover-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent">
              <Cast className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-ink">
                {lang === 'ar' ? 'البث اللحظي للسبورة الذكية' : 'Smart Beam to Board'}
              </h3>
              <p className="text-xs text-ink-muted">
                {lang === 'ar' ? 'بروتوكول Otium Link فائق السرعة والأمان' : 'Otium Link Zero-Latency Protocol'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-hover text-ink-muted hover:text-ink transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center p-2 bg-surface/50 border-b border-line gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('send')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'send'
                ? 'bg-accent text-on-accent shadow-sm'
                : 'text-ink-muted hover:text-ink hover:bg-hover'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>{lang === 'ar' ? 'بث إلى السبورة 📡' : 'Beam to Board 📡'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('receive')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'receive'
                ? 'bg-accent text-on-accent shadow-sm'
                : 'text-ink-muted hover:text-ink hover:bg-hover'
            }`}
          >
            <Tv className="w-4 h-4" />
            <span>{lang === 'ar' ? 'استقبال كسبورة 📺' : 'Receiver Screen 📺'}</span>
          </button>

          {connectedRoom && (
            <button
              type="button"
              onClick={() => setActiveTab('remote')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'remote'
                  ? 'bg-emerald-600 text-white shadow-sm animate-pulse'
                  : 'text-emerald-500 hover:bg-hover'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>{lang === 'ar' ? 'ريموت العرض 📱' : 'Clicker 📱'}</span>
            </button>
          )}
        </div>

        {/* Tab 1: Send / Beam Document to Smartboard */}
        {activeTab === 'send' && (
          <div className="p-6 space-y-5">
            {reader.doc ? (
              <div className="p-3.5 rounded-2xl bg-hover-subtle border border-line flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-accent font-semibold">
                    {lang === 'ar' ? 'الكتاب الجاهز للبث' : 'Document to Beam'}
                  </div>
                  <div className="text-sm font-bold truncate max-w-[260px] text-ink">
                    {reader.docTitle}
                  </div>
                  <div className="text-xs text-ink-muted">
                    {lang === 'ar'
                      ? `الصفحة ${reader.currentPage} من ${reader.numPages}`
                      : `Page ${reader.currentPage} of ${reader.numPages}`}
                  </div>
                </div>

                <div className="px-2.5 py-1 rounded-full bg-accent/15 text-accent text-xs font-mono font-bold">
                  PDF
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500 text-center">
                {lang === 'ar' ? 'يرجى فتح كتاب أو مستند أولاً لبثه للسبورة' : 'Please open a document first'}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold text-ink">
                {lang === 'ar' ? 'أدخل رمز الغرفة الظاهر على السبورة الذكية:' : 'Enter Smartboard Room Code:'}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={targetRoomCode}
                  onChange={(e) => setTargetRoomCode(e.target.value.toUpperCase())}
                  placeholder="OTM-XXX-XXX"
                  className="flex-1 px-4 py-3 rounded-2xl bg-hover border border-line font-mono text-base font-bold text-center tracking-widest text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleBeamDocument}
              disabled={isSending || !targetRoomCode.trim() || !reader.doc}
              className="w-full py-3.5 rounded-2xl bg-accent text-on-accent font-bold text-sm flex items-center justify-center gap-2 shadow-lg hover:bg-accent-strong active:scale-98 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
            >
              {isSending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{lang === 'ar' ? 'جارٍ الإرسال إلى السبورة…' : 'Beaming to Board…'}</span>
                </>
              ) : sendSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'تم الاتصال والبث بنجاح!' : 'Beamed Successfully!'}</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'بث الكتاب للسبورة الآن 🚀' : 'Beam Document Now 🚀'}</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Tab 2: Receiver Mode (Smartboard Display) */}
        {activeTab === 'receive' && (
          <div className="p-6 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-accent uppercase tracking-wider">
                {lang === 'ar' ? 'شاشة استقبال السبورة الذكية' : 'Smartboard Receiver Screen'}
              </span>
              <h4 className="text-sm text-ink-muted">
                {lang === 'ar'
                  ? 'امسح الرمز أو أدخل كود الغرفة بهاتفك/حاسوبك'
                  : 'Scan QR or enter this code on your device'}
              </h4>
            </div>

            {/* QR Code Display */}
            <div className="my-1">
              <QrCodeView value={receiverRoomCode} size={150} />
            </div>

            {/* Room Code with Copy */}
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-hover border border-line">
              <span className="font-mono text-xl font-extrabold tracking-widest text-ink">
                {receiverRoomCode}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="p-1.5 rounded-xl hover:bg-surface text-ink-muted hover:text-ink transition-colors cursor-pointer"
                title={lang === 'ar' ? 'نسخ الرمز' : 'Copy Code'}
              >
                {copiedCode ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            {/* Pulsing Radar Waiting Status */}
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <span>{lang === 'ar' ? 'بانتظار إرسال الكتاب من هاتفك…' : 'Waiting for incoming book…'}</span>
            </div>
          </div>
        )}

        {/* Tab 3: Presentation Remote Clicker */}
        {activeTab === 'remote' && (
          <div className="p-6 space-y-5 text-center">
            <div className="flex items-center justify-between text-xs text-ink-muted px-1">
              <span className="flex items-center gap-1.5 text-emerald-500 font-semibold">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                <span>{lang === 'ar' ? 'متصل بالسبورة:' : 'Connected:'} {connectedRoom}</span>
              </span>
              <button
                type="button"
                onClick={() => setConnectedRoom(null)}
                className="text-xs text-danger-ink hover:underline cursor-pointer"
              >
                {lang === 'ar' ? 'قطع الاتصال' : 'Disconnect'}
              </button>
            </div>

            {/* Current Page Display */}
            <div className="p-4 rounded-3xl bg-hover-subtle border border-line space-y-1">
              <div className="text-3xl font-black text-ink font-mono">
                {reader.currentPage} / {reader.numPages}
              </div>
              <div className="text-xs text-ink-muted truncate max-w-xs mx-auto">
                {reader.docTitle}
              </div>
            </div>

            {/* Large Tactile Flip Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleRemotePrev}
                disabled={reader.currentPage <= 1}
                className="py-6 rounded-2xl bg-hover border border-line hover:bg-hover-strong active:scale-95 text-ink font-bold text-sm flex flex-col items-center justify-center gap-2 cursor-pointer disabled:opacity-30 disabled:pointer-events-none transition-all"
              >
                <ArrowRight className="w-6 h-6 rtl:rotate-0 ltr:rotate-180 text-accent" />
                <span>{lang === 'ar' ? 'الصفحة السابقة' : 'Previous Page'}</span>
              </button>

              <button
                type="button"
                onClick={handleRemoteNext}
                disabled={reader.currentPage >= reader.numPages}
                className="py-6 rounded-2xl bg-accent text-on-accent hover:bg-accent-strong active:scale-95 font-bold text-sm flex flex-col items-center justify-center gap-2 cursor-pointer disabled:opacity-30 disabled:pointer-events-none shadow-lg transition-all"
              >
                <ArrowLeft className="w-6 h-6 rtl:rotate-0 ltr:rotate-180" />
                <span>{lang === 'ar' ? 'الصفحة التالية' : 'Next Page'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
