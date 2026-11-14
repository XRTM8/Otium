import type React from 'react';
import { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
import type { Language } from '../../core/i18n/translations';
import type { ReaderController } from '../../app/useReaderController';
import {
  beamService,
  buildBeamLink,
  formatRoomCode,
  generateNewReceiverRoomCode,
  getPersistentReceiverRoomCode,
  getRecentRooms,
  parseBeamLaunch,
  saveRecentRoom,
  type BeamConnectionStatus,
} from './beamService';
import { defaultBeamTab } from './deviceRole';
import type { BeamModalTab } from './BeamModalChrome';
import { formatBeamTransferPhaseText } from './beamSessionFrames';
import { useBeamModalCamera } from './useBeamModalCamera';
import type { BeamMessage, BeamPeerState, BeamTransferState } from '../types';
import { describeFile, isBeamMediaFile } from '../../media/media';
import {
  clearRecentLanTargets,
  getRecentLanTargets,
  lanPairingCode,
  parseLanTarget,
  saveRecentLanTarget,
  type LanInvitation,
  type SavedLanTarget,
} from './beamLanTransport';
import { isTauriRuntime } from '../../platform/runtime';

export function useBeamModalSession({
  isOpen,
  lang,
  reader,
  formFactor,
  preferredRole,
  mediaFile,
  onOpenFile,
  retryMedia,
  onSetBoardOpen,
  onClose,
}: {
  isOpen: boolean;
  lang: Language;
  reader: ReaderController;
  formFactor: 'desktop' | 'mobile';
  preferredRole?: 'receiver' | 'sender';
  mediaFile?: File | null;
  onOpenFile?: (file: File) => Promise<boolean>;
  retryMedia?: () => void;
  onSetBoardOpen: (open: boolean) => void;
  onClose: () => void;
}) {
  const hasFile = Boolean(reader.doc || mediaFile);
  const lanAvailable = isTauriRuntime();
  const [network, setNetwork] = useState<'lan' | 'cloud'>(() =>
    lanAvailable && (beamService.isLanSession() || !beamService.getRole()) ? 'lan' : 'cloud');
  const [lanInvitation, setLanInvitation] = useState<LanInvitation | null>(() => beamService.getLanInvitation());
  const [lanAddress, setLanAddress] = useState('');
  const [lanBusy, setLanBusy] = useState(false);
  const [lanAttempt, setLanAttempt] = useState<'idle' | 'ready' | 'failed'>(() =>
    beamService.getLanInvitation() ? 'ready' : 'idle');
  const lanRequest = useRef(0);
  const startingFile = useRef(false);
  useEffect(() => () => { lanRequest.current++; }, []);
  const [initialLaunch] = useState(() =>
    parseBeamLaunch(
      typeof window !== 'undefined' ? window.location.hash : '',
      typeof window !== 'undefined' ? window.location.search : ''
    )
  );
  const launchRef = useRef(initialLaunch);

  const [activeTab, setActiveTab] = useState<BeamModalTab>(() => {
    const role = beamService.getRole();
    if (role === 'receiver') return mediaFile && preferredRole !== 'receiver' ? 'send' : 'receive';
    if (role === 'sender') return beamService.getConnectedRoom() ? 'remote' : 'send';
    if (initialLaunch.role === 'receiver') return 'receive';
    if (initialLaunch.role === 'sender') return 'send';
    return defaultBeamTab(formFactor, hasFile, preferredRole);
  });
  const [targetRoomCode, setTargetRoomCode] = useState(() => {
    const target = beamService.getLanSenderTarget();
    return target ? lanPairingCode(target) :
      (beamService.getRole() === 'sender' ? beamService.getConnectedRoom() : null) || initialLaunch.room || '';
  });
  const [receiverRoomCode, setReceiverRoomCode] = useState(() => {
    const existing = beamService.getConnectedRoom();
    if (existing && beamService.getRole() === 'receiver') return existing;
    if (initialLaunch.role === 'receiver' && initialLaunch.room) return initialLaunch.room;
    return getPersistentReceiverRoomCode();
  });
  const launchAppliedRef = useRef(false);
  const receiverRoomRef = useRef(receiverRoomCode);
  useLayoutEffect(() => {
    receiverRoomRef.current = receiverRoomCode;
  }, [receiverRoomCode]);

  const [sendSuccess, setSendSuccess] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [recentRooms, setRecentRooms] = useState<string[]>(() => getRecentRooms());
  const [recentLanTargets, setRecentLanTargets] = useState<SavedLanTarget[]>(() => getRecentLanTargets());
  const [beamError, setBeamError] = useState<string | null>(null);
  const [remoteDocTitle, setRemoteDocTitle] = useState<string>(() => reader.docTitle || '');
  const [remotePage, setRemotePage] = useState<number>(() => reader.currentPage || 1);
  const [remoteTotal, setRemoteTotal] = useState<number>(() => reader.numPages || 0);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [connStatus, setConnStatus] = useState<BeamConnectionStatus>(() => beamService.getConnectionStatus());
  const [beamState, setBeamState] = useState<{ room: string | null; role: 'receiver' | 'sender' | null }>(() => ({
    room: beamService.getConnectedRoom(),
    role: beamService.getRole(),
  }));
  const [peer, setPeer] = useState<BeamPeerState>(() => beamService.getPeerState());
  const [peerLeft, setPeerLeft] = useState(false);
  const [transfer, setTransfer] = useState<BeamTransferState>(() => beamService.getTransferState());
  const closeAfterSend = useRef<'file' | 'remote' | null>(null);
  const pendingTransfer = useRef(false);
  const peerWasConnected = useRef(beamService.getPeerState().connected);

  const isSending = transfer.active && transfer.direction === 'send';
  const connectedRoom = beamState.room;
  const connectedRemotePeer =
    beamState.role === 'receiver' && peer.connected
      ? peer.peerName || (lang === 'ar' ? 'الهاتف' : 'Remote')
      : null;
  const isReceiverAcknowledged = beamState.role === 'sender' && peer.connected;
  const offlineFileInputRef = useRef<HTMLInputElement>(null);
  const beamFileInputRef = useRef<HTMLInputElement>(null);
  const receiverFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let hadPeer = beamService.getPeerState().connected;
    const unsubState = beamService.onStateChange((state) => {
      setBeamState(state);
      if (!state.role) {
        setSendSuccess(false);
        closeAfterSend.current = null;
        pendingTransfer.current = false;
      }
    });
    const unsubStatus = beamService.onConnectionStatusChange((status) => {
      setConnStatus(status);
    });
    const unsubPeer = beamService.onPeerChange((state) => {
      if (hadPeer && !state.connected) {
        setPeerLeft(true);
        setRemoteDocTitle('');
        setRemoteTotal(0);
      }
      if (state.connected) setPeerLeft(false);
      hadPeer = state.connected;
      setPeer(state);
      if (state.docTitle) setRemoteDocTitle(state.docTitle);
      if (typeof state.pageNumber === 'number') setRemotePage(state.pageNumber);
      if (typeof state.totalPages === 'number') setRemoteTotal(state.totalPages);
    });
    const unsubTransfer = beamService.onTransferProgress((state) => {
      if (closeAfterSend.current === 'file' && state.active && state.direction === 'send') pendingTransfer.current = true;
      setTransfer(state);
      setUploadProgress(state.active && state.direction === 'send' ? Math.round(state.progress) : null);
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

  useEffect(() => {
    if (!isOpen) return;
    const raf = window.requestAnimationFrame(() => setRecentRooms(getRecentRooms()));
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen]);

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
    } catch (err) {
      console.warn('[BeamModal] Failed to parse launch URL:', err);
    }
    if (!launch.auto) return;
    launchAppliedRef.current = true;

    setNetwork('cloud');
    if (launch.room) setTargetRoomCode(launch.room);
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
    if (!hasFile && formFactor === 'desktop' && launch.room) {
      setReceiverRoomCode(launch.room);
      setActiveTab('receive');
      beamService.startReceiver(launch.room);
    }
  }, [isOpen, formFactor, hasFile]);

  const defaultRoleRef = useRef({ open: false, formFactor, preferredRole });
  useEffect(() => {
    const previous = defaultRoleRef.current;
    defaultRoleRef.current = { open: isOpen, formFactor, preferredRole };
    if (!isOpen || (previous.open && previous.formFactor === formFactor && previous.preferredRole === preferredRole)) return;
    if (reader.beamPeerConnected || beamService.getConnectedRoom() || launchRef.current.role) return;
    setActiveTab(defaultBeamTab(formFactor, hasFile, preferredRole));
  }, [isOpen, formFactor, preferredRole, hasFile, reader.beamPeerConnected]);

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

  useEffect(() => {
    if (!isOpen || activeTab !== 'receive') return;
    if (!mediaFile) {
      beamService.setLocalDocumentState(reader.docTitle || '', reader.currentPage || 1, reader.numPages || 0);
    }
  }, [isOpen, activeTab, reader.docTitle, reader.currentPage, reader.numPages, mediaFile]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'receive') return;
    if (network === 'cloud') {
      beamService.startReceiver(receiverRoomCode);
      return;
    }
    if (lanAttempt === 'ready' || lanAttempt === 'failed' || beamService.getLanInvitation()) return;
    let current = true;
    const timer = setTimeout(async () => {
      setLanBusy(true);
      setLanInvitation(null);
      try {
        const invitation = await beamService.startLanReceiver(() => current);
        if (current && invitation) {
          setLanInvitation(invitation);
          setLanAttempt('ready');
        }
      } catch {
        if (current) {
          setLanAttempt('failed');
          setBeamError(lang === 'ar'
            ? 'تعذر فتح استقبال LAN. تأكد أن الشاشة متصلة بواي فاي أو إيثرنت، ثم حاول مرة ثانية.'
            : 'Could not open LAN receiving. Connect the screen to Wi-Fi or Ethernet and retry.');
        }
      } finally { if (current) setLanBusy(false); }
    }, 0);
    return () => { current = false; clearTimeout(timer); };
  }, [isOpen, activeTab, network, receiverRoomCode, lang, lanAttempt]);

  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = beamService.subscribe((msg: BeamMessage) => {
      if (
        msg.type === 'BEAM_DOCUMENT_OPENED' &&
        msg.payload &&
        beamService.getRole() === 'receiver' &&
        beamService.isMatchingRoom(msg.roomCode, beamService.getConnectedRoom() || receiverRoomRef.current)
      ) {
        if (!beamService.isLanSession()) saveRecentRoom(msg.roomCode);
        onSetBoardOpen(false);
        onClose();
      }
    });
    return () => unsubscribe();
  }, [isOpen, onSetBoardOpen, onClose]);

  useEffect(() => {
    const justConnected = peer.connected && !peerWasConnected.current;
    peerWasConnected.current = peer.connected;
    if (!isOpen || !peer.connected) return;
    if (beamState.role === 'receiver' && activeTab === 'receive' && justConnected) {
      onClose();
      return;
    }
    if (beamState.role !== 'sender') return;
    const shouldClose = closeAfterSend.current === 'remote' ||
      (closeAfterSend.current === 'file' && pendingTransfer.current &&
        transfer.direction === 'send' && transfer.phase === 'done');
    if (shouldClose) {
      closeAfterSend.current = null;
      pendingTransfer.current = false;
      onClose();
    }
  }, [isOpen, peer.connected, beamState.role, activeTab, transfer, onClose]);

  const connect = useCallback(async (raw: string, action: 'file' | 'remote') => {
    const local = /^otium-lan:/i.test(raw.trim()) || (network === 'lan' && !/^OTM-/i.test(raw.trim()));
    const target = local ? parseLanTarget(raw) : null;
    const code = local ? (target && lanPairingCode(target)) : formatRoomCode(raw);
    if (!code || (local && !lanAvailable)) {
      setBeamError(local
        ? (lang === 'ar' ? 'امسح QR المحلي أو الصق الرمز في تطبيق Otium المثبّت.' : 'Scan or paste the LAN code in the installed Otium app.')
        : (lang === 'ar' ? 'يرجى إدخال رمز السبورة أولاً.' : 'Please enter the board code first.'));
      return false;
    }
    setBeamError(null);
    if (!startingFile.current) {
      closeAfterSend.current = action;
      pendingTransfer.current = false;
    }
    setTargetRoomCode(code);
    if (target) {
      setNetwork('lan');
      const existing = beamService.getLanSenderTarget();
      if (!existing || lanPairingCode(existing) !== code || !beamService.getPeerState().connected) {
        const request = ++lanRequest.current;
        setLanBusy(true);
        try {
          await beamService.startLanSender(target);
          if (request !== lanRequest.current) return false;
          saveRecentLanTarget(target);
          setRecentLanTargets(getRecentLanTargets());
        } catch {
          if (request !== lanRequest.current) return false;
          closeAfterSend.current = null;
          setBeamError(lang === 'ar'
            ? 'ما قدرنا نوصل للشاشة عبر LAN. تأكد من نفس الشبكة والرمز، أو اختَر «عبر الإنترنت».'
            : 'Could not reach the screen over LAN. Check the network and code, or select Via internet.');
          return false;
        } finally { if (request === lanRequest.current) setLanBusy(false); }
      }
    } else {
      setNetwork('cloud');
      beamService.startSender(code);
    }
    setBeamError(null);
    setSendSuccess(true);
    setActiveTab('remote');
    return true;
  }, [lang, lanAvailable, network]);

  const handleBeamDocument = useCallback(async (overrideCode?: string) => {
    if (!hasFile) {
      beamFileInputRef.current?.click();
      return;
    }
    const code = overrideCode || targetRoomCode ||
      (beamService.getRole() === 'sender' ? beamService.getConnectedRoom() : '') || '';
    if (!await connect(code, 'file')) return;
    if (mediaFile) retryMedia?.();
    else reader.autoBeam.retry();
  }, [targetRoomCode, reader, hasFile, mediaFile, retryMedia, connect]);

  const handlePairAsRemote = useCallback((overrideCode?: string) => {
    const code = overrideCode || targetRoomCode;
    if (hasFile) void handleBeamDocument(code);
    else void connect(code, 'remote');
  }, [targetRoomCode, hasFile, handleBeamDocument, connect]);

  const handleBeamFileDirect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const selectionRequest = lanRequest.current;
    try {
      const code = targetRoomCode.trim() || (beamState.role === 'sender' ? connectedRoom : '') || '';
      if (!code) {
        setBeamError(lang === 'ar' ? 'يرجى إدخال رمز السبورة أولاً' : 'Please enter room code first');
        return;
      }
      if (describeFile(file.name).kind !== 'pdf' && !isBeamMediaFile(file.name)) {
        setBeamError(lang === 'ar' ? 'اختر PDF أو صورة أو فيديو أو عرض PPTX/PPSX.' : 'Choose a PDF, image, video, or PPTX/PPSX presentation.');
        return;
      }
      setBeamError(null);
      startingFile.current = true;
      closeAfterSend.current = 'file';
      pendingTransfer.current = false;
      const opened = await (onOpenFile ?? reader.openFile)(file);
      if (lanRequest.current !== selectionRequest) return;
      if (!opened || !await connect(code, 'file')) closeAfterSend.current = null;
    } catch {
      setBeamError(lang === 'ar' ? 'تعذر قراءة الملف المحدد' : 'Failed to read selected file');
    } finally {
      startingFile.current = false;
      e.target.value = '';
    }
  };

  const camera = useBeamModalCamera({
    isOpen,
    lang,
    onDetectedRoom: (detected) => {
      if (parseLanTarget(detected)) setNetwork('lan');
      else setNetwork('cloud');
      setTargetRoomCode(detected);
      if (hasFile) void handleBeamDocument(detected);
      else handlePairAsRemote(detected);
    },
  });

  const openPickedFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void (onOpenFile ?? reader.openFile)(file);
      onSetBoardOpen(true);
      onClose();
    }
  };

  const handleRegenerateCode = () => {
    beamService.disconnect();
    if (network === 'lan') {
      setLanAddress('');
      setLanInvitation(null);
      setBeamError(null);
      setLanAttempt('idle');
      return;
    }
    const newCode = generateNewReceiverRoomCode();
    setReceiverRoomCode(newCode);
    setBeamError(null);
    beamService.startReceiver(newCode);
  };

  const triggerHaptic = useCallback(() => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(18);
      } catch (err) {
        console.debug('[BeamModal] Haptic vibrate ignored:', err);
      }
    }
  }, []);

  const activeDocTitle =
    mediaFile?.name || reader.docTitle || remoteDocTitle || (lang === 'ar' ? 'المستند المتصل بالسبورة' : 'Connected Document');
  const activePage = reader.doc ? reader.currentPage : remotePage;
  const activeTotal = reader.doc ? reader.numPages : remoteTotal;

  const handleRemoteNext = useCallback(() => {
    if (!isReceiverAcknowledged) return;
    if (activeTotal > 0 && activePage >= activeTotal) return;
    triggerHaptic();
    const nextPage = activePage + 1;
    if (reader.doc) reader.goToNextPage();
    else {
      setRemotePage(nextPage);
      beamService.sendStep('next');
    }
  }, [activeTotal, activePage, reader, isReceiverAcknowledged, triggerHaptic]);

  const handleRemotePrev = useCallback(() => {
    if (!isReceiverAcknowledged) return;
    if (activeTotal > 0 && activePage <= 1) return;
    triggerHaptic();
    const prevPage = Math.max(1, activePage - 1);
    if (reader.doc) reader.goToPrevPage();
    else {
      setRemotePage(prevPage);
      beamService.sendStep('prev');
    }
  }, [activeTotal, activePage, reader, isReceiverAcknowledged, triggerHaptic]);

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
    navigator.clipboard?.writeText(network === 'lan' ? lanCode : receiverRoomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleClearRecentLanTargets = useCallback(() => {
    clearRecentLanTargets();
    setRecentLanTargets([]);
  }, []);

  const selectedAddress = lanAddress || lanInvitation?.addresses[0];
  const lanCode = lanInvitation && selectedAddress ? lanPairingCode({ ...lanInvitation, address: selectedAddress }) : '';
  const selectNetwork = (mode: 'lan' | 'cloud') => {
    if (mode === network) return;
    lanRequest.current++;
    beamService.disconnect();
    setNetwork(mode);
    if (mode === 'lan') {
      const recents = getRecentLanTargets();
      setRecentLanTargets(recents);
      if (recents[0] && !targetRoomCode) {
        setTargetRoomCode(recents[0].code);
      } else {
        setTargetRoomCode('');
      }
    } else {
      setTargetRoomCode('');
    }
    setLanAddress('');
    setLanInvitation(null);
    setLanAttempt('idle');
    setLanBusy(false);
    setBeamError(null);
    setSendSuccess(false);
  };
  return {
    activeTab, setActiveTab,
    targetRoomCode, setTargetRoomCode,
    receiverRoomCode,
    sendSuccess, copiedCode, recentRooms, recentLanTargets, handleClearRecentLanTargets, beamError,
    remoteDocTitle, remoteTotal, uploadProgress, connStatus,
    beamState, peer, peerLeft, transfer,
    isSending, connectedRoom, connectedRemotePeer, isReceiverAcknowledged,
    offlineFileInputRef, beamFileInputRef, receiverFileInputRef,
    handleBeamDocument, handlePairAsRemote, handleBeamFileDirect,
    openPickedFile, handleRegenerateCode, handleCopyCode,
    handleRemoteNext, handleRemotePrev,
    activeDocTitle, activePage, activeTotal,
    network, selectNetwork, lanAvailable, lanBusy, lanCode, selectedAddress, lanAddresses: lanInvitation?.addresses ?? [],
    setLanAddress,
    transferPhaseText: formatBeamTransferPhaseText(transfer, lang),
    smartboardUrl: buildBeamLink(receiverRoomCode, 'sender'),
    ...camera,
  };
}
