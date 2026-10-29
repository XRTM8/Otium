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

  const handleOfflineFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void reader.openFile(file);
      onSetBoardOpen(true);
      onClose();
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Tactile Haptic Feedback Pulse
  const triggerHaptic = useCallback(() => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(18);
      } catch {}
    }
  }, []);

  // Remote clicker controls
  const handleRemoteNext = useCallback(() => {
    if (reader.currentPage >= reader.numPages) return;
    triggerHaptic();
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
  }, [reader, connectedRoom, triggerHaptic]);

  const handleRemotePrev = useCallback(() => {
    if (reader.currentPage <= 1) return;
    triggerHaptic();
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
  }, [reader, connectedRoom, triggerHaptic]);

  // Keyboard navigation when remote tab is active
  useEffect(() => {
    if (!isOpen || activeTab !== 'remote') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        handleRemoteNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        handleRemotePrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeTab, handleRemoteNext, handleRemotePrev]);

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(receiverRoomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const smartboardUrl = `https://is.gd/otium#/beam?room=${receiverRoomCode}`;

  if (!isOpen) return null;

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md p-0 sm:p-4 select-none animate-in fade-in duration-200 theme-${reader.theme}`}
    >
      <div className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-surface border-t sm:border border-line shadow-2xl flex flex-col text-ink animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
        {/* Mobile Tactile Drag Indicator */}
        <div className="sm:hidden w-10 h-1 rounded-full bg-line mx-auto mt-2.5 mb-0.5 opacity-60" />

        {/* Minimalist Header */}
        <div className="flex items-center justify-between px-5 pt-3.5 pb-3 border-b border-line bg-hover-subtle/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
              <Cast className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink leading-none">
                {lang === 'ar' ? 'البث الذكي للسبورة' : 'Smart Beam'}
              </h3>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] font-mono text-accent bg-accent/10 px-1.5 py-0.2 rounded-md font-bold">
                  is.gd/otium
                </span>
                <span className="text-[10px] text-ink-muted">
                  {lang === 'ar' ? 'ربط فوري' : 'Zero-config'}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-hover text-ink-muted hover:text-ink transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segmented Mode Selector Pills */}
        <div className="flex items-center p-1.5 mx-4 mt-3 bg-hover-subtle/70 rounded-2xl border border-line/60 gap-1 select-none">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab('send');
            }}
            className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'send'
                ? 'bg-surface text-ink font-bold shadow-xs border border-line/60'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'بث للسبورة' : 'Beam'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab('receive');
            }}
            className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'receive'
                ? 'bg-surface text-ink font-bold shadow-xs border border-line/60'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'استقبال' : 'Receiver'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveTab('offline');
            }}
            className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'offline'
                ? 'bg-surface text-ink font-bold shadow-xs border border-line/60'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <WifiOff className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'بدون إنترنت' : 'Offline'}</span>
          </button>

          {connectedRoom && (
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setActiveTab('remote');
              }}
              className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'remote'
                  ? 'bg-accent text-on-accent font-bold shadow-sm'
                  : 'text-accent hover:bg-hover'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'الريموت' : 'Remote'}</span>
            </button>
          )}
        </div>

        {/* Tab 1: Send Mode (From Phone / Laptop) */}
        {activeTab === 'send' && (
          <div className="p-5 space-y-3.5">
            {/* Active Book Pill */}
            {reader.doc ? (
              <div className="px-3.5 py-2.5 rounded-2xl bg-hover-subtle border border-line flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] text-accent font-semibold uppercase tracking-wider">
                    {lang === 'ar' ? 'الملف الجاهز للبث' : 'Ready Document'}
                  </div>
                  <div className="text-xs font-bold truncate text-ink">
                    {reader.docTitle}
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-accent/15 text-accent shrink-0">
                  {lang === 'ar' ? `ص ${reader.currentPage}` : `p. ${reader.currentPage}`}
                </span>
              </div>
            ) : (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500 text-center font-medium">
                {lang === 'ar' ? 'يرجى فتح ملف أولاً لبثه إلى السبورة' : 'Open a file first to beam'}
              </div>
            )}

            {/* Concise 2-Step Minimal Instructions */}
            <div className="grid grid-cols-2 gap-2 text-start p-2.5 rounded-2xl bg-hover-subtle/80 border border-line-subtle text-[11px]">
              <div className="flex items-start gap-1.5">
                <span className="w-4 h-4 rounded-full bg-accent/20 text-accent font-mono font-bold flex items-center justify-center shrink-0 text-[10px]">
                  ١
                </span>
                <span className="text-ink-muted leading-tight">
                  {lang === 'ar' ? 'على السبورة: افتح الرابط ' : 'On Board: Open '}
                  <strong className="text-accent font-mono font-bold">is.gd/otium</strong>
                </span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="w-4 h-4 rounded-full bg-accent/20 text-accent font-mono font-bold flex items-center justify-center shrink-0 text-[10px]">
                  ٢
                </span>
                <span className="text-ink-muted leading-tight">
                  {lang === 'ar' ? 'امسح الـ QR أو اكتب الكود' : 'Scan QR or enter Code'}
                </span>
              </div>
            </div>

            {/* Camera Viewfinder (if scanning QR) */}
            {isScanningCamera ? (
              <div className="relative w-full h-48 rounded-2xl bg-black overflow-hidden border-2 border-accent flex flex-col items-center justify-center shadow-inner">
                <video ref={videoRef} className="w-full h-full object-cover" />
                <div className="absolute inset-0 border-2 border-dashed border-accent/70 m-6 rounded-xl pointer-events-none animate-pulse" />
                <div className="absolute bottom-2 px-3 py-1 bg-black/75 backdrop-blur-sm rounded-full text-[10px] text-white">
                  {lang === 'ar' ? 'وجّه الكاميرا نحو QR السبورة' : 'Point camera at Smartboard QR'}
                </div>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startCameraScanner}
                className="w-full py-2.5 px-4 rounded-2xl bg-accent/15 border border-accent/30 text-accent font-bold text-xs flex items-center justify-center gap-2 hover:bg-accent/25 active:scale-98 transition-all cursor-pointer shadow-xs"
              >
                <Camera className="w-4 h-4" />
                <span>{lang === 'ar' ? 'مسح رمز السبورة بالكاميرا فوراً' : 'Scan Smartboard QR with Camera'}</span>
              </button>
            )}

            {cameraError && (
              <div className="text-[10px] text-amber-500 text-center font-medium">{cameraError}</div>
            )}

            {/* Recent Favorite Rooms / Quick Reconnect */}
            {recentRooms.length > 0 && !isScanningCamera && (
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-[10px] text-ink-muted">
                  <History className="w-3 h-3" />
                  <span>{lang === 'ar' ? 'القاعات السابقة:' : 'Recent Rooms:'}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {recentRooms.map((room) => (
                    <button
                      key={room}
                      type="button"
                      onClick={() => {
                        setTargetRoomCode(room);
                        void handleBeamDocument(room);
                      }}
                      className="px-2.5 py-1 rounded-xl bg-hover border border-line text-[11px] font-mono font-semibold text-accent hover:bg-accent/15 hover:border-accent/40 active:scale-95 transition-all cursor-pointer"
                    >
                      {room}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Manual Code Input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={targetRoomCode}
                onChange={(e) => setTargetRoomCode(e.target.value.toUpperCase())}
                placeholder="OTM-XXXX"
                className="flex-1 px-3 py-2.5 rounded-2xl bg-hover border border-line font-mono text-sm font-bold text-center tracking-widest text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="button"
                onClick={() => void handleBeamDocument()}
                disabled={isSending || !targetRoomCode.trim() || !reader.doc}
                className="px-5 py-2.5 rounded-2xl bg-accent text-on-accent font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm hover:bg-accent-strong active:scale-98 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
              >
                {isSending ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : sendSuccess ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>{lang === 'ar' ? 'بث' : 'Beam'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Receiver Screen Mode (Smartboard Display) */}
        {activeTab === 'receive' && (
          <div className="p-5 flex flex-col items-center justify-center space-y-3.5 text-center">
            {/* Minimal Prompt */}
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-ink">
                {lang === 'ar' ? 'وجّه كاميرا الهاتف نحو الرمز لبث المحاضرة' : 'Point phone camera at QR to beam'}
              </h4>
              <p className="text-[11px] text-ink-muted">
                {lang === 'ar' ? 'أو افتح Otium بهاتفك واضغط بث' : 'Or open Otium on phone and tap Beam'}
              </p>
            </div>

            {/* QR Code */}
            <div className="my-0.5 shadow-sm rounded-2xl p-1 bg-white border border-line">
              <QrCodeView value={smartboardUrl} size={160} />
            </div>

            {/* Code Badge */}
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-hover border border-line">
              <span className="font-mono text-xl font-black tracking-[0.2em] text-accent">
                {receiverRoomCode}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="p-1 rounded-lg hover:bg-surface text-ink-muted hover:text-ink transition-colors cursor-pointer"
                title={lang === 'ar' ? 'نسخ الرمز' : 'Copy Code'}
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Quick URL reminder */}
            <div className="text-[10px] text-ink-muted flex items-center gap-1 font-mono">
              <span>{lang === 'ar' ? 'رابط السبورة السريع:' : 'Quick link:'}</span>
              <strong className="text-accent underline">is.gd/otium</strong>
            </div>

            {/* Pulsing Status */}
            <div className="flex items-center gap-1.5 text-[10px] text-ink-muted pt-1 border-t border-line w-full justify-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>{lang === 'ar' ? 'بانتظار الإرسال من هاتفك…' : 'Waiting for incoming beam…'}</span>
            </div>
          </div>
        )}

        {/* Tab 3: Offline Mode (No Internet in Classroom) */}
        {activeTab === 'offline' && (
          <div className="p-5 space-y-3 text-start">
            {/* Banner */}
            <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
              <WifiOff className="w-4 h-4 shrink-0" />
              <span className="font-semibold">
                {lang === 'ar' ? 'يعمل التطبيق والسبورة 100% بدون إنترنت' : 'Otium works 100% offline'}
              </span>
            </div>

            {/* Option 1: Open USB Flash */}
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

            {/* Option 2: Mobile Hotspot */}
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

            {/* Offline Cache Notice */}
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>
                {lang === 'ar'
                  ? 'الموقع مثبت في ذاكرة المتصفح (PWA Cache) ويفتح دائماً أوفلاين.'
                  : 'Cached locally in browser; opens anytime offline.'}
              </span>
            </div>
          </div>
        )}

        {/* Tab 4: Presentation Remote Clicker (Tactile Blind Clicker without Timer) */}
        {activeTab === 'remote' && (
          <div className="p-5 space-y-4 text-center">
            {/* Connection Banner */}
            <div className="flex items-center justify-between text-xs text-ink-muted px-1">
              <span className="flex items-center gap-1.5 text-emerald-500 font-semibold text-[11px]">
                <Radio className="w-3 h-3 animate-pulse" />
                <span>{lang === 'ar' ? 'متصل بالسبورة:' : 'Connected:'} <strong className="font-mono text-ink">{connectedRoom}</strong></span>
              </span>
              <button
                type="button"
                onClick={() => setConnectedRoom(null)}
                className="text-[11px] text-danger-ink hover:underline cursor-pointer"
              >
                {lang === 'ar' ? 'قطع الاتصال' : 'Disconnect'}
              </button>
            </div>

            {/* Slide Progress Bar */}
            <div className="w-full bg-hover rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-accent h-full transition-all duration-300 rounded-full"
                style={{
                  width: `${reader.numPages > 0 ? (reader.currentPage / reader.numPages) * 100 : 0}%`
                }}
              />
            </div>

            {/* Page Count Display */}
            <div className="py-3 px-4 rounded-2xl bg-hover-subtle border border-line space-y-0.5">
              <div className="text-3xl font-black text-ink font-mono tracking-tight">
                {reader.currentPage} <span className="text-sm font-normal text-ink-muted">/ {reader.numPages}</span>
              </div>
              <div className="text-[11px] text-ink-muted truncate max-w-xs mx-auto">
                {reader.docTitle || (lang === 'ar' ? 'كتاب المحاضرة' : 'Lecture Document')}
              </div>
            </div>

            {/* Tactile Blind-Flipping Buttons with Haptic Pulse */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleRemotePrev}
                disabled={reader.currentPage <= 1}
                className="py-7 px-4 rounded-2xl bg-hover border border-line hover:bg-hover-strong active:scale-95 text-ink font-bold text-sm flex flex-col items-center justify-center gap-2 cursor-pointer disabled:opacity-25 disabled:pointer-events-none transition-all shadow-xs touch-manipulation"
              >
                <ArrowRight className="w-6 h-6 rtl:rotate-0 ltr:rotate-180 text-ink-muted" />
                <span>{lang === 'ar' ? 'السابقة' : 'Previous'}</span>
              </button>

              <button
                type="button"
                onClick={handleRemoteNext}
                disabled={reader.currentPage >= reader.numPages}
                className="py-7 px-4 rounded-2xl bg-accent text-on-accent hover:bg-accent-strong active:scale-95 font-bold text-sm flex flex-col items-center justify-center gap-2 cursor-pointer disabled:opacity-25 disabled:pointer-events-none shadow-md transition-all touch-manipulation"
              >
                <ArrowLeft className="w-6 h-6 rtl:rotate-0 ltr:rotate-180" />
                <span>{lang === 'ar' ? 'التالية' : 'Next'}</span>
              </button>
            </div>

            {/* Tactile & Keyboard Guide */}
            <div className="pt-1 text-[10px] text-ink-muted/80 flex items-center justify-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500/80" />
              <span>{lang === 'ar' ? 'اهتزاز فيزيائي عند التقليب' : 'Haptic pulse enabled'}</span>
              <span>•</span>
              <span>{lang === 'ar' ? 'مفاتيح الأسهم مدعومة' : 'Arrow keys supported'}</span>
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
      </div>
    </div>
  );
};
