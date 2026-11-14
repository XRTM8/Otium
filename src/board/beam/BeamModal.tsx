import React from 'react';
import type { Language } from '../../core/i18n/translations';
import type { ThemeMode } from '../../core/types';
import type { ReaderController } from '../../app/useReaderController';
import { BeamReceiveTab, BeamSendTab } from './BeamSendReceiveTabs';
import { BeamOfflineTab, BeamRemoteTab } from './BeamOfflineRemoteTabs';
import { BeamHiddenFileInputs, BeamModalHeaderAndTabs } from './BeamModalChrome';
import { useBeamModalSession } from './useBeamModalSession';

interface BeamModalProps {
  isOpen: boolean;
  lang: Language;
  theme?: ThemeMode;
  reader: ReaderController;
  formFactor: 'desktop' | 'mobile';
  preferredRole?: 'receiver' | 'sender';
  isBoardOpen?: boolean;
  mediaFile?: File | null;
  onOpenFile?: (file: File) => Promise<boolean>;
  retryMedia?: () => void;
  mediaError?: string | null;
  onSetBoardOpen: (open: boolean) => void;
  onClose: () => void;
}

export const BeamModal: React.FC<BeamModalProps> = ({
  isOpen,
  lang,
  reader,
  formFactor,
  preferredRole,
  mediaFile,
  onOpenFile,
  retryMedia,
  mediaError,
  onSetBoardOpen,
  onClose,
}) => {
  const s = useBeamModalSession({
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
  });

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={lang === 'ar' ? 'البث الذكي للسبورة' : 'Smart Beam'}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md p-0 sm:p-4 select-none animate-in fade-in duration-200 theme-${reader.theme}`}
    >
      <div className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-surface border-t sm:border border-line shadow-2xl flex flex-col text-ink animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
        <BeamModalHeaderAndTabs
          lang={lang}
          activeTab={s.activeTab}
          showRemoteTab={Boolean(s.beamState.role === 'sender' && s.connectedRoom)}
          onSelectTab={(tab) => {
            s.stopCamera();
            s.setActiveTab(tab);
          }}
          onClose={onClose}
        />

        {s.lanAvailable && (s.activeTab === 'send' || s.activeTab === 'receive' || !s.isReceiverAcknowledged && s.activeTab === 'remote') && (
          <div role="group" aria-label={lang === 'ar' ? 'طريقة الربط' : 'Connection mode'}
            className="mx-5 mt-3 grid grid-cols-2 gap-1 rounded-xl bg-hover p-1 text-xs">
            {(['lan', 'cloud'] as const).map(mode => (
              <button key={mode} type="button" aria-pressed={s.network === mode}
                className={`rounded-lg px-2 py-2 cursor-pointer ${s.network === mode ? 'bg-surface font-semibold text-accent' : 'text-ink-muted'}`}
                onClick={() => {
                  s.stopCamera();
                  s.selectNetwork(mode);
                  if (s.activeTab === 'remote' && mode !== s.network) s.setActiveTab('send');
                }}>
                {mode === 'lan' ? (lang === 'ar' ? 'شبكة محلية (LAN)' : 'Local network (LAN)') :
                  (lang === 'ar' ? 'عبر الإنترنت' : 'Via internet')}
              </button>
            ))}
          </div>
        )}

        {s.activeTab === 'send' && (
          <BeamSendTab
            lang={lang}
            reader={reader}
            mediaFile={mediaFile}
            beamFileInputRef={s.beamFileInputRef}
            isScanningCamera={s.isScanningCamera}
            videoRef={s.videoRef}
            stopCamera={s.stopCamera}
            startCameraScanner={s.startCameraScanner}
            cameraError={s.cameraError}
            recentRooms={s.recentRooms}
            recentLanTargets={s.recentLanTargets}
            onClearRecentLanTargets={s.handleClearRecentLanTargets}
            setTargetRoomCode={s.setTargetRoomCode}
            handleBeamDocument={s.handleBeamDocument}
            handlePairAsRemote={s.handlePairAsRemote}
            transfer={s.transfer}
            transferPhaseText={s.transferPhaseText}
            beamError={s.beamError || mediaError || null}
            targetRoomCode={s.targetRoomCode}
            isSending={s.isSending}
            sendSuccess={s.sendSuccess}
            local={s.network === 'lan'}
            pairingBusy={s.lanBusy}
          />
        )}

        {s.activeTab === 'receive' && (
          <BeamReceiveTab
            lang={lang}
            reader={reader}
            connectedRemotePeer={s.connectedRemotePeer}
            receiverRoomCode={s.receiverRoomCode}
            onSetBoardOpen={onSetBoardOpen}
            onClose={onClose}
            receiverFileInputRef={s.receiverFileInputRef}
            transfer={s.transfer}
            transferPhaseText={s.transferPhaseText}
            beamError={s.beamError}
            smartboardUrl={s.smartboardUrl}
            copiedCode={s.copiedCode}
            handleCopyCode={s.handleCopyCode}
            handleRegenerateCode={s.handleRegenerateCode}
            peerLeft={s.peerLeft}
            peer={s.peer}
            connStatus={s.connStatus}
            local={s.network === 'lan'}
            lanCode={s.lanCode}
            lanAddresses={s.lanAddresses}
            lanAddress={s.selectedAddress}
            selectLanAddress={s.setLanAddress}
            pairingBusy={s.lanBusy}
          />
        )}

        {s.activeTab === 'offline' && (
          <BeamOfflineTab lang={lang} offlineFileInputRef={s.offlineFileInputRef} />
        )}

        {s.activeTab === 'remote' && (
          <BeamRemoteTab
            lang={lang}
            reader={reader}
            mediaFile={mediaFile}
            isReceiverAcknowledged={s.isReceiverAcknowledged}
            peerLeft={s.peerLeft}
            connectedRoom={s.network === 'lan' ? 'LAN' : s.connectedRoom}
            remoteDocTitle={s.remoteDocTitle}
            remoteTotal={s.remoteTotal}
            activePage={s.activePage}
            activeTotal={s.activeTotal}
            activeDocTitle={s.activeDocTitle}
            isSending={s.isSending}
            uploadProgress={s.uploadProgress}
            beamError={s.beamError || mediaError}
            onDisconnectToSend={() => s.setActiveTab('send')}
            beamFileInputRef={s.beamFileInputRef}
            handleBeamDocument={s.handleBeamDocument}
            handleRemotePrev={s.handleRemotePrev}
            handleRemoteNext={s.handleRemoteNext}
            onReconnect={s.network === 'lan' && s.connStatus === 'error' ? () => s.handlePairAsRemote() : undefined}
          />
        )}

        <BeamHiddenFileInputs
          beamFileInputRef={s.beamFileInputRef}
          offlineFileInputRef={s.offlineFileInputRef}
          receiverFileInputRef={s.receiverFileInputRef}
          onBeamFileDirect={s.handleBeamFileDirect}
          onOfflineFile={s.openPickedFile}
          onReceiverFile={s.openPickedFile}
        />
      </div>
    </div>
  );
};
