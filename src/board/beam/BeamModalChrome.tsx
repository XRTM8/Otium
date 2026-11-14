import React from 'react';
import { Cast, Radio, Smartphone, Tv, WifiOff, X } from 'lucide-react';
import type { Language } from '../../core/i18n/translations';
import { BEAM_MEDIA_ACCEPT } from '../../media/media';

export type BeamModalTab = 'send' | 'receive' | 'remote' | 'offline';

interface BeamModalChromeProps {
  lang: Language;
  activeTab: BeamModalTab;
  showRemoteTab: boolean;
  onSelectTab: (tab: BeamModalTab) => void;
  onClose: () => void;
}

export const BeamModalHeaderAndTabs: React.FC<BeamModalChromeProps> = ({
  lang,
  activeTab,
  showRemoteTab,
  onSelectTab,
  onClose,
}) => (
  <>
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
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label={lang === 'ar' ? 'إغلاق البث' : 'Close Beam'}
        className="p-1.5 rounded-xl hover:bg-hover text-ink-muted hover:text-ink transition-colors cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>

    {/* Segmented Mode Selector Pills */}
    <div className="flex items-center p-1.5 mx-4 mt-3 bg-hover-subtle/70 rounded-2xl border border-line/60 gap-1 select-none">
      <button
        type="button"
        onClick={() => onSelectTab('send')}
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
        onClick={() => onSelectTab('receive')}
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
        onClick={() => onSelectTab('offline')}
        className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
          activeTab === 'offline'
            ? 'bg-surface text-ink font-bold shadow-xs border border-line/60'
            : 'text-ink-muted hover:text-ink'
        }`}
      >
        <WifiOff className="w-3.5 h-3.5" />
        <span>{lang === 'ar' ? 'بدون إنترنت' : 'Offline'}</span>
      </button>

      {showRemoteTab && (
        <button
          type="button"
          onClick={() => onSelectTab('remote')}
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
  </>
);

interface BeamHiddenFileInputsProps {
  beamFileInputRef: React.RefObject<HTMLInputElement | null>;
  offlineFileInputRef: React.RefObject<HTMLInputElement | null>;
  receiverFileInputRef: React.RefObject<HTMLInputElement | null>;
  onBeamFileDirect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOfflineFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onReceiverFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const BeamHiddenFileInputs: React.FC<BeamHiddenFileInputsProps> = ({
  beamFileInputRef,
  offlineFileInputRef,
  receiverFileInputRef,
  onBeamFileDirect,
  onOfflineFile,
  onReceiverFile,
}) => (
  <>
    <input
      ref={beamFileInputRef}
      type="file"
      accept={`.pdf,application/pdf,${BEAM_MEDIA_ACCEPT}`}
      className="hidden"
      onChange={onBeamFileDirect}
    />
    <input
      ref={offlineFileInputRef}
      type="file"
      accept=".pdf,application/pdf"
      className="hidden"
      onChange={onOfflineFile}
    />
    <input
      ref={receiverFileInputRef}
      type="file"
      accept=".pdf,application/pdf"
      className="hidden"
      onChange={onReceiverFile}
    />
  </>
);
