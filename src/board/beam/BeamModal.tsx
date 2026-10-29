import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Cast,
  Check,
  Copy,
  FileUp,
  FolderOpen,
  History,
  Radio,
  RefreshCw,
  Send,
  Smartphone,
  Tv,
  WifiOff,
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
  generateRoomCode,
  getRecentRooms,
  saveRecentRoom
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
  const [activeTab, setActiveTab] = useState<'send' | 'receive' | 'remote' | 'offline'>('send');
  const [targetRoomCode, setTargetRoomCode] = useState('');
  const [receiverRoomCode] = useState(() => generateRoomCode());
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [connectedRoom, setConnectedRoom] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [recentRooms, setRecentRooms] = useState<string[]>([]);
  const offlineFileInputRef = useRef<HTMLInputElement>(null);

  const handleOfflineFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void reader.openFile(file);
      onSetBoardOpen(true);
      onClose();
    }
  };

  // Camera QR scanner state
  const [isScanningCamera, setIsScanningCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scanAnimFrameRef = useRef<number | null>(null);

  // Load recent rooms
  useEffect(() => {
    if (isOpen) {
      setRecentRooms(getRecentRooms());
    }
  }, [isOpen]);

  // Check URL query params for auto-connect (e.g. from native phone camera QR scan)
  useEffect(() => {
    if (!isOpen) return;
    try {
      const hash = window.location.hash;
      const search = window.location.search;
      const match = hash.match(/room=([A-Za-z0-9_-]+)/) || search.match(/room=([A-Za-z0-9_-]+)/);
      if (match && match[1]) {
        const room = match[1].toUpperCase();
        setTargetRoomCode(room);
        setActiveTab('send');
      }
    } catch {}
  }, [isOpen]);

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

  // Join cloud room when Receiver Tab is active
  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'receive') {
      beamService.listenToRoom(receiverRoomCode);
    }
    return () => {
      beamService.leaveRoom();
    };
  }, [isOpen, activeTab, receiverRoomCode]);

  // Subscribe to beam messages (receiver mode & remote page syncing)
  useEffect(() => {
    const unsubscribe = beamService.subscribe(async (msg: BeamMessage) => {
      // Receiver Mode: Handle incoming payload
      if (activeTab === 'receive' && msg.type === 'BEAM_PAYLOAD' && msg.payload) {
        const cleanMsgRoom = msg.roomCode.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const cleanRecRoom = receiverRoomCode.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

        if (cleanMsgRoom === cleanRecRoom) {
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
            saveRecentRoom(receiverRoomCode);
            onSetBoardOpen(true);
            onClose();
          } catch (err) {
            console.error('Failed to load beamed PDF:', err);
          }
        }
      }

      // Page Flipping Sync
      if (msg.type === 'BEAM_PAGE_CHANGE' && msg.pageNumber) {
        if (connectedRoom) {
          const cleanMsgRoom = msg.roomCode.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
          const cleanConnRoom = connectedRoom.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
          if (cleanMsgRoom === cleanConnRoom) {
            reader.scrollToPage(msg.pageNumber);
          }
        }
      }
    });

    return () => unsubscribe();
  }, [activeTab, receiverRoomCode, connectedRoom, reader, onSetBoardOpen, onClose]);

  // Stop camera helper
  const stopCamera = useCallback(() => {
    if (scanAnimFrameRef.current) {
      cancelAnimationFrame(scanAnimFrameRef.current);
      scanAnimFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsScanningCamera(false);
  }, []);

  // Send current book to Smartboard
  const handleBeamDocument = useCallback(
    async (overrideCode?: string) => {
      const code = (overrideCode || targetRoomCode).trim().toUpperCase();
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

        await beamService.broadcast(payloadMsg);

        saveRecentRoom(code);
        setConnectedRoom(code);
        setSendSuccess(true);
        setIsSending(false);

        // Transition to remote presentation mode
        setTimeout(() => {
          setActiveTab('remote');
        }, 400);
      } catch (err) {
        console.error('Failed to beam document:', err);
        setIsSending(false);
        alert(lang === 'ar' ? 'تعذر إرسال المستند، تأكد من الرمز وحاول مجدداً' : 'Failed to beam document');
      }
    },
    [targetRoomCode, reader, lang]
  );

  // Camera QR Code Scanner Execution
  const startCameraScanner = async () => {
    setCameraError(null);
    setIsScanningCamera(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Check if native BarcodeDetector is available
      if ('BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        const scanLoop = async () => {
          if (!videoRef.current || !mediaStreamRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const raw = barcodes[0].rawValue || '';
              // Extract room code if it's a URL or direct code
              const match = raw.match(/room=([A-Za-z0-9_-]+)/) || raw.match(/(OTM-[A-Za-z0-9_-]+)/i) || raw.match(/([0-9]{4,6})/);
              const detected = match ? match[1].toUpperCase() : raw.toUpperCase();
              if (detected) {
                stopCamera();
                setTargetRoomCode(detected);
                void handleBeamDocument(detected);
                return;
              }
            }
          } catch {}
          scanAnimFrameRef.current = requestAnimationFrame(scanLoop);
        };
        scanAnimFrameRef.current = requestAnimationFrame(scanLoop);
      }
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setCameraError(lang === 'ar' ? 'تعذر تشغيل الكاميرا، يمكنك كتابة الكود يدوياً' : 'Camera inaccessible, enter code manually');
      setIsScanningCamera(false);
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Remote clicker controls
  const handleRemoteNext = () => {
    const nextPage = Math.min(reader.numPages, reader.currentPage + 1);
    reader.goToNextPage();
    if (connectedRoom) {
      void beamService.broadcast({
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
      void beamService.broadcast({
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

  const smartboardUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}#/beam?room=${receiverRoomCode}`
    : `https://otium.app/#/beam?room=${receiverRoomCode}`;

  if (!isOpen) return null;

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
                {lang === 'ar' ? 'ربط فوري وتلقائي بدون سيرفر محلي' : 'Zero-Config Cloud & Local Relay'}
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
            onClick={() => {
              stopCamera();
              setActiveTab('send');
            }}
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
            onClick={() => {
              stopCamera();
              setActiveTab('receive');
            }}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'receive'
                ? 'bg-accent text-on-accent shadow-sm'
                : 'text-ink-muted hover:text-ink hover:bg-hover'
            }`}
          >
            <Tv className="w-4 h-4" />
            <span>{lang === 'ar' ? 'استقبال كسبورة 📺' : 'Receiver Screen 📺'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab('offline');
            }}
            className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'offline'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-ink-muted hover:text-ink hover:bg-hover'
            }`}
          >
            <WifiOff className="w-4 h-4" />
            <span>{lang === 'ar' ? 'بدون إنترنت 📴' : 'Offline 📴'}</span>
          </button>

          {connectedRoom && (
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setActiveTab('remote');
              }}
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
          <div className="p-6 space-y-4">
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

            {/* Camera Viewfinder (if scanning QR) */}
            {isScanningCamera ? (
              <div className="relative w-full h-56 rounded-2xl bg-black overflow-hidden border-2 border-accent flex flex-col items-center justify-center">
                <video ref={videoRef} className="w-full h-full object-cover" />
                <div className="absolute inset-0 border-2 border-dashed border-accent/60 m-8 rounded-xl pointer-events-none animate-pulse" />
                <div className="absolute bottom-2 px-3 py-1 bg-black/70 backdrop-blur-sm rounded-full text-[11px] text-white">
                  {lang === 'ar' ? 'وجه الكاميرا نحو QR السبورة' : 'Point camera at Smartboard QR'}
                </div>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startCameraScanner}
                className="w-full py-3 px-4 rounded-2xl bg-accent/15 border border-accent/30 text-accent font-bold text-xs flex items-center justify-center gap-2 hover:bg-accent/25 active:scale-98 transition-all cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>{lang === 'ar' ? '📷 مسح رمز السبورة بالكاميرا فوراً' : '📷 Scan Smartboard QR with Camera'}</span>
              </button>
            )}

            {cameraError && (
              <div className="text-[11px] text-amber-500 text-center">{cameraError}</div>
            )}

            {/* Recent Favorite Rooms / Quick Reconnect */}
            {recentRooms.length > 0 && !isScanningCamera && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                  <History className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'قاعاتي السابقة (ربط بنقرة واحدة):' : 'Recent Classrooms:'}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {recentRooms.map((room) => (
                    <button
                      key={room}
                      type="button"
                      onClick={() => {
                        setTargetRoomCode(room);
                        void handleBeamDocument(room);
                      }}
                      className="px-3 py-1 rounded-xl bg-hover border border-line text-xs font-mono font-semibold text-accent hover:bg-accent/15 hover:border-accent/40 active:scale-95 transition-all cursor-pointer"
                    >
                      ⚡ {room}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Manual Code Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ink">
                {lang === 'ar' ? 'أو أدخل رمز الغرفة الظاهر على السبورة:' : 'Or enter Room Code:'}
              </label>
              <input
                type="text"
                value={targetRoomCode}
                onChange={(e) => setTargetRoomCode(e.target.value.toUpperCase())}
                placeholder="OTM-XXXX"
                className="w-full px-4 py-3 rounded-2xl bg-hover border border-line font-mono text-base font-bold text-center tracking-widest text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <button
              type="button"
              onClick={() => void handleBeamDocument()}
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
                  ? 'امسح الرمز بكاميرا هاتفك أو أدخل الكود لفتح المحاضرة'
                  : 'Scan QR with phone camera or enter code to launch lecture'}
              </h4>
            </div>

            {/* Authentic Standards-Compliant QR Code */}
            <div className="my-1">
              <QrCodeView value={smartboardUrl} size={180} />
            </div>

            {/* Room Code with Copy */}
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-hover border border-line">
              <span className="font-mono text-2xl font-extrabold tracking-widest text-ink">
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
              <span>{lang === 'ar' ? 'بانتظار إرسال الكتاب من هاتفك…' : 'Waiting for incoming lecture…'}</span>
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

        {/* Hidden File Input for Offline / USB Flash Opening */}
        <input
          ref={offlineFileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleOfflineFile}
        />

        {/* Tab 4: 100% Offline Mode (No Internet in Classroom) */}
        {activeTab === 'offline' && (
          <div className="p-6 space-y-4 text-start">
            <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
              <WifiOff className="w-5 h-5 shrink-0" />
              <div className="text-xs">
                <span className="font-bold block">
                  {lang === 'ar' ? 'وضع العمل بدون إنترنت' : 'Offline Classroom Mode'}
                </span>
                <span className="text-[11px] opacity-90">
                  {lang === 'ar'
                    ? 'يعمل التطبيق والسبورة بكفاءة 100% حتى في حال انقطاع الشبكة بالكامل.'
                    : 'Otium & Smartboard work 100% offline with zero internet.'}
                </span>
              </div>
            </div>

            {/* Option A: Open from Flash Drive / Smartboard Storage */}
            <div className="p-4 rounded-2xl bg-hover-subtle border border-line space-y-2.5">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-accent" />
                <h5 className="text-xs font-bold text-ink">
                  {lang === 'ar' ? '1. فتح الكتاب من فلاش USB أو ذاكرة السبورة' : '1. Open from USB Flash or Storage'}
                </h5>
              </div>
              <p className="text-[11px] text-ink-muted leading-relaxed">
                {lang === 'ar'
                  ? 'صل فلاشة الـ USB بالسبورة وافتح الملزمة مباشرة؛ سيتم تفعيل وضع السبورة المنقسمة 50/50 والأقلام فوراً.'
                  : 'Plug USB drive into smartboard to launch PDF side-by-side with whiteboard canvas.'}
              </p>
              <button
                type="button"
                onClick={() => offlineFileInputRef.current?.click()}
                className="w-full py-2.5 px-4 rounded-xl bg-accent text-on-accent text-xs font-bold flex items-center justify-center gap-2 hover:bg-accent-strong active:scale-98 transition-all cursor-pointer shadow-sm"
              >
                <FileUp className="w-4 h-4" />
                <span>{lang === 'ar' ? 'اختيار ملف PDF من الجهاز / الفلاشة 📂' : 'Select PDF from Device / USB 📂'}</span>
              </button>
            </div>

            {/* Option B: Mobile Hotspot (Personal LAN with zero internet) */}
            <div className="p-4 rounded-2xl bg-hover-subtle border border-line space-y-2">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-500" />
                <h5 className="text-xs font-bold text-ink">
                  {lang === 'ar' ? '2. نقطة اتصال الهاتف (Mobile Hotspot)' : '2. Mobile Hotspot (Local Wi-Fi)'}
                </h5>
              </div>
              <p className="text-[11px] text-ink-muted leading-relaxed">
                {lang === 'ar'
                  ? 'فعّل "نقطة الاتصال / Hotspot" بهاتفك واشبك السبورة عليها (بدون نت أو باقة بيانات نهائياً). ينشئ الهاتف شبكة واي فاي محلية فائقة السرعة، ويمكنك استخدام كود الغرفة لبث الملف محلياً!'
                  : 'Turn on phone hotspot and connect smartboard. Works with zero data balance over local Wi-Fi.'}
              </p>
            </div>

            {/* Option C: Offline Cache Confirmation */}
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>
                {lang === 'ar'
                  ? 'الموقع مثبت في ذاكرة المتصفح (PWA Cache)؛ سيفتح دائماً حتى لو انقطع الإنترنت.'
                  : 'Cached locally in browser; Otium opens anytime without internet.'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
