import { localStorage } from '../platform/storage';
import React, { useEffect, useRef, useState } from 'react';
import {
  RotateCcw,
  Type,
  X
} from 'lucide-react';
import type { FontFamilyId, ThemeMode, ViewMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import type { ThemeScheduleMode } from '../core/settings/preferences';
import { getTranslations } from '../core/i18n/translations';
import { useUpdateChecker } from '../core/updates/useUpdateChecker';
import type { RestoreSummary } from '../core/storage/backupFormat';
import type { SaveTextOutcome } from '../platform/saveFile';
import { getUpdateAdapter } from '../platform/updates';
import { isOcrLanguageCached, preloadOcrLanguage } from '../scanner/core/ocr/ocrEngine';
import type { CropMode } from '../scanner/core/types';
import { trapModalFocus } from '../core/utils/a11y';
import { FontsTabPanel } from './settings/FontsAndReadingTabs';
import { ReadingTabPanel } from './settings/ReadingTabPanel';
import { AboutTabPanel, DataTabPanel, ScannerTabPanel } from './settings/ScannerDataAboutTabs';
import { useSettingsSheetDrag } from './settings/useSettingsSheetDrag';
import { useSettingsBackupActions } from './settings/useSettingsBackupActions';

export type SettingsTab = 'fonts' | 'reading' | 'scanner' | 'data' | 'about';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFont?: FontFamilyId;
  onFontChange?: (font: FontFamilyId) => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  lang?: Language;
  /** Touch shells expose mobile-only reading preferences. */
  mobile?: boolean;
  mobileNavVisible?: boolean;
  onMobileNavVisibleChange?: (visible: boolean) => void;
  theme?: ThemeMode;
  onThemeChange?: (theme: ThemeMode) => void;
  themeSchedule?: ThemeScheduleMode;
  onThemeScheduleChange?: (mode: ThemeScheduleMode) => void;
  dayTheme?: ThemeMode;
  onDayThemeChange?: (theme: ThemeMode) => void;
  nightTheme?: ThemeMode;
  onNightThemeChange?: (theme: ThemeMode) => void;
  rememberDocTheme?: boolean;
  onRememberDocThemeChange?: (enabled: boolean) => void;
  keepScreenAwake?: boolean;
  onKeepScreenAwakeChange?: (enabled: boolean) => void;
  smartBoardEnabled?: boolean;
  onSmartBoardEnabledChange?: (enabled: boolean) => void;
  onResetDefaults?: () => void;
  onExportBackup?: () => Promise<SaveTextOutcome>;
  onImportBackup?: (text: string) => Promise<RestoreSummary>;
  initialTab?: SettingsTab;
}

const NOOP = () => {};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentFont = 'tajawal',
  onFontChange = NOOP,
  viewMode = 'continuous',
  onViewModeChange = NOOP,
  lang = 'ar',
  mobile = false,
  mobileNavVisible = true,
  onMobileNavVisibleChange,
  theme,
  onThemeChange,
  themeSchedule = 'manual',
  onThemeScheduleChange,
  dayTheme = 'paper',
  onDayThemeChange,
  nightTheme = 'amoled',
  onNightThemeChange,
  rememberDocTheme = true,
  onRememberDocThemeChange,
  keepScreenAwake = true,
  onKeepScreenAwakeChange,
  smartBoardEnabled = false,
  onSmartBoardEnabledChange,
  onResetDefaults = NOOP,
  onExportBackup,
  onImportBackup,
  initialTab
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || 'fonts');

  // Scanner Preferences
  const [cropMode, setCropMode] = useState<CropMode>(() => {
    try {
      return (localStorage.getItem('otium_scan_crop_mode') as CropMode) || 'auto';
    } catch {
      return 'auto';
    }
  });

  const [ocrCached, setOcrCached] = useState(() => isOcrLanguageCached('ara+eng'));
  const [isDownloadingOcr, setIsDownloadingOcr] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);

  const handleToggleCropMode = (mode: CropMode) => {
    setCropMode(mode);
    try {
      localStorage.setItem('otium_scan_crop_mode', mode);
    } catch (err) {
      console.warn('[SettingsModal] Failed to persist crop mode:', err);
    }
  };

  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const {
    sheetRef,
    isExpanded,
    isDragging,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useSettingsSheetDrag(isOpen, onClose);

  const handleDownloadOcr = async () => {
    setIsDownloadingOcr(true);
    setOcrProgress(0);
    try {
      const ok = await preloadOcrLanguage('ara+eng', (prog) => {
        setOcrProgress(prog);
      });
      if (ok) {
        setOcrCached(true);
      }
    } catch (err) {
      console.warn('[SettingsModal] Failed to preload OCR language pack:', err);
    } finally {
      setIsDownloadingOcr(false);
    }
  };

  const [updateAdapter] = useState(getUpdateAdapter);
  const updates = useUpdateChecker(updateAdapter);
  const t = getTranslations(lang);
  const ar = lang === 'ar';
  const { storage, dataBusy, dataNotice, importInputRef, handleExport, handleImport } =
    useSettingsBackupActions({
      isOpen,
      isDataTab: activeTab === 'data',
      ar,
      onExportBackup,
      onImportBackup,
    });

  useEffect(() => {
    if (!isOpen) {
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
        previousActiveElementRef.current = null;
      }
      return;
    }

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab' && sheetRef.current) {
        trapModalFocus(sheetRef.current, e);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, sheetRef]);

  if (!isOpen) return null;

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'fonts', label: ar ? 'الخطوط' : 'Fonts' },
    { id: 'reading', label: ar ? 'العرض' : 'Reading' },
    { id: 'scanner', label: ar ? 'الماسح' : 'Scanner' },
    { id: 'data', label: ar ? 'البيانات' : 'Data' },
    { id: 'about', label: ar ? 'حول التطبيق' : 'About' }
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.settingsTitle}
      dir={ar ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-5 select-none"
    >
      <div className="fixed inset-0 bg-scrim fluid-fade backdrop-blur-xs" onClick={onClose} />

      <div
        ref={sheetRef}
        className={`otium-panel relative z-10 flex w-full max-w-lg sm:max-w-xl flex-col overflow-hidden rounded-t-[32px] sm:rounded-3xl p-5 text-ink sm:p-6 shadow-2xl mobile-sheet sm:fluid-pop ${
          isExpanded
            ? 'h-[96dvh] max-h-[96dvh] sm:h-[720px] sm:max-h-[92vh]'
            : 'h-[82dvh] max-h-[85dvh] sm:h-[620px] sm:max-h-[88vh]'
        }`}
      >
        {/* Draggable Handle with extended touch hit-target */}
        <div
          role="slider"
          aria-label={ar ? 'مقبض سحب القائمة' : 'Sheet drag handle'}
          aria-valuenow={isExpanded ? 100 : 50}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="w-full py-3 -mt-3.5 mb-1 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none group shrink-0"
          title={
            ar
              ? isExpanded
                ? 'اسحب للأسفل لتصغير أو إغلاق القائمة'
                : 'اسحب للأعلى للتكبير، أو للأسفل للإغلاق'
              : isExpanded
              ? 'Drag down to reduce or close'
              : 'Drag up to expand, down to close'
          }
        >
          <div
            className={`h-1.5 rounded-full transition-all duration-200 ${
              isDragging
                ? 'w-16 bg-accent scale-y-125'
                : isExpanded
                ? 'w-14 bg-accent/80 group-hover:bg-accent'
                : 'w-12 bg-line-strong/60 group-hover:w-14 group-hover:bg-line-strong'
            }`}
          />
        </div>

        <div className="flex items-center justify-between pb-4 border-b border-line shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent">
              <Type className="w-4 h-4" />
            </div>
            <div>
              <h2 className={`text-sm sm:text-base font-bold text-ink ${ar ? '' : 'tracking-wide'}`}>
                {t.settingsTitle}
              </h2>
              <p className="text-[11px] text-ink-muted font-sans">
                {ar ? 'تخصيص الخطوط ونمط العرض لأفضل تجربة قراءة' : 'Tune typography and reading layout'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="fluid-press p-1.5 rounded-full hover:bg-hover text-ink-muted hover:text-ink cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="my-3 flex w-full shrink-0 gap-1 p-1 rounded-2xl bg-hover-subtle border border-line-subtle overflow-x-auto no-scrollbar scroll-smooth">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`fluid-press shrink-0 flex-1 min-w-fit py-2 px-2.5 text-[11px] sm:text-xs font-bold rounded-xl cursor-pointer text-center transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-surface-2 text-ink border border-line shadow-xs font-extrabold'
                  : 'text-ink-muted hover:text-ink hover:bg-hover border border-transparent'
              }`}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 py-1 space-y-4">
          {activeTab === 'fonts' && (
            <FontsTabPanel ar={ar} t={t} currentFont={currentFont} onFontChange={onFontChange} />
          )}

          {activeTab === 'reading' && (
            <ReadingTabPanel
              ar={ar}
              t={t}
              viewMode={viewMode}
              onViewModeChange={onViewModeChange}
              mobile={mobile}
              mobileNavVisible={mobileNavVisible}
              onMobileNavVisibleChange={onMobileNavVisibleChange}
              smartBoardEnabled={smartBoardEnabled}
              onSmartBoardEnabledChange={onSmartBoardEnabledChange}
              theme={theme}
              onThemeChange={onThemeChange}
              themeSchedule={themeSchedule}
              onThemeScheduleChange={onThemeScheduleChange}
              dayTheme={dayTheme}
              onDayThemeChange={onDayThemeChange}
              nightTheme={nightTheme}
              onNightThemeChange={onNightThemeChange}
              keepScreenAwake={keepScreenAwake}
              onKeepScreenAwakeChange={onKeepScreenAwakeChange}
              rememberDocTheme={rememberDocTheme}
              onRememberDocThemeChange={onRememberDocThemeChange}
            />
          )}

          {activeTab === 'scanner' && (
            <ScannerTabPanel
              ar={ar}
              cropMode={cropMode}
              onToggleCropMode={handleToggleCropMode}
              ocrCached={ocrCached}
              isDownloadingOcr={isDownloadingOcr}
              ocrProgress={ocrProgress}
              onDownloadOcr={() => void handleDownloadOcr()}
            />
          )}

          {activeTab === 'data' && (
            <DataTabPanel
              ar={ar}
              storage={storage}
              dataBusy={dataBusy}
              dataNotice={dataNotice}
              importInputRef={importInputRef}
              onExportBackup={onExportBackup}
              onImportBackup={onImportBackup}
              onExport={() => void handleExport()}
              onImportFile={(file) => void handleImport(file)}
            />
          )}

          {activeTab === 'about' && (
            <AboutTabPanel ar={ar} lang={lang} hasUpdateAdapter={Boolean(updateAdapter)} updates={updates} />
          )}
        </div>

        <div className="pt-3 border-t border-line flex items-center justify-between shrink-0 mt-2 pb-[max(0.25rem,env(safe-area-inset-bottom,0px))]">
          <button
            onClick={onResetDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-hover text-ink-muted hover:text-ink transition-colors text-xs cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.resetDefaults}</span>
          </button>

          <button
            onClick={onClose}
            className="btn-primary px-5 py-2 text-xs"
          >
            {ar ? 'تم وحفظ' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
};
