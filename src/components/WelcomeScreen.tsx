import React, { useRef, useState, useEffect } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Globe,
  HardDrive,
  Palette,
  ScanLine,
  Trash2,
  Upload,
  X,
  Settings2
} from 'lucide-react';
import type { ThemeMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { getTranslations } from '../core/i18n/translations';
import type { RecentDocItem } from '../core/storage/documents';
import {
  getRecentDocumentsList,
  removeDocumentFromStorage,
  clearAllStoredDocuments
} from '../core/storage/documents';
import { OtiumLogo } from './OtiumLogo';
import { triggerHaptic } from '../core/utils/haptics';

interface WelcomeScreenProps {
  currentTheme: ThemeMode;
  currentLang: Language;
  onThemeChange: (theme: ThemeMode) => void;
  onToggleLanguage: () => void;
  onOpenSettings?: () => void;
  onOpenFile: (file: File) => void;
  onOpenSample: () => void;
  onOpenRecent: (doc: RecentDocItem) => void;
  onOpenScanner?: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  currentTheme,
  currentLang,
  onThemeChange,
  onToggleLanguage,
  onOpenSettings,
  onOpenFile,
  onOpenSample,
  onOpenRecent,
  onOpenScanner
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [recents, setRecents] = useState<RecentDocItem[]>([]);
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  const t = getTranslations(currentLang);

  const loadRecents = async () => {
    const docs = await getRecentDocumentsList();
    setRecents(docs);
  };

  useEffect(() => {
    loadRecents();
  }, []);

  const themesList: { id: ThemeMode; label: string; dot: string }[] = [
    { id: 'paper', label: t.themes.paper, dot: '#d4c5a9' },
    { id: 'midnight', label: t.themes.midnight, dot: '#38bdf8' },
    { id: 'amoled', label: t.themes.amoled, dot: '#10b981' },
    { id: 'forest', label: t.themes.forest, dot: '#34d399' },
    { id: 'nordic', label: t.themes.nordic, dot: '#60a5fa' },
    { id: 'parchment', label: t.themes.parchment, dot: '#d97706' },
    { id: 'amber', label: t.themes.amber, dot: '#f59e0b' },
    { id: 'eink', label: t.themes.eink, dot: '#a3a3a3' },
    { id: 'pure', label: t.themes.pure, dot: '#818cf8' },
    { id: 'sakura', label: t.themes.sakura, dot: '#f472b6' }
  ];

  const activeThemeMeta = themesList.find((th) => th.id === currentTheme) || themesList[0];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        onOpenFile(file);
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onOpenFile(e.target.files[0]);
    }
  };

  const handleLaunchScanner = () => {
    if (onOpenScanner) {
      onOpenScanner();
    }
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    const now = new Date();

    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    const timeStr = date.toLocaleTimeString(currentLang === 'ar' ? 'ar-u-nu-latn' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });

    if (isToday) {
      return t.todayAt(timeStr);
    }
    if (isYesterday) {
      return t.yesterdayAt(timeStr);
    }

    return date.toLocaleDateString(currentLang === 'ar' ? 'ar-u-nu-latn' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Themes change accent tokens; surfaces and ink come from the global token layer.
  const style = {
    glow1: 'bg-accent/10',
    glow2: 'bg-accent/5',
    logoGlow: 'bg-accent/20',
    logoBorder: 'border-accent/30',
    nameGradient: 'from-ink via-accent to-accent-strong',
    dropzoneBorder: 'hover:border-accent/60',
    dropzoneIcon: 'bg-accent/10 border-accent/30 text-accent',
    sampleBtn: 'hover:border-accent/50 text-accent',
    fileIconBox: 'bg-accent/10 border-accent/25 text-accent',
    fileHoverText: 'group-hover:text-accent'
  };


  return (
    <div
      dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
      className="relative min-h-screen w-full flex flex-col items-center justify-start p-5 pt-16 sm:pt-14 pb-16 bg-[var(--app-bg)] text-ink select-none overflow-y-auto overflow-x-hidden transition-colors duration-700"
    >
      
      {/* Top Floating Action Bar with Safe Area Inset for mobile notches & status bars */}
      <div
        dir="ltr"
        style={{
          top: 'max(1rem, calc(env(safe-area-inset-top, 0px) + 0.6rem))'
        }}
        className="absolute inset-x-0 z-30 flex items-center justify-between px-4 sm:px-8 pointer-events-none"
      >
        
        {/* Language Switch & Settings Buttons */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={onToggleLanguage}
            title={currentLang === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}
            className="fluid-press flex items-center gap-1.5 px-3 py-1.5 rounded-full chrome-surface text-xs text-ink cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5 text-ink-muted" />
            <span className={`text-[11px] font-semibold ${currentLang === 'ar' ? 'font-mono tracking-wider' : 'font-sans'}`}>
              {currentLang === 'ar' ? 'EN' : 'عربي'}
            </span>
          </button>

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              title={t.settingsTitle}
              className="fluid-press flex items-center gap-1.5 px-3 py-1.5 rounded-full chrome-surface text-xs text-ink cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5 text-ink-muted" />
              <span className="text-[11px] font-medium hidden sm:inline">
                {t.settingsTitle}
              </span>
            </button>
          )}
        </div>

        {/* Top Controls: Theme Picker Dropdown */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Theme Picker Dropdown Trigger (Only opens when clicked) */}
          <div className="relative">
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              title={t.themeLabel}
              className="fluid-press flex items-center gap-2 px-3 py-1.5 rounded-full chrome-surface text-xs cursor-pointer"
            >
              <span
                className="w-2.5 h-2.5 rounded-full ring-2 ring-line-strong transition-colors"
                style={{ backgroundColor: activeThemeMeta.dot }}
              />
              <span className="font-medium text-[11px] text-ink">
                {activeThemeMeta.label}
              </span>
              <Palette className="w-3.5 h-3.5 text-ink-muted" />
              <ChevronDown className={`w-3 h-3 text-ink-muted transition-transform duration-200 ${showThemeMenu ? 'rotate-180' : ''}`} />
            </button>

            {/* Theme Dropdown Panel */}
            {showThemeMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowThemeMenu(false)}
                />
                <div
                  dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
                  className="chrome-surface absolute right-0 top-full mt-2 w-52 rounded-2xl p-1.5 z-50 text-ink fluid-pop shadow-2xl"
                >
                  <div className={`text-[10px] uppercase px-2.5 py-1 text-ink-faint font-semibold ${currentLang === 'ar' ? 'font-sans' : 'font-mono tracking-wider'}`}>
                    {t.readingThemesTitle}
                  </div>
                  {themesList.map((th) => {
                    const isSelected = currentTheme === th.id;
                    return (
                      <button
                        key={th.id}
                        onClick={() => {
                          onThemeChange(th.id);
                          setShowThemeMenu(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors ${
                          isSelected
                            ? 'bg-hover-strong text-ink font-medium border border-line'
                            : 'hover:bg-hover-subtle text-ink-muted border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-black/30 shadow-xs shrink-0"
                            style={{ backgroundColor: th.dot }}
                          />
                          <span>{th.label}</span>
                        </div>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-ink shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Dynamic Ambient Glows that match the chosen theme */}
      <div className={`absolute top-1/6 left-1/2 -translate-x-1/2 w-[34rem] h-[20rem] ${style.glow1} rounded-full blur-[110px] pointer-events-none transition-all duration-700 animate-glow-amber`} />
      <div className={`absolute bottom-1/5 right-1/4 w-[26rem] h-[18rem] ${style.glow2} rounded-full blur-[100px] pointer-events-none transition-all duration-700 animate-glow-indigo`} />

      <div className="relative max-w-xl w-full flex flex-col items-center text-center space-y-5 z-10 pt-2 sm:pt-4">
        
        {/* Brand Header with Theme-morphing Logo and Gradient Name */}
        <div className="flex flex-col items-center space-y-3">
          <div className="relative group cursor-default">
            <div className={`absolute -inset-1 rounded-3xl ${style.logoGlow} blur-xl opacity-75 group-hover:opacity-100 transition duration-500`} />
            <div className={`relative p-4 rounded-3xl bg-surface border ${style.logoBorder} shadow-2xl backdrop-blur-2xl group-hover:scale-105 transition-transform duration-300`}>
              <OtiumLogo theme={currentTheme} size={48} />
            </div>
          </div>

          <h1 className={`text-3xl sm:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r ${style.nameGradient} font-sans transition-all duration-500`}>
            Otium
          </h1>
        </div>

        {/* Quick Resume Hero Banner for most recent document */}
        {recents.length > 0 && recents[0]?.available && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              triggerHaptic('medium');
              onOpenRecent(recents[0]);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenRecent(recents[0]);
              }
            }}
            className="fluid-press w-full p-3.5 px-4 rounded-2xl chrome-surface border border-accent/30 hover:border-accent shadow-lg flex items-center justify-between gap-3 text-start cursor-pointer group transition-all duration-200"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shrink-0 group-hover:scale-105 transition-transform">
                <BookOpen className="w-5 h-5 text-accent" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-accent font-mono">
                  {currentLang === 'ar' ? 'متابعة القراءة' : 'Resume Reading'}
                </span>
                <span className="text-xs sm:text-sm font-bold text-ink truncate group-hover:text-accent transition-colors">
                  <bdi>{recents[0].name}</bdi>
                </span>
                <span className="text-[11px] text-ink-muted font-mono">
                  {t.pageOf(recents[0].lastPage, recents[0].totalPages)}
                  {recents[0].totalPages > 0 && (
                    <span className="ml-1 text-accent font-semibold">
                      ({Math.min(100, Math.round((recents[0].lastPage / recents[0].totalPages) * 100))}%)
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent text-on-accent text-xs font-semibold shrink-0 group-hover:bg-accent-strong shadow-xs transition-colors">
              <span>{currentLang === 'ar' ? 'متابعة' : 'Resume'}</span>
              <ArrowUpRight className="w-3.5 h-3.5 rtl:rotate-[-90deg]" />
            </div>
          </div>
        )}

        {/* Dropzone Card with Theme Accent Borders & Icon Box */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`w-full p-8 rounded-3xl border-2 border-dashed transition-all duration-300 cursor-pointer flex flex-col items-center justify-center gap-3 backdrop-blur-xl ${
            isDragging
              ? 'border-accent bg-accent/5 scale-[1.01] shadow-2xl'
              : 'border-line bg-surface/60 hover:border-accent/40 hover:bg-surface/85 hover:-translate-y-0.5 shadow-xl'
          }`}
        >
          <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center shadow-md transition-all duration-500 ${style.dropzoneIcon}`}>
            <Upload className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <div className="text-sm font-semibold text-ink">
              {t.dropzoneTitle}
            </div>
            <div className="text-xs text-ink-muted">
              {t.dropzoneSubtitle}
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>

        {/* Quick Actions: Companion Scanner & Sample Document */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 w-full">
          <button
            onClick={handleLaunchScanner}
            title={currentLang === 'ar' ? 'مسح كتاب أو مستند ورقي ضوئياً إلى ملف PDF' : 'Scan document with camera to PDF'}
            className="btn-secondary px-4 py-2 text-xs sm:text-sm cursor-pointer shadow-sm"
          >
            <ScanLine className="w-4 h-4 text-accent" />
            <span>{currentLang === 'ar' ? 'مسح مستند بالكاميرا' : 'Scan with Camera'}</span>
          </button>

          <button
            onClick={onOpenSample}
            className="fluid-press flex items-center gap-2 px-4 py-2 rounded-xl border border-line bg-surface/60 hover:bg-surface text-ink-muted hover:text-ink text-xs sm:text-sm font-medium shadow-sm cursor-pointer group"
          >
            <BookOpen className="w-4 h-4 text-accent" />
            <span>{t.openSample}</span>
            <ArrowUpRight className={`w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-all ${currentLang === 'ar' ? 'group-hover:-translate-x-0.5' : 'group-hover:translate-x-0.5'} group-hover:-translate-y-0.5`} />
          </button>
        </div>

        {/* Stored Recent Files with Theme-aware styling */}
        {recents.length > 0 && (
          <div className="w-full text-start pt-4 border-t border-line space-y-2.5">
            <div className="flex items-center justify-between text-xs text-ink-muted px-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Clock className="w-3.5 h-3.5 opacity-80" />
                <span>{t.savedDocs}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-hover-subtle border border-line text-ink-muted font-mono">
                  {recents.length}
                </span>
              </span>
              <button
                onClick={async () => {
                  await clearAllStoredDocuments();
                  setRecents([]);
                }}
                className="hover:text-danger-ink transition-colors flex items-center gap-1 text-[11px] text-ink-faint hover:text-ink-muted"
                title={t.clearAll}
              >
                <Trash2 className="w-3 h-3" />
                <span>{t.clearAll}</span>
              </button>
            </div>

            {/* Smooth Scrollable Slider for Recent Files (shows ~3 items cleanly, scrolls the rest) */}
            <div className="space-y-2 max-h-[220px] sm:max-h-[260px] overflow-y-auto overflow-x-hidden p-1 scrollbar-thin scrollbar-thumb-line-strong scrollbar-track-transparent overscroll-contain transition-all">
              {recents.map((r) => (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (!r.available) {
                      // The fingerprint is recovered from the bytes, so picking
                      // the original PDF reconnects its progress and notes.
                      fileInputRef.current?.click();
                      return;
                    }
                    onOpenRecent(r);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    if (!r.available) {
                      fileInputRef.current?.click();
                      return;
                    }
                    onOpenRecent(r);
                  }}
                  className={`fluid-press relative overflow-hidden flex items-center justify-between p-3.5 ps-4 rounded-2xl bg-surface/60 hover:bg-surface cursor-pointer border border-line-subtle hover:border-line-strong hover:-translate-y-0.5 hover:shadow-lg group ${
                    r.available ? '' : 'border-dashed'
                  }`}
                >
                  {/* Subtle Book Spine Accent on the leading edge */}
                  <div className="absolute inset-y-0 start-0 w-[3px] bg-accent/35 group-hover:bg-accent transition-colors duration-200" />
                  <div className="flex items-center gap-3 min-w-0 pr-1">
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform ${style.fileIconBox}`}>
                      <OtiumLogo theme={currentTheme} size={22} />
                    </div>
                    <div className="flex flex-col min-w-0 gap-1 text-start">
                      <span className={`truncate font-medium text-xs sm:text-sm text-ink ${style.fileHoverText} transition-colors`}>
                        <bdi>{r.name}</bdi>
                      </span>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-ink-muted font-mono">
                        <span className="font-sans font-medium text-ink-muted">
                          {t.pageOf(r.lastPage, r.totalPages)}
                          {r.totalPages > 0 && (
                            <span className="text-[10px] text-accent font-mono ml-1 mr-1">
                              ({Math.min(100, Math.round((r.lastPage / r.totalPages) * 100))}%)
                            </span>
                          )}
                        </span>
                        <span className="text-ink-faint hidden sm:inline">•</span>
                        <span className="flex items-center gap-1 font-sans text-ink-muted">
                          <Calendar className="w-3 h-3 text-ink-faint shrink-0" />
                          <span>{formatDate(r.lastOpened)}</span>
                        </span>
                        {r.available ? (
                          <>
                            <span className="text-ink-faint hidden sm:inline">•</span>
                            <span dir="ltr" className="inline-flex items-center gap-1 font-mono text-ink-muted">
                              <HardDrive className="w-3 h-3 text-ink-faint shrink-0" />
                              <span>{formatSize(r.sizeBytes)}</span>
                            </span>
                          </>
                        ) : (
                          <span className="flex items-center gap-1 rounded-full border border-accent/25 bg-accent/10 px-1.5 py-0.5 font-sans text-[10px] text-accent">
                            <Upload className="h-3 w-3 shrink-0" />
                            <span>{currentLang === 'ar' ? 'أعد استيراد الملف' : 'Re-import file'}</span>
                          </span>
                        )}
                      </div>

                      {r.totalPages > 0 && (
                        <div className="w-full h-0.5 bg-white/[0.08] rounded-full overflow-hidden mt-1.5">
                          <div
                            className="h-full bg-accent transition-all duration-300 rounded-full"
                            style={{
                              width: `${Math.min(100, Math.round((r.lastPage / r.totalPages) * 100))}%`
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 px-1">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await removeDocumentFromStorage(r.id);
                        loadRecents();
                      }}
                      title={t.deleteTooltip}
                      className="fluid-press p-2 rounded-xl opacity-75 sm:opacity-0 group-hover:opacity-100 text-ink-faint hover:text-rose-400 hover:bg-rose-500/10 active:bg-rose-500/20 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
