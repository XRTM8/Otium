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
  BeamSendError,
  beamService,
  buildBeamLink,
  formatRoomCode,
  generateNewReceiverRoomCode,
  getPersistentReceiverRoomCode,
  getRecentRooms,
  parseBeamLaunch,
  saveRecentRoom,
  type BeamConnectionStatus
} from './beamService';
import { QrCodeView } from './QrCodeView';
import type {
  BeamMessage,
  BeamPeerState,
  BeamTransferState
} from '../types';

interface BeamModalProps {
  isOpen: boolean;
  lang: Language;
  theme?: ThemeMode;
  reader: ReaderController;
  formFactor: 'desktop' | 'mobile';
  isBoardOpen?: boolean;
  onSetBoardOpen: (open: boolean) => void;
  onClose: () => void;
}

function describeBeamError(error: unknown, lang: Language): string {
  const ar = lang === 'ar';
  if (error instanceof BeamSendError) {
    switch (error.code) {
      case 'peer-unreachable':
        return ar
          ? 'لم تستجب السبورة حتى الآن. تأكد أن الحاسبة مفتوحة على نافذة «استقبال» وأن الرمز مطابق، ثم أعد المحاولة.'
          : 'The receiver did not answer. Make sure the PC is on the Receiver tab with the same code, then retry.';
      case 'too-large':
        return ar
          ? 'الملف أكبر من حد النقل السحابي. اجعل الهاتف والحاسبة على نفس شبكة الواي فاي أو هوتسبوت الهاتف حتى يتم النقل المباشر.'
          : 'This PDF is too large for the cloud relay. Keep both devices on the same Wi-Fi or phone hotspot for the direct transfer.';
      case 'busy':
        return ar
          ? 'هناك عملية نقل مستند جارية بالفعل. انتظر انتهاءها ثم أعد المحاولة.'
          : 'Another document transfer is already running. Wait for it to finish, then retry.';
      case 'invalid-document':
        return ar
          ? 'تعذر قراءة هذا الملف كملف PDF صالح.'
          : 'This file could not be read as a valid PDF.';
      default:
        return error.message;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return ar ? 'تعذر إتمام النقل. أعد المحاولة.' : 'The transfer did not complete. Please retry.';
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


export const BeamModal: React.FC<BeamModalProps> = ({
  isOpen,
  lang,
  reader,
  formFactor,
  onSetBoardOpen,
  onClose
}) => {
  const launchRef = useRef(
    parseBeamLaunch(
      typeof window !== 'undefined' ? window.location.hash : '',
      typeof window !== 'undefined' ? window.location.search : ''
    )
  );

  const [activeTab, setActiveTab] = useState<'send' | 'receive' | 'remote' | 'offline'>(() => {
    const role = beamService.getRole();
    if (role === 'receiver') return 'receive';
    if (role === 'sender') return beamService.getConnectedRoom() ? 'remote' : 'send';
    if (launchRef.current.role === 'receiver') return 'receive';
    if (launchRef.current.role === 'sender') return 'send';
    // A large screen with no document is almost always the receiving board.
    // Never infer this from window.innerWidth: a narrow desktop window used to
    // become a sender and silently stopped listening for the phone.
    if (!reader.doc && formFactor === 'desktop') return 'receive';
    return 'send';
  });
  const [targetRoomCode, setTargetRoomCode] = useState(() => launchRef.current.room || '');
  const [receiverRoomCode, setReceiverRoomCode] = useState(() => {
    const existing = beamService.getConnectedRoom();
    if (existing && beamService.getRole() === 'receiver') {
      return existing;
    }
    if (launchRef.current.role === 'receiver' && launchRef.current.room) {
      return launchRef.current.room;
    }
    return getPersistentReceiverRoomCode();
  });
  const hasAutoBeamedRef = useRef(false);
  const launchAppliedRef = useRef(false);
  const receiverRoomRef = useRef(receiverRoomCode);
  receiverRoomRef.current = receiverRoomCode;

  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [recentRooms, setRecentRooms] = useState<string[]>([]);
  const [beamError, setBeamError] = useState<string | null>(null);
  const [remoteDocTitle, setRemoteDocTitle] = useState<string>(() => reader.docTitle || '');
  const [remotePage, setRemotePage] = useState<number>(() => reader.currentPage || 1);
  const [remoteTotal, setRemoteTotal] = useState<number>(() => reader.numPages || 0);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [connStatus, setConnStatus] = useState<BeamConnectionStatus>(() =>
    beamService.getConnectionStatus()
  );
  const [beamState, setBeamState] = useState<{
    room: string | null;
    role: 'receiver' | 'sender' | null;
  }>(() => ({
    room: beamService.getConnectedRoom(),
    role: beamService.getRole()
  }));
  const [peer, setPeer] = useState<BeamPeerState>(() => beamService.getPeerState());
  const [transfer, setTransfer] = useState<BeamTransferState>(() =>
    beamService.getTransferState()
  );

  const connectedRoom = beamState.room;
  const connectedRemotePeer =
    beamState.role === 'receiver' && peer.connected
      ? peer.peerName || (lang === 'ar' ? 'الهاتف' : 'Remote')
      : null;
  const isReceiverAcknowledged = beamState.role === 'sender' && peer.connected;
  const offlineFileInputRef = useRef<HTMLInputElement>(null);
  const beamFileInputRef = useRef<HTMLInputElement>(null);
  const receiverFileInputRef = useRef<HTMLInputElement>(null);

  // Sync beam connection, peer and transfer state.
  useEffect(() => {
    const unsubState = beamService.onStateChange((state) => {
      setBeamState(state);
    });
    const unsubStatus = beamService.onConnectionStatusChange((status) => {
      setConnStatus(status);
    });
    const unsubPeer = beamService.onPeerChange((state) => {
      setPeer(state);
      if (state.docTitle) setRemoteDocTitle(state.docTitle);
      if (typeof state.pageNumber === 'number') setRemotePage(state.pageNumber);
      if (typeof state.totalPages === 'number') setRemoteTotal(state.totalPages);
    });
    const unsubTransfer = beamService.onTransferProgress((state) => {
      setTransfer(state);
      if (state.active && state.direction === 'send') {
        setUploadProgress(Math.round(state.progress));
      } else {
        setUploadProgress(null);
      }
      if (state.phase === 'error' && state.error) {
        setBeamError(state.error);
      }
    });
    return () => {
      unsubState();
      unsubStatus();
      unsubPeer();
      unsubTransfer();
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

  // Read the role from the link. `role=receive` is the important one: a PC that
  // opens a board link must start listening immediately, not open the send tab.
  useEffect(() => {
    if (!isOpen) {
      launchAppliedRef.current = false;
      return;
    }
    if (launchAppliedRef.current) return;

    let launch = launchRef.current;
    try {
      if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
        launch = parseBeamLaunch(window.location.hash, window.location.search);
      }
    } catch {}
    if (!launch.auto) return;
    launchAppliedRef.current = true;

    if (launch.room) {
      setTargetRoomCode(launch.room);
    }

    if (launch.role === 'receiver') {
      const room = launch.room || receiverRoomRef.current;
      setReceiverRoomCode(room);
      setActiveTab('receive');
      beamService.startReceiver(room);
      return;
    }

    if (launch.role === 'sender') {
      setActiveTab('send');
      return;
    }

    if (!reader.doc && formFactor === 'desktop' && launch.room) {
      setReceiverRoomCode(launch.room);
      setActiveTab('receive');
      beamService.startReceiver(launch.room);
    }
  }, [isOpen, formFactor, reader.doc]);

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

  // Join the cloud room whenever the Receiver tab is active. The service is
  // idempotent, so page changes and re-renders cannot tear down signaling.
  useEffect(() => {
    if (!isOpen || activeTab !== 'receive') return;
    beamService.setLocalDocumentState(
      reader.docTitle || '',
      reader.currentPage || 1,
      reader.numPages || 0
    );
    beamService.startReceiver(receiverRoomCode);
  }, [
    isOpen,
    activeTab,
    receiverRoomCode,
    reader.docTitle,
    reader.currentPage,
    reader.numPages
  ]);

  // Close the modal as soon as the receiver gets a document. The reader
  // controller performs the actual load.
  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = beamService.subscribe((msg: BeamMessage) => {
      if (
        msg.type === 'BEAM_PAYLOAD' &&
        msg.payload &&
        beamService.getRole() === 'receiver' &&
        beamService.isMatchingRoom(msg.roomCode, receiverRoomRef.current)
      ) {
        saveRecentRoom(receiverRoomRef.current);
        onSetBoardOpen(true);
        onClose();
      }
    });
    return () => unsubscribe();
  }, [isOpen, onSetBoardOpen, onClose]);

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

  // Send current book or custom file to the receiving board.
  const handleBeamDocument = useCallback(
    async (overrideCode?: string, overrideBuffer?: ArrayBuffer, overrideTitle?: string) => {
      const raw = (overrideCode || targetRoomCode || beamService.getConnectedRoom() || '').trim();
      const code = formatRoomCode(raw);
      if (!code) {
        setBeamError(
          lang === 'ar'
            ? 'يرجى إدخال رمز السبورة أولاً.'
            : 'Please enter the board code first.'
        );
        return;
      }

      setBeamError(null);
      hasAutoBeamedRef.current = true;

      let buffer = overrideBuffer;
      const title =
        overrideTitle ||
        reader.docTitle ||
        (lang === 'ar' ? 'المحاضرة' : 'Lecture Document');
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
          setBeamError(
            lang === 'ar' ? 'تعذر قراءة ملف المستند' : 'Failed to read document'
          );
          return;
        }
      }

      if (!buffer || buffer.byteLength === 0) {
        setBeamError(
          lang === 'ar' ? 'ملف المستند فارغ.' : 'The selected document is empty.'
        );
        return;
      }

      setIsSending(true);
      setSendSuccess(false);
      setBeamError(null);

      try {
        await beamService.sendDocument({
          roomCode: code,
          buffer,
          title,
          pageNumber,
          totalPages,
          theme: reader.theme
        });
        setSendSuccess(true);
        setTargetRoomCode(code);
        setTimeout(() => {
          setActiveTab('remote');
        }, 250);
      } catch (error) {
        console.error('Failed to beam document:', error);
        setBeamError(describeBeamError(error, lang));
      } finally {
        setIsSending(false);
      }
    },
    [targetRoomCode, reader, lang]
  );

  // Quick remote pairing. The service retries the handshake continuously, so
  // there is no 8-attempt limit and no need for duplicate QUERY messages.
  const handlePairAsRemote = useCallback(
    (overrideCode?: string) => {
      const raw = (overrideCode || targetRoomCode).trim();
      const code = formatRoomCode(raw);
      if (!code) {
        setBeamError(
          lang === 'ar'
            ? 'يرجى إدخال رمز السبورة أولاً.'
            : 'Please enter the board code first.'
        );
        return;
      }

      setBeamError(null);
      hasAutoBeamedRef.current = true;

      if (reader.doc) {
        void handleBeamDocument(code);
        return;
      }

      beamService.startSender(code);
      setTargetRoomCode(code);
      setSendSuccess(true);
      setTimeout(() => {
        setActiveTab('remote');
      }, 200);
    },
    [targetRoomCode, reader.doc, handleBeamDocument, lang]
  );

  // Auto-beam the active lecture when a paired receiver reports that it has no
  // document open. Runs once per pairing; manual re-beam remains available.
  useEffect(() => {
    if (
      !isOpen ||
      beamState.role !== 'sender' ||
      !peer.connected ||
      peer.docTitle ||
      !reader.doc ||
      hasAutoBeamedRef.current
    ) {
      return;
    }
    const target = beamState.room || targetRoomCode;
    if (!target) return;
    hasAutoBeamedRef.current = true;
    void handleBeamDocument(target);
  }, [
    isOpen,
    beamState.role,
    beamState.room,
    peer.connected,
    peer.docTitle,
    reader.doc,
    targetRoomCode,
    handleBeamDocument
  ]);

  // File picker handler to beam a file directly without opening it first
  const handleBeamFileDirect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // Also open the document in the local reader so the presenter can see and navigate it.
      void reader.openFile(file);
      const buf = await file.arrayBuffer();
      const code = targetRoomCode.trim() || connectedRoom || '';
      if (!code) {
        setBeamError(lang === 'ar' ? 'يرجى إدخال رمز السبورة أولاً' : 'Please enter room code first');
        return;
      }
      void handleBeamDocument(code, buf, file.name.replace(/\.pdf$/i, ''));
    } catch {
      setBeamError(lang === 'ar' ? 'تعذر قراءة الملف المحدد' : 'Failed to read selected file');
    } finally {
      e.target.value = '';
    }
  };

  // Camera QR Code Scanner Execution
  const startCameraScanner = async () => {
    setCameraError(null);
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
      setCameraError(
        lang === 'ar'
          ? 'متصفح هذا الجهاز لا يدعم مسح QR. اكتب الرمز الظاهر على السبورة يدوياً.'
          : 'This browser cannot scan QR codes. Type the code shown on the board instead.'
      );
      setIsScanningCamera(false);
      return;
    }
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

      const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      const scanLoop = async () => {
        if (!videoRef.current || !mediaStreamRef.current) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const raw = barcodes[0].rawValue || '';
            const match =
              raw.match(/room=([A-Za-z0-9_-]+)/) ||
              raw.match(/(OTM-[A-Za-z0-9_-]+)/i) ||
              raw.match(/([0-9]{4,6})/);
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

  const handleReceiverFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // The reader controller announces the document/page after it has loaded.
      // Announcing immediately here used to send page 1 with the old document.
      void reader.openFile(file);
      onSetBoardOpen(true);
      onClose();
    }
  };

  const handleRegenerateCode = () => {
    beamService.disconnect();
    const newCode = generateNewReceiverRoomCode();
    setReceiverRoomCode(newCode);
    setBeamError(null);
    beamService.startReceiver(newCode);
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }
  }, [isOpen, stopCamera]);

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

  // Remote clicker controls. Send exactly one absolute page command: the old
  // code sent BEAM_STEP + BEAM_PAGE_CHANGE, which double-advanced the receiver.
  const handleRemoteNext = useCallback(() => {
    if (!isReceiverAcknowledged) return;
    if (activeTotal > 0 && activePage >= activeTotal) return;
    triggerHaptic();
    const nextPage = activePage + 1;
    if (reader.doc) {
      reader.goToNextPage();
    } else {
      setRemotePage(nextPage);
    }
    beamService.broadcastPageChange(nextPage);
  }, [activeTotal, activePage, reader, isReceiverAcknowledged, triggerHaptic]);

  const handleRemotePrev = useCallback(() => {
    if (!isReceiverAcknowledged) return;
    if (activeTotal > 0 && activePage <= 1) return;
    triggerHaptic();
    const prevPage = Math.max(1, activePage - 1);
    if (reader.doc) {
      reader.goToPrevPage();
    } else {
      setRemotePage(prevPage);
    }
    beamService.broadcastPageChange(prevPage);
  }, [activeTotal, activePage, reader, isReceiverAcknowledged, triggerHaptic]);

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

  const transferPhaseText = (() => {
    if (!transfer.active && transfer.phase !== 'finalizing') return null;
    const ar = lang === 'ar';
    if (transfer.phase === 'waiting-peer') {
      return ar ? 'بانتظار استجابة السبورة…' : 'Waiting for the receiver…';
    }
    if (transfer.phase === 'preparing') {
      return ar ? 'جارٍ تجهيز الاتصال المباشر…' : 'Preparing the direct connection…';
    }
    if (transfer.phase === 'finalizing') {
      return ar ? 'جارٍ التحقق من الملف…' : 'Verifying the file…';
    }
    if (transfer.phase === 'transferring') {
      const channel = transfer.mode === 'p2p' ? (ar ? 'P2P مباشر' : 'Direct P2P') : ar ? 'سحابة' : 'Cloud';
      return `${channel} · ${transfer.progress}%`;
    }
    return null;
  })();

  const smartboardUrl = buildBeamLink(receiverRoomCode, 'sender');

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

          {beamState.role === 'sender' && connectedRoom && (
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
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-2 text-start">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                  <Radio className="w-3.5 h-3.5 animate-pulse text-amber-500" />
                  <span>{lang === 'ar' ? 'لا يوجد ملف مفتوح حالياً على الهاتف' : 'No document open on phone'}</span>
                </div>
                <p className="text-[11px] text-ink-muted leading-tight">
                  {lang === 'ar'
                    ? 'اختر ملف الملزمة لبثها للسبورة، أو اتصل كريموت تحكم إذا كانت معروضة بالفعل على شاشة السبورة:'
                    : 'Pick a PDF file to beam to smartboard, or pair as remote if already displayed on screen:'}
                </p>
                <button
                  type="button"
                  onClick={() => beamFileInputRef.current?.click()}
                  className="w-full py-2 px-3 rounded-xl bg-accent text-on-accent font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs hover:bg-accent-strong transition-all cursor-pointer"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? '📂 اختيار ملف الملزمة وبثها الآن' : '📂 Select PDF & Beam to Board'}</span>
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

            {transfer.active && transfer.direction === 'send' && (
              <div className="p-3 rounded-2xl bg-accent/10 border border-accent/25 space-y-2 text-start animate-in fade-in duration-150">
                <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-accent">
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{transferPhaseText || (lang === 'ar' ? 'جارٍ الإرسال…' : 'Sending…')}</span>
                  </span>
                  <span className="font-mono">
                    {formatBytes(transfer.bytesTransferred)} / {formatBytes(transfer.totalBytes)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-accent/15 overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-200"
                    style={{ width: `${Math.max(2, transfer.progress)}%` }}
                  />
                </div>
                {transfer.phase === 'waiting-peer' && (
                  <p className="text-[10px] text-ink-muted leading-tight">
                    {lang === 'ar'
                      ? 'تأكد أن الحاسبة مفتوحة على نافذة «استقبال» بنفس الرمز. سيتم الاتصال تلقائياً.'
                      : 'Keep the PC on the Receiver tab with the same code. Pairing retries automatically.'}
                  </p>
                )}
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
              <div className="flex flex-col gap-2">
                {reader.doc ? (
                  <button
                    type="button"
                    onClick={() => void handleBeamDocument()}
                    disabled={isSending || !targetRoomCode.trim()}
                    className="w-full py-3 px-3 rounded-2xl bg-accent text-on-accent font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm hover:bg-accent-strong active:scale-98 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
                  >
                    {isSending ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : sendSuccess ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {transferPhaseText
                        ? transferPhaseText
                        : lang === 'ar' ? 'بث ومزامنة للسبورة فوراً' : 'Beam & Sync to Smartboard'}
                    </span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => beamFileInputRef.current?.click()}
                      disabled={isSending}
                      className="w-full py-2.5 px-3 rounded-2xl bg-accent text-on-accent font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm hover:bg-accent-strong active:scale-98 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
                    >
                      <FileUp className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? '📂 اختيار ملف وبثه للسبورة' : '📂 Select PDF & Beam to Board'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePairAsRemote()}
                      disabled={!targetRoomCode.trim()}
                      className="w-full py-2 px-3 rounded-2xl bg-hover border border-line hover:border-accent/40 text-ink text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-accent/15 active:scale-98 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
                    >
                      <Radio className="w-3.5 h-3.5 text-accent" />
                      <span>{lang === 'ar' ? '📱 اقتران كريموت فقط (إذا كانت الملزمة مفتوحة بالسبورة)' : '📱 Pair as Remote Only (if PDF is on screen)'}</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Receiver Screen Mode (Smartboard Display) */}
        {activeTab === 'receive' && (
          <div className="p-5 flex flex-col items-center justify-center space-y-3.5 text-center">
            {/* Visual Feedback: Remote Connected Successfully! */}
            {connectedRemotePeer && (
              <div className="w-full p-4 rounded-2xl bg-emerald-500/15 border-2 border-emerald-500/40 text-start space-y-2 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                    <span>{lang === 'ar' ? `✅ متصل الآن بجهازك (${connectedRemotePeer})!` : `✅ Paired with ${connectedRemotePeer}!`}</span>
                  </span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-300">
                    {receiverRoomCode}
                  </span>
                </div>
                <p className="text-xs text-ink leading-relaxed">
                  {reader.doc
                    ? (lang === 'ar'
                        ? 'الملزمة جاهزة ومعروضة على السبورة، يمكنك تقليبها فوراً من هاتفك!'
                        : 'Document is open; turn pages using your phone clicker!')
                    : (lang === 'ar'
                        ? 'السبورة جاهزة ومقترنة بهاتفك! بانتظار استلام الملزمة من هاتفك، أو اختر فتحها مباشرة من هذا الجهاز:'
                        : 'Ready and paired! Waiting for document stream from phone, or open it directly here:')}
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
                    <span>{lang === 'ar' ? '⚡ فتح ملف الملزمة من هذا الجهاز فوراً' : '⚡ Open PDF on this device now'}</span>
                  </button>
                )}
              </div>
            )}

            {transfer.active && transfer.direction === 'receive' && (
              <div className="w-full p-3 rounded-2xl bg-accent/10 border border-accent/25 space-y-2 text-start animate-in fade-in duration-150">
                <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-accent">
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      {transferPhaseText ||
                        (lang === 'ar' ? 'جارٍ استلام الملزمة…' : 'Receiving the document…')}
                    </span>
                  </span>
                  <span className="font-mono">
                    {formatBytes(transfer.bytesTransferred)} / {formatBytes(transfer.totalBytes)}
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

            {/* Minimal Prompt (when no peer connected) */}
            {!connectedRemotePeer && (
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold text-ink">
                  {lang === 'ar' ? 'وجّه كاميرا الهاتف نحو الرمز لبث المحاضرة' : 'Point phone camera at QR to beam'}
                </h4>
                <p className="text-[11px] text-ink-muted">
                  {lang === 'ar' ? 'أو افتح Otium بهاتفك واضغط بث' : 'Or open Otium on phone and tap Beam'}
                </p>
              </div>
            )}

            {/* QR Code (hidden if already paired to reduce clutter) */}
            {!connectedRemotePeer && (
              <div className="my-0.5 shadow-sm rounded-2xl p-1 bg-white border border-line">
                <QrCodeView value={smartboardUrl} size={160} />
              </div>
            )}

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
              <button
                type="button"
                onClick={handleRegenerateCode}
                className="p-1 rounded-lg hover:bg-surface text-ink-muted hover:text-ink transition-colors cursor-pointer"
                title={lang === 'ar' ? 'توليد رمز جديد' : 'Generate New Code'}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick URL reminder */}
            <div className="text-[10px] text-ink-muted flex items-center gap-1 font-mono">
              <span>{lang === 'ar' ? 'رابط السبورة السريع:' : 'Quick link:'}</span>
              <strong className="text-accent underline">is.gd/otium</strong>
            </div>

            {/* Direct Open PDF on this PC / Smartboard Card */}
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
                <div className="text-xs font-bold text-ink truncate">
                  {reader.docTitle}
                </div>
                <p className="text-[10px] text-ink-muted leading-tight">
                  {lang === 'ar'
                    ? 'اكتب الرمز أعلاه في هاتفك للبدء بالتقليب فوراً كالريموت! 📱'
                    : 'Enter code on your phone to turn pages wirelessly! 📱'}
                </p>
              </div>
            ) : (
              <div className="w-full p-3 rounded-2xl bg-hover-subtle border border-line text-start space-y-2">
                <div className="flex items-center gap-1.5 text-ink font-bold text-xs">
                  <FolderOpen className="w-4 h-4 text-accent" />
                  <span>{lang === 'ar' ? 'حل فوري: فتح الملزمة على هذه الشاشة' : 'Instant: Open PDF on this screen'}</span>
                </div>
                <p className="text-[11px] text-ink-muted leading-tight">
                  {lang === 'ar'
                    ? 'إذا كانت الملزمة موجودة بحاسوبك أو فلاشة USB، افتحها هنا واستخدم الهاتف كريموت تحكم فقط (أسرع 100 مرة وبدون انتظار الرفع عبر النت).'
                    : 'If you have the PDF on this PC or USB, open it here and use your phone as a wireless clicker.'}
                </p>
                <button
                  type="button"
                  onClick={() => receiverFileInputRef.current?.click()}
                  className="w-full py-2 px-3 rounded-xl bg-accent/15 hover:bg-accent/25 border border-accent/30 text-accent font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'اختيار ملف الملزمة من هذا الجهاز ⚡' : 'Select PDF from this device ⚡'}</span>
                </button>
              </div>
            )}

            {/* Connection Status Indicator */}
            <div className="flex items-center gap-1.5 text-[10px] text-ink-muted pt-1 border-t border-line w-full justify-center">
              {connStatus === 'connected' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    {peer.connected
                      ? (lang === 'ar' ? 'الهاتف مرتبط' : 'Phone paired')
                      : (lang === 'ar' ? 'خدمة الربط جاهزة — بانتظار الهاتف' : 'Signaling ready — waiting for phone')}
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
                    onClick={() => beamService.startReceiver(receiverRoomCode, true)}
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
              {isReceiverAcknowledged ? (
                <span className="flex items-center gap-1.5 text-emerald-500 font-semibold text-[11px]">
                  <Radio className="w-3 h-3 animate-pulse text-emerald-500" />
                  <span>{lang === 'ar' ? 'متصل فعلياً بالسبورة:' : 'Live Connected:'} <strong className="font-mono text-ink">{connectedRoom}</strong></span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-amber-500 font-semibold text-[11px]">
                  <RefreshCw className="w-3 h-3 animate-spin text-amber-500" />
                  <span>{lang === 'ar' ? 'بانتظار استجابة السبورة…' : 'Waiting for board…'} <strong className="font-mono text-ink">{connectedRoom}</strong></span>
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  beamService.disconnect();
                  setActiveTab('send');
                }}
                className="text-[11px] text-danger-ink hover:underline cursor-pointer"
              >
                {lang === 'ar' ? 'قطع الاتصال' : 'Disconnect'}
              </button>
            </div>

            {/* Waiting for Board Hint */}
            {!isReceiverAcknowledged && (
              <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-start text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                <span>⚠️ {lang === 'ar' ? 'لم تستجب السبورة حتى الآن. تأكد أن المتصفح في الحاسبة مفتوح على نافذة "استقبال" وأن الرمز مطابق.' : 'Smartboard has not responded yet. Ensure PC browser is open on "Receiver" tab with matching code.'}</span>
              </div>
            )}

            {/* Warning when Board has no PDF loaded */}
            {isReceiverAcknowledged && !reader.doc && (!remoteDocTitle || remoteTotal === 0) && (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-start space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                  <FolderOpen className="w-4 h-4 text-amber-500" />
                  <span>{lang === 'ar' ? 'السبورة لا تعرض أي ملزمة حالياً!' : 'No document is open on Smartboard!'}</span>
                </div>
                <p className="text-[11px] text-ink-muted leading-tight">
                  {lang === 'ar'
                    ? 'الحاسبة متصلة لكن لم يتم فتح أي ملف عليها بعد. اختر ملف الملزمة من هاتفك لبثها وعرضها فوراً:'
                    : 'Board is connected but has no file loaded. Pick a PDF on your phone to beam it now:'}
                </p>
                <button
                  type="button"
                  onClick={() => beamFileInputRef.current?.click()}
                  className="w-full py-2 px-3 rounded-xl bg-accent text-on-accent font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs hover:bg-accent-strong transition-all"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? '📂 اختيار ملف الملزمة وبثها الآن' : '📂 Select PDF & Beam Now'}</span>
                </button>
              </div>
            )}

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

        {/* Hidden File Input for Receiver PC Direct Opening */}
        <input
          ref={receiverFileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleReceiverFile}
        />
      </div>
    </div>
  );
};
