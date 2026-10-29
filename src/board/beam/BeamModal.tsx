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
  beamService,
  formatRoomCode,
  generateRoomCode,
  getRecentRooms,
  saveRecentRoom,
  type BeamConnectionStatus
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
  const [activeTab, setActiveTab] = useState<'send' | 'receive' | 'remote' | 'offline'>(() => {
    const role = beamService.getRole();
    if (role === 'receiver') return 'receive';
    if (role === 'sender') return 'remote';
    return 'send';
  });
  const [targetRoomCode, setTargetRoomCode] = useState('');
  const [receiverRoomCode] = useState(() => {
    const existing = beamService.getConnectedRoom();
    if (existing && beamService.getRole() === 'receiver') {
      return existing;
    }
    return generateRoomCode();
  });
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [connectedRoom, setConnectedRoom] = useState<string | null>(() => beamService.getConnectedRoom());
  const [copiedCode, setCopiedCode] = useState(false);
  const [recentRooms, setRecentRooms] = useState<string[]>([]);
  const [beamError, setBeamError] = useState<string | null>(null);
  const [remoteDocTitle, setRemoteDocTitle] = useState<string>(() => reader.docTitle || '');
  const [remotePage, setRemotePage] = useState<number>(() => reader.currentPage || 1);
  const [remoteTotal, setRemoteTotal] = useState<number>(() => reader.numPages || 0);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [connStatus, setConnStatus] = useState<BeamConnectionStatus>(() => beamService.getConnectionStatus());
  const offlineFileInputRef = useRef<HTMLInputElement>(null);
  const beamFileInputRef = useRef<HTMLInputElement>(null);

  // Sync beam connection state
  useEffect(() => {
    const unsubState = beamService.onStateChange((state) => {
      setConnectedRoom(state.room);
    });
    const unsubStatus = beamService.onConnectionStatusChange((status) => {
      setConnStatus(status);
    });
    return () => {
      unsubState();
      unsubStatus();
    };
  }, []);

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
        e.preventDefault();
        e.stopPropagation();
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
      beamService.startReceiver(receiverRoomCode);
    }
  }, [isOpen, activeTab, receiverRoomCode]);

  // Query remote receiver state when remote tab becomes active
  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'remote' && connectedRoom) {
      beamService.queryReceiverState(connectedRoom);
    }
  }, [isOpen, activeTab, connectedRoom]);

  // Subscribe to beam messages (receiver mode, payload receipt & remote state updates)
  useEffect(() => {
    const unsubscribe = beamService.subscribe(async (msg: BeamMessage) => {
      // 1. When incoming payload matches our receiver room, activate split board and close modal
      if (
        msg.type === 'BEAM_PAYLOAD' &&
        msg.payload &&
        beamService.isMatchingRoom(msg.roomCode, receiverRoomCode)
      ) {
        saveRecentRoom(receiverRoomCode);
        onSetBoardOpen(true);
        onClose();
      }

      // 2. When receiver announces its state, sync remote clicker view
      if (msg.type === 'BEAM_STATE_ANNOUNCE') {
        if (msg.docTitle) setRemoteDocTitle(msg.docTitle);
        if (typeof msg.pageNumber === 'number') setRemotePage(msg.pageNumber);
        if (typeof msg.totalPages === 'number') setRemoteTotal(msg.totalPages);
      }
    });

    return () => unsubscribe();
  }, [receiverRoomCode, onSetBoardOpen, onClose]);

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

  // Send current book or custom file to Smartboard
  const handleBeamDocument = useCallback(
    async (overrideCode?: string, overrideBuffer?: ArrayBuffer, overrideTitle?: string) => {
      const raw = (overrideCode || targetRoomCode).trim();
      const code = formatRoomCode(raw);
      if (!code) return;

      setBeamError(null);

      let buffer = overrideBuffer;
      const title = overrideTitle || reader.docTitle || (lang === 'ar' ? 'المحاضرة' : 'Lecture Document');
      const pageNumber = reader.currentPage || 1;
      const totalPages = reader.numPages || 1;

      if (!buffer) {
        if (!reader.doc || !reader.docId) {
          beamFileInputRef.current?.click();
          return;
        }
        try {
          const docBuf = await getDocumentFromStorage(reader.docId);
          if (!docBuf) throw new Error('Document buffer not found in storage');
          buffer = docBuf;
        } catch {
          setBeamError(lang === 'ar' ? 'تعذر قراءة ملف المستند' : 'Failed to read document');
          return;
        }
      }

      setIsSending(true);
      setSendSuccess(false);
      setUploadProgress(15);

      try {
        const totalBytes = buffer.byteLength;
        const SINGLE_LIMIT = 2 * 1024 * 1024; // 2MB

        if (totalBytes <= SINGLE_LIMIT) {
          setUploadProgress(40);
          const pdfUrl = await beamService.uploadAttachment(code, buffer, `${title}.pdf`);
          setUploadProgress(85);

          const pdfBase64 = !pdfUrl && totalBytes < 500000 ? arrayBufferToBase64(buffer) : undefined;
          if (!pdfUrl && !pdfBase64) {
            throw new Error(
              lang === 'ar'
                ? 'تعذر رفع المستند إلى السحابة، تأكد من اتصال الإنترنت أو استخدم وضع "بدون إنترنت"'
                : 'Failed to upload document to cloud relay. Check your connection or use Offline mode.'
            );
          }

          const payloadMsg: BeamMessage = {
            type: 'BEAM_PAYLOAD',
            roomCode: code,
            senderName: navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop',
            payload: {
              title,
              pageNumber,
              totalPages,
              theme: reader.theme,
              pdfUrl: pdfUrl || undefined,
              pdfBase64
            },
            timestamp: Date.now()
          };

          await beamService.broadcast(payloadMsg);
        } else {
          // Chunked upload for larger files (e.g. 5MB, 10MB+)
          const chunkUrls = await beamService.uploadChunked(code, buffer, `${title}.pdf`, (p) => {
            setUploadProgress(Math.min(95, Math.max(15, p)));
          });

          if (!chunkUrls || chunkUrls.length === 0) {
            throw new Error(
              lang === 'ar'
                ? 'تعذر إرسال أجزاء الملف الكبير، يرجى استخدام وضع بدون إنترنت عبر فلاشة USB أو الهوتسبوت'
                : 'Chunked upload failed. Please use Offline mode via USB or Wi-Fi hotspot.'
            );
          }

          const payloadMsg: BeamMessage = {
            type: 'BEAM_PAYLOAD',
            roomCode: code,
            senderName: navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop',
            payload: {
              title,
              pageNumber,
              totalPages,
              theme: reader.theme,
              chunks: chunkUrls,
              totalSize: totalBytes
            },
            timestamp: Date.now()
          };

          await beamService.broadcast(payloadMsg);
        }

        beamService.startSender(code);
        beamService.broadcastPageChange(pageNumber);

        setConnectedRoom(code);
        setSendSuccess(true);
        setIsSending(false);
        setUploadProgress(null);

        // Transition to remote presentation mode
        setTimeout(() => {
          setActiveTab('remote');
        }, 300);
      } catch (err: any) {
        console.error('Failed to beam document:', err);
        setIsSending(false);
        setUploadProgress(null);
        setBeamError(
          err?.message ||
          (lang === 'ar' ? 'تعذر إرسال المستند، تأكد من الرمز وحاول مجدداً' : 'Failed to beam document')
        );
      }
    },
    [targetRoomCode, reader, lang]
  );

  // Quick remote pairing (Automatically beams document if one is loaded!)
  const handlePairAsRemote = useCallback(
    (overrideCode?: string) => {
      const raw = (overrideCode || targetRoomCode).trim();
      const code = formatRoomCode(raw);
      if (!code) return;

      setBeamError(null);

      // If document is open on this device, automatically beam it so board actually displays it!
      if (reader.doc) {
        void handleBeamDocument(code);
        return;
      }

      beamService.startSender(code);
      beamService.queryReceiverState(code);
      setConnectedRoom(code);
      setSendSuccess(true);
      setTimeout(() => {
        setActiveTab('remote');
      }, 200);
    },
    [targetRoomCode, reader.doc, handleBeamDocument]
  );

  // File picker handler to beam a file directly without opening it first
  const handleBeamFileDirect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const code = targetRoomCode.trim() || connectedRoom || '';
      if (!code) {
        setBeamError(lang === 'ar' ? 'يرجى إدخال رمز السبورة أولاً' : 'Please enter room code first');
        return;
      }
      void handleBeamDocument(code, buf, file.name.replace(/\.pdf$/i, ''));
    } catch {
      setBeamError(lang === 'ar' ? 'تعذر قراءة الملف المحدد' : 'Failed to read selected file');
    }
  };

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
                if (reader.doc) {
                  void handleBeamDocument(detected);
                } else {
                  handlePairAsRemote(detected);
                }
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

  const activeDocTitle =
    reader.docTitle || remoteDocTitle || (lang === 'ar' ? 'المستند المتصل بالسبورة' : 'Connected Document');
  const activePage = reader.doc ? reader.currentPage : remotePage;
  const activeTotal = reader.doc ? reader.numPages : remoteTotal;

  // Remote clicker controls (works seamlessly with or without local document loaded!)
  const handleRemoteNext = useCallback(() => {
    if (activeTotal > 0 && activePage >= activeTotal) return;
    triggerHaptic();
    const nextPage = activePage + 1;
    if (reader.doc) {
      reader.goToNextPage();
    } else {
      setRemotePage(nextPage);
    }
    if (connectedRoom) {
      beamService.sendStep('next');
      void beamService.broadcast({
        type: 'BEAM_PAGE_CHANGE',
        roomCode: connectedRoom,
        pageNumber: nextPage,
        timestamp: Date.now()
      });
    }
  }, [activeTotal, activePage, reader, connectedRoom, triggerHaptic]);

  const handleRemotePrev = useCallback(() => {
    if (activeTotal > 0 && activePage <= 1) return;
    triggerHaptic();
    const prevPage = Math.max(1, activePage - 1);
    if (reader.doc) {
      reader.goToPrevPage();
    } else {
      setRemotePage(prevPage);
    }
    if (connectedRoom) {
      beamService.sendStep('prev');
      void beamService.broadcast({
        type: 'BEAM_PAGE_CHANGE',
        roomCode: connectedRoom,
        pageNumber: prevPage,
        timestamp: Date.now()
      });
    }
  }, [activeTotal, activePage, reader, connectedRoom, triggerHaptic]);

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
            {/* Active Book Pill or Standalone Remote Mode */}
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
              <div className="px-3.5 py-2.5 rounded-2xl bg-hover-subtle border border-line flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] text-accent font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <Radio className="w-3 h-3 text-accent animate-pulse" />
                    <span>{lang === 'ar' ? 'وضع ريموت التحكم الذكي' : 'Smart Remote Controller Mode'}</span>
                  </div>
                  <div className="text-xs font-bold truncate text-ink">
                    {lang === 'ar' ? 'التحكم بالسبورة أو الحاسبة من هاتفك' : 'Control Smartboard / PC from your phone'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => beamFileInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-xl bg-accent/15 hover:bg-accent/25 border border-accent/30 text-accent font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer shrink-0"
                >
                  <FileUp className="w-3 h-3" />
                  <span>{lang === 'ar' ? 'اختيار ملف وبثه' : 'Pick & Beam File'}</span>
                </button>
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

            {beamError && (
              <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-danger-ink text-xs font-sans text-center">
                {beamError}
              </div>
            )}

            {/* Manual Code Input & Quick Actions */}
            <div className="space-y-2">
              <input
                type="text"
                value={targetRoomCode}
                onChange={(e) => setTargetRoomCode(e.target.value.toUpperCase())}
                placeholder="OTM-XXXX"
                className="w-full px-3 py-2.5 rounded-2xl bg-hover border border-line font-mono text-sm font-bold text-center tracking-widest text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <div className={reader.doc ? "flex flex-col gap-2" : "grid grid-cols-2 gap-2"}>
                <button
                  type="button"
                  onClick={() => {
                    if (reader.doc) {
                      void handleBeamDocument();
                    } else {
                      beamFileInputRef.current?.click();
                    }
                  }}
                  disabled={isSending || (!targetRoomCode.trim() && !reader.doc)}
                  className={`py-3 px-3 rounded-2xl bg-accent text-on-accent font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm hover:bg-accent-strong active:scale-98 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer ${reader.doc ? 'w-full' : ''}`}
                >
                  {isSending ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : sendSuccess ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {uploadProgress !== null
                      ? `${uploadProgress}%`
                      : reader.doc
                      ? lang === 'ar' ? 'بث ومزامنة للسبورة فوراً' : 'Beam & Sync to Smartboard'
                      : lang === 'ar' ? 'اختيار ملف وبثه' : 'Pick File & Beam'}
                  </span>
                </button>

                {!reader.doc && (
                  <button
                    type="button"
                    onClick={() => handlePairAsRemote()}
                    disabled={!targetRoomCode.trim()}
                    className="py-2.5 px-3 rounded-2xl bg-hover border border-accent/40 text-accent font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-accent/15 active:scale-98 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'اقتران ريموت تحكم' : 'Pair as Remote'}</span>
                  </button>
                )}
              </div>
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

            {/* Connection Status Indicator */}
            <div className="flex items-center gap-1.5 text-[10px] text-ink-muted pt-1 border-t border-line w-full justify-center">
              {connStatus === 'connected' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    {lang === 'ar' ? 'وضع الاستقبال نشط ومستعد لاستقبال هاتفك…' : 'Receiver active and ready…'}
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
                    {lang === 'ar' ? 'تعذر الاتصال بالسحابة (تحقق من إنترنت القاعة أو استخدم وضع بدون إنترنت)' : 'Cloud connection failed (check network or use offline mode)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => beamService.startReceiver(receiverRoomCode)}
                    className="text-accent underline text-[10px] cursor-pointer"
                  >
                    {lang === 'ar' ? 'إعادة محاولة الاتصال' : 'Retry connection'}
                  </button>
                </div>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-line-strong shrink-0" />
                  <span>{lang === 'ar' ? 'غير متصل' : 'Disconnected'}</span>
                </>
              )}
            </div>

            {/* Stop Receiver Button */}
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
                <span>{lang === 'ar' ? 'متصل بالسبورة / الحاسبة:' : 'Connected:'} <strong className="font-mono text-ink">{connectedRoom}</strong></span>
              </span>
              <button
                type="button"
                onClick={() => {
                  beamService.disconnect();
                  setConnectedRoom(null);
                  setActiveTab('send');
                }}
                className="text-[11px] text-danger-ink hover:underline cursor-pointer"
              >
                {lang === 'ar' ? 'قطع الاتصال' : 'Disconnect'}
              </button>
            </div>

            {/* Seamless Reader Background Notice */}
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

            {/* Slide Progress Bar */}
            <div className="w-full bg-hover rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-accent h-full transition-all duration-300 rounded-full"
                style={{
                  width: `${activeTotal > 0 ? (activePage / activeTotal) * 100 : 50}%`
                }}
              />
            </div>

            {/* Page Count Display */}
            <div className="py-3 px-4 rounded-2xl bg-hover-subtle border border-line space-y-0.5">
              <div className="text-3xl font-black text-ink font-mono tracking-tight">
                {activePage} <span className="text-sm font-normal text-ink-muted">/ {activeTotal > 0 ? activeTotal : '-'}</span>
              </div>
              <div className="text-[11px] text-ink-muted truncate max-w-xs mx-auto">
                {activeDocTitle}
              </div>
            </div>

            {/* Quick Action to Re-Beam / Push current Document */}
            {reader.doc && connectedRoom && (
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
                    ? (uploadProgress ? `${uploadProgress}%` : (lang === 'ar' ? 'جارٍ الإرسال...' : 'Sending...'))
                    : (lang === 'ar' ? 'إعادة بث هذه الملزمة للسبورة فوراً 📡' : 'Re-beam this PDF to Smartboard 📡')}
                </span>
              </button>
            )}

            {/* Tactile Blind-Flipping Buttons with Haptic Pulse */}
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

            {/* Tactile & Keyboard Guide */}
            <div className="pt-1 text-[10px] text-ink-muted/80 flex items-center justify-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500/80" />
              <span>{lang === 'ar' ? 'اهتزاز فيزيائي عند التقليب' : 'Haptic pulse enabled'}</span>
              <span>•</span>
              <span>{lang === 'ar' ? 'مفاتيح الأسهم مدعومة' : 'Arrow keys supported'}</span>
            </div>
          </div>
        )}

        {/* Hidden File Input for Direct PDF Beaming */}
        <input
          ref={beamFileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleBeamFileDirect}
        />

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
