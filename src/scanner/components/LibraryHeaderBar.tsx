import React from 'react';
import { DownloadCloud, Settings, UploadCloud, X } from 'lucide-react';
import type { ThemeMode } from '../../core/types';
import type { Language } from '../../core/i18n/translations';
import { OtiumLogo } from './OtiumLogo';

export interface LibraryHeaderBarProps {
  theme: ThemeMode;
  lang: Language;
  documentCount: number;
  onExportBackup: () => void;
  onTriggerRestore: () => void;
  onOpenSettings?: () => void;
  onClose: () => void;
}

export const LibraryHeaderBar: React.FC<LibraryHeaderBarProps> = ({
  theme,
  lang,
  documentCount,
  onExportBackup,
  onTriggerRestore,
  onOpenSettings,
  onClose,
}) => {
  return (
    <div
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px) + 10px, 48px)',
      }}
      className="flex items-center justify-between px-5 pb-3.5 otium-chrome border-b border-white/[0.08]"
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.08]">
          <OtiumLogo size={20} theme={theme} />
          <span className="text-xs font-black tracking-widest text-white">OTIUM</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-gray-200">
            {lang === 'ar' ? 'مكتبة المستندات' : 'Document Library'}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-black border border-accent/25">
            {documentCount}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {documentCount > 0 && (
          <button
            onClick={onExportBackup}
            className="fluid-press p-2 rounded-full glass-button text-gray-300 active:text-accent cursor-pointer"
            title={lang === 'ar' ? 'نسخ احتياطي للمستندات (.otiumvault)' : 'Backup documents (.otiumvault)'}
          >
            <DownloadCloud className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={onTriggerRestore}
          className="fluid-press p-2 rounded-full glass-button text-gray-300 active:text-accent cursor-pointer"
          title={lang === 'ar' ? 'استرجاع من نسخة احتياطية (.otiumvault)' : 'Restore from backup (.otiumvault)'}
        >
          <UploadCloud className="w-4 h-4" />
        </button>

        {onOpenSettings && (
          <button type="button" onClick={onOpenSettings}
            className="fluid-press p-2 rounded-full glass-button text-gray-300 active:text-accent cursor-pointer"
            title={lang === 'ar' ? 'إعدادات المسح' : 'Scan settings'}>
            <Settings className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={onClose}
          className="fluid-press p-2 rounded-full glass-button text-gray-300 active:text-white cursor-pointer"
          title={lang === 'ar' ? 'إغلاق' : 'Close'}
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
