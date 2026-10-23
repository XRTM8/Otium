import React, { useRef, useState, useEffect } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  FileText,
  Globe,
  HardDrive,
  Palette,
  Trash2,
  Upload,
  X,
  Layers
} from 'lucide-react';
import type { ThemeMode, PaperStyle } from '../types';
import type { Language } from '../utils/translations';
import { getTranslations } from '../utils/translations';
import type { RecentDocItem } from '../utils/storage';
import {
  getRecentDocumentsList,
  removeDocumentFromStorage,
  clearAllStoredDocuments
} from '../utils/storage';
import { OtiumLogo } from './OtiumLogo';

interface WelcomeScreenProps {
  currentTheme: ThemeMode;
  currentPaperStyle: PaperStyle;
  currentLang: Language;
  onThemeChange: (theme: ThemeMode) => void;
  onPaperStyleChange: (style: PaperStyle) => void;
  onToggleLanguage: () => void;
  onOpenFile: (file: File) => void;
  onOpenSample: () => void;
  onOpenRecent: (doc: RecentDocItem) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  currentTheme,
  currentPaperStyle,
  currentLang,
  onThemeChange,
  onPaperStyleChange,
  onToggleLanguage,
  onOpenFile,
  onOpenSample,
  onOpenRecent
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [recents, setRecents] = useState<RecentDocItem[]>([]);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showPaperMenu, setShowPaperMenu] = useState(false);

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
    { id: 'parchment', label: t.themes.parchment, dot: '#d97706' },
    { id: 'amber', label: t.themes.amber, dot: '#f59e0b' },
    { id: 'eink', label: t.themes.eink, dot: '#a3a3a3' },
    { id: 'pure', label: t.themes.pure, dot: '#818cf8' }
  ];

  const activeThemeMeta = themesList.find((th) => th.id === currentTheme) || themesList[0];

  const paperStylesList: { id: PaperStyle; label: string; iconBg: string }[] = [
    { id: 'smooth', label: t.paperStyles.smooth, iconBg: '#ffffff' },
    { id: 'book', label: t.paperStyles.book, iconBg: '#fdfbf7' },
    { id: 'parchment', label: t.paperStyles.parchment, iconBg: '#f7f1e1' },
    { id: 'linen', label: t.paperStyles.linen, iconBg: '#f9f8f5' },
    { id: 'kraft', label: t.paperStyles.kraft, iconBg: '#f4ede1' },
    { id: 'moleskine', label: t.paperStyles.moleskine, iconBg: '#faf6ee' }
  ];

  const activePaperMeta = paperStylesList.find((p) => p.id === currentPaperStyle) || paperStylesList[0];

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

  // Comprehensive Theme Styling Engine that modifies EVERYTHING (Logo, Name, Glows, Borders, Cards)
  const getThemeStyling = () => {
    switch (currentTheme) {
      case 'amoled':
        return {
          containerBg: 'bg-black',
          glow1: 'bg-emerald-500/10',
          glow2: 'bg-teal-600/8',
          logoGlow: 'bg-emerald-500/20',
          logoBorder: 'border-emerald-400/40',
          nameGradient: 'from-white via-emerald-100 to-emerald-400 drop-shadow-[0_0_25px_rgba(16,185,129,0.35)]',
          dropzoneBorder: 'hover:border-emerald-400/50 hover:shadow-[0_16px_40px_rgba(16,185,129,0.2)]',
          dropzoneIcon: 'bg-gradient-to-tr from-emerald-500/25 via-emerald-400/15 to-neutral-900 border-emerald-400/35 text-emerald-300',
          sampleBtn: 'hover:border-emerald-400/40 text-emerald-400',
          fileIconBox: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
          fileHoverText: 'group-hover:text-emerald-200',
          accentColor: '#10b981'
        };
      case 'parchment':
        return {
          containerBg: 'bg-gradient-to-b from-[#16100a] via-[#0f0b07] to-black',
          glow1: 'bg-amber-600/16',
          glow2: 'bg-yellow-700/12',
          logoGlow: 'bg-amber-600/25',
          logoBorder: 'border-amber-500/40',
          nameGradient: 'from-amber-100 via-yellow-200 to-amber-600 drop-shadow-[0_0_25px_rgba(217,119,6,0.35)]',
          dropzoneBorder: 'hover:border-amber-500/50 hover:shadow-[0_16px_40px_rgba(217,119,6,0.22)]',
          dropzoneIcon: 'bg-gradient-to-tr from-amber-600/25 via-yellow-500/15 to-neutral-800 border-amber-500/35 text-amber-300',
          sampleBtn: 'hover:border-amber-500/40 text-amber-400',
          fileIconBox: 'bg-amber-600/10 border-amber-600/20 text-amber-400',
          fileHoverText: 'group-hover:text-amber-200',
          accentColor: '#d97706'
        };
      case 'midnight':
        return {
          containerBg: 'bg-gradient-to-b from-[#060a14] via-[#04060d] to-black',
          glow1: 'bg-sky-500/18',
          glow2: 'bg-indigo-600/22',
          logoGlow: 'bg-sky-500/25',
          logoBorder: 'border-sky-400/40',
          nameGradient: 'from-white via-sky-100 to-sky-400 drop-shadow-[0_0_25px_rgba(56,189,248,0.35)]',
          dropzoneBorder: 'hover:border-sky-400/50 hover:shadow-[0_16px_40px_rgba(56,189,248,0.18)]',
          dropzoneIcon: 'bg-gradient-to-tr from-sky-500/25 via-sky-400/15 to-neutral-800 border-sky-400/35 text-sky-300',
          sampleBtn: 'hover:border-sky-400/40 text-sky-400',
          fileIconBox: 'bg-sky-500/10 border-sky-500/20 text-sky-400',
          fileHoverText: 'group-hover:text-sky-200',
          accentColor: '#38bdf8'
        };
      case 'amber':
        return {
          containerBg: 'bg-gradient-to-b from-[#140d06] via-[#0d0803] to-black',
          glow1: 'bg-amber-600/22',
          glow2: 'bg-orange-600/18',
          logoGlow: 'bg-orange-500/25',
          logoBorder: 'border-amber-400/40',
          nameGradient: 'from-amber-100 via-orange-200 to-amber-500 drop-shadow-[0_0_30px_rgba(245,158,11,0.4)]',
          dropzoneBorder: 'hover:border-orange-400/50 hover:shadow-[0_16px_40px_rgba(245,158,11,0.22)]',
          dropzoneIcon: 'bg-gradient-to-tr from-orange-500/25 via-amber-400/15 to-neutral-800 border-amber-400/35 text-amber-300',
          sampleBtn: 'hover:border-amber-400/40 text-amber-400',
          fileIconBox: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
          fileHoverText: 'group-hover:text-amber-200',
          accentColor: '#f59e0b'
        };
      case 'eink':
        return {
          containerBg: 'bg-gradient-to-b from-neutral-950 via-neutral-900 to-black',
          glow1: 'bg-neutral-500/12',
          glow2: 'bg-neutral-700/12',
          logoGlow: 'bg-neutral-300/15',
          logoBorder: 'border-white/25',
          nameGradient: 'from-white via-neutral-100 to-neutral-400 drop-shadow-none',
          dropzoneBorder: 'hover:border-white/35 hover:shadow-[0_16px_40px_rgba(255,255,255,0.08)]',
          dropzoneIcon: 'bg-gradient-to-tr from-neutral-500/20 via-neutral-400/10 to-neutral-800 border-white/25 text-neutral-200',
          sampleBtn: 'hover:border-white/30 text-neutral-200',
          fileIconBox: 'bg-white/10 border-white/15 text-neutral-200',
          fileHoverText: 'group-hover:text-white',
          accentColor: '#a3a3a3'
        };
      case 'pure':
        return {
          containerBg: 'bg-gradient-to-b from-[#090b14] via-[#06070e] to-black',
          glow1: 'bg-indigo-500/18',
          glow2: 'bg-sky-500/14',
          logoGlow: 'bg-indigo-500/22',
          logoBorder: 'border-indigo-400/35',
          nameGradient: 'from-white via-indigo-100 to-indigo-400 drop-shadow-[0_0_20px_rgba(129,140,248,0.25)]',
          dropzoneBorder: 'hover:border-indigo-400/45 hover:shadow-[0_16px_40px_rgba(129,140,248,0.16)]',
          dropzoneIcon: 'bg-gradient-to-tr from-indigo-500/25 via-indigo-400/15 to-neutral-800 border-indigo-400/35 text-indigo-300',
          sampleBtn: 'hover:border-indigo-400/40 text-indigo-400',
          fileIconBox: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
          fileHoverText: 'group-hover:text-indigo-200',
          accentColor: '#818cf8'
        };
      case 'paper':
      default:
        return {
          containerBg: 'bg-gradient-to-b from-neutral-950 via-[#100e0a] to-black',
          glow1: 'bg-amber-500/14',
          glow2: 'bg-yellow-600/10',
          logoGlow: 'bg-amber-500/20',
          logoBorder: 'border-amber-400/30',
          nameGradient: 'from-white via-amber-100 to-amber-300 drop-shadow-[0_0_20px_rgba(245,158,11,0.2)]',
          dropzoneBorder: 'hover:border-amber-400/40 hover:shadow-[0_16px_40px_rgba(245,158,11,0.12)]',
          dropzoneIcon: 'bg-gradient-to-tr from-amber-500/20 via-amber-400/10 to-neutral-800 border-amber-400/25 text-amber-300',
          sampleBtn: 'hover:border-amber-400/35 text-amber-400',
          fileIconBox: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
          fileHoverText: 'group-hover:text-amber-200',
          accentColor: '#d4c5a9'
        };
    }
  };

  const style = getThemeStyling();

  return (
    <div
      dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
      className={`relative min-h-screen w-full flex flex-col items-center justify-center p-6 ${style.containerBg} text-neutral-100 select-none overflow-hidden transition-colors duration-700`}
    >
      
      {/* Top Floating Action Bar (Clean Dropdown-only Theme Picker + Language Switcher) */}
      <div className="absolute top-4 sm:top-5 inset-x-0 z-30 flex items-center justify-between px-4 sm:px-8 pointer-events-none">
        
        {/* Language Switch Button */}
        <div className="pointer-events-auto">
          <button
            onClick={onToggleLanguage}
            title={currentLang === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-900/85 hover:bg-neutral-900 border border-white/10 hover:border-amber-400/30 shadow-xl backdrop-blur-2xl text-xs text-neutral-200 transition-all duration-200 active:scale-95"
          >
            <Globe className="w-3.5 h-3.5 text-neutral-400" />
            <span className="font-mono text-[11px] font-semibold tracking-wider">
              {currentLang === 'ar' ? 'EN' : 'عربي'}
            </span>
          </button>
        </div>

        {/* Top Controls: Paper Style Selector + Theme Picker Dropdown */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Paper Style Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowPaperMenu(!showPaperMenu);
                setShowThemeMenu(false);
              }}
              title={t.paperStyleLabel}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900/85 hover:bg-neutral-900 border border-white/10 hover:border-amber-400/30 shadow-xl backdrop-blur-2xl text-xs transition-all duration-200 active:scale-95"
            >
              <span
                className="w-2.5 h-2.5 rounded-xs border border-black/30 transition-colors"
                style={{ backgroundColor: activePaperMeta.iconBg }}
              />
              <span className="font-medium text-[11px] text-neutral-200 hidden sm:inline">
                {activePaperMeta.label.split(' ')[0]}
              </span>
              <Layers className="w-3.5 h-3.5 text-neutral-400" />
              <ChevronDown className={`w-3 h-3 text-neutral-400 transition-transform duration-200 ${showPaperMenu ? 'rotate-180' : ''}`} />
            </button>

            {/* Paper Dropdown Panel */}
            {showPaperMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowPaperMenu(false)}
                />
                <div
                  className={`absolute ${currentLang === 'ar' ? 'left-0 sm:right-auto' : 'right-0 sm:left-auto'} top-full mt-2 w-56 rounded-2xl bg-neutral-900/98 border border-white/10 p-1.5 shadow-2xl backdrop-blur-2xl z-50 text-neutral-200 animate-in fade-in zoom-in-95 duration-150`}
                >
                  <div className="text-[10px] uppercase font-mono px-2.5 py-1 text-neutral-500 font-semibold tracking-wider">
                    {t.paperStylesTitle}
                  </div>
                  {paperStylesList.map((p) => {
                    const isSelected = currentPaperStyle === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          onPaperStyleChange(p.id);
                          setShowPaperMenu(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors ${
                          isSelected
                            ? 'bg-white/15 text-white font-medium border border-white/10'
                            : 'hover:bg-white/5 text-neutral-300 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <span
                            className="w-3.5 h-3.5 rounded-xs border border-black/30 shadow-xs shrink-0"
                            style={{ backgroundColor: p.iconBg }}
                          />
                          <span className="truncate">{p.label}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Theme Picker Dropdown Trigger (Only opens when clicked) */}
          <div className="relative">
            <button
              onClick={() => {
                setShowThemeMenu(!showThemeMenu);
                setShowPaperMenu(false);
              }}
              title={t.themeLabel}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900/85 hover:bg-neutral-900 border border-white/10 hover:border-amber-400/30 shadow-xl backdrop-blur-2xl text-xs transition-all duration-200 active:scale-95"
            >
              <span
                className="w-2.5 h-2.5 rounded-full ring-2 ring-white/15 transition-colors"
                style={{ backgroundColor: activeThemeMeta.dot }}
              />
              <span className="font-medium text-[11px] text-neutral-200">
                {activeThemeMeta.label}
              </span>
              <Palette className="w-3.5 h-3.5 text-neutral-400" />
              <ChevronDown className={`w-3 h-3 text-neutral-400 transition-transform duration-200 ${showThemeMenu ? 'rotate-180' : ''}`} />
            </button>

            {/* Theme Dropdown Panel */}
            {showThemeMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowThemeMenu(false)}
                />
                <div
                  className={`absolute ${currentLang === 'ar' ? 'left-0 sm:right-auto' : 'right-0 sm:left-auto'} top-full mt-2 w-52 rounded-2xl bg-neutral-900/98 border border-white/10 p-1.5 shadow-2xl backdrop-blur-2xl z-50 text-neutral-200 animate-in fade-in zoom-in-95 duration-150`}
                >
                  <div className="text-[10px] uppercase font-mono px-2.5 py-1 text-neutral-500 font-semibold tracking-wider">
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
                            ? 'bg-white/15 text-white font-medium border border-white/10'
                            : 'hover:bg-white/5 text-neutral-300 border border-transparent'
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
                          <Check className="w-3.5 h-3.5 text-white shrink-0" />
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

      <div className="relative max-w-xl w-full flex flex-col items-center text-center space-y-6 z-10 pt-8 sm:pt-4">
        
        {/* Brand Header with Theme-morphing Logo and Gradient Name */}
        <div className="flex flex-col items-center space-y-2.5">
          <div className="relative group">
            <div className={`absolute -inset-1.5 rounded-2xl ${style.logoGlow} blur-md opacity-75 group-hover:opacity-100 transition duration-500`} />
            <div className={`relative p-3.5 rounded-2xl bg-neutral-900/90 border ${style.logoBorder} shadow-2xl backdrop-blur-2xl transition-all duration-500`}>
              <OtiumLogo size={42} theme={currentTheme} />
            </div>
          </div>

          <h1 className={`text-3xl sm:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r ${style.nameGradient} font-sans transition-all duration-500`}>
            Otium
          </h1>
        </div>

        {/* Dropzone Card with Theme Accent Borders & Icon Box */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`w-full p-8 rounded-3xl border-2 border-dashed transition-all duration-300 cursor-pointer flex flex-col items-center justify-center gap-3 backdrop-blur-2xl ${
            isDragging
              ? 'border-white bg-white/10 scale-[1.02] shadow-2xl'
              : `border-white/10 bg-neutral-900/60 ${style.dropzoneBorder} hover:bg-neutral-900/85 hover:-translate-y-0.5 shadow-2xl`
          }`}
        >
          <div className={`w-13 h-13 rounded-2xl border flex items-center justify-center shadow-md transition-all duration-500 ${style.dropzoneIcon}`}>
            <Upload className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <div className="text-sm font-semibold text-neutral-100">
              {t.dropzoneTitle}
            </div>
            <div className="text-xs text-neutral-400">
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

        {/* Quick Sample Document Button */}
        <div className="flex items-center justify-center w-full">
          <button
            onClick={onOpenSample}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs sm:text-sm font-medium bg-neutral-900/80 hover:bg-neutral-800 text-neutral-200 border border-white/10 transition-all hover:scale-[1.01] active:scale-95 shadow-md group ${style.sampleBtn}`}
          >
            <BookOpen className="w-4 h-4 transition-colors" />
            <span>{t.openSample}</span>
            <ArrowUpRight className={`w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-all ${currentLang === 'ar' ? 'group-hover:-translate-x-0.5' : 'group-hover:translate-x-0.5'} group-hover:-translate-y-0.5`} />
          </button>
        </div>

        {/* Stored Recent Files with Theme-aware styling */}
        {recents.length > 0 && (
          <div className="w-full text-right pt-4 border-t border-white/10 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Clock className="w-3.5 h-3.5 opacity-80" />
                <span>{t.savedDocs}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-neutral-400 font-mono">
                  {recents.length}
                </span>
              </span>
              <button
                onClick={async () => {
                  await clearAllStoredDocuments();
                  setRecents([]);
                }}
                className="hover:text-rose-400 transition-colors flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-300"
                title={t.clearAll}
              >
                <Trash2 className="w-3 h-3" />
                <span>{t.clearAll}</span>
              </button>
            </div>

            <div className="space-y-2">
              {recents.map((r) => (
                <div
                  key={r.id}
                  onClick={() => onOpenRecent(r)}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-900/60 hover:bg-neutral-900/95 cursor-pointer border border-white/5 hover:border-white/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg group"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-1">
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform ${style.fileIconBox}`}>
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col min-w-0 gap-1 text-right">
                      <span className={`truncate font-medium text-xs sm:text-sm text-neutral-200 ${style.fileHoverText} transition-colors`}>
                        {r.name}
                      </span>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-neutral-400 font-mono">
                        <span className="font-sans font-medium text-neutral-300">
                          {t.pageOf(r.lastPage, r.totalPages)}
                        </span>
                        <span className="text-neutral-600 hidden sm:inline">•</span>
                        <span className="flex items-center gap-1 font-sans text-neutral-400">
                          <Calendar className="w-3 h-3 text-neutral-500 shrink-0" />
                          <span>{formatDate(r.lastOpened)}</span>
                        </span>
                        <span className="text-neutral-600 hidden sm:inline">•</span>
                        <span className="flex items-center gap-1 font-mono text-neutral-400">
                          <HardDrive className="w-3 h-3 text-neutral-500 shrink-0" />
                          <span>{formatSize(r.sizeBytes)}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 pl-1">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await removeDocumentFromStorage(r.id);
                        loadRecents();
                      }}
                      title={t.deleteTooltip}
                      className="p-1.5 rounded-lg opacity-70 sm:opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 text-neutral-400 hover:text-rose-400 transition-all"
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
