import React, { useRef, useState, useEffect } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  FileText,
  HardDrive,
  Palette,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import type { ThemeMode } from '../types';
import type { RecentDocItem } from '../utils/storage';
import {
  getRecentDocumentsList,
  removeDocumentFromStorage,
  clearAllStoredDocuments
} from '../utils/storage';
import { OtiumLogo } from './OtiumLogo';

interface WelcomeScreenProps {
  currentTheme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  onOpenFile: (file: File) => void;
  onOpenSample: () => void;
  onOpenRecent: (doc: RecentDocItem) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  currentTheme,
  onThemeChange,
  onOpenFile,
  onOpenSample,
  onOpenRecent
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [recents, setRecents] = useState<RecentDocItem[]>([]);
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  const loadRecents = async () => {
    const docs = await getRecentDocumentsList();
    setRecents(docs);
  };

  useEffect(() => {
    loadRecents();
  }, []);

  const themes: { id: ThemeMode; label: string; name: string; dot: string }[] = [
    { id: 'paper', label: 'Paper (ورقي دافئ)', name: 'Paper', dot: '#d4c5a9' },
    { id: 'midnight', label: 'Midnight (ليلي عميق)', name: 'Midnight', dot: '#38bdf8' },
    { id: 'eink', label: 'E-Ink (حبر إلكتروني)', name: 'E-Ink', dot: '#737373' },
    { id: 'amber', label: 'Amber (كهرماني هادئ)', name: 'Amber', dot: '#f59e0b' },
    { id: 'pure', label: 'Pure (أبيض استوديو)', name: 'Pure', dot: '#94a3b8' }
  ];

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

    const timeStr = date.toLocaleTimeString('ar-u-nu-latn', {
      hour: '2-digit',
      minute: '2-digit'
    });

    if (isToday) {
      return `اليوم، ${timeStr}`;
    }
    if (isYesterday) {
      return `أمس، ${timeStr}`;
    }

    return date.toLocaleDateString('ar-u-nu-latn', {
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

  // Dynamic ambient lighting based on chosen theme
  const getAmbientColors = () => {
    switch (currentTheme) {
      case 'midnight':
        return {
          glow1: 'bg-sky-500/12',
          glow2: 'bg-indigo-600/15'
        };
      case 'amber':
        return {
          glow1: 'bg-amber-500/18',
          glow2: 'bg-orange-600/12'
        };
      case 'eink':
        return {
          glow1: 'bg-neutral-500/10',
          glow2: 'bg-neutral-700/10'
        };
      case 'pure':
        return {
          glow1: 'bg-sky-400/10',
          glow2: 'bg-amber-300/10'
        };
      case 'paper':
      default:
        return {
          glow1: 'bg-amber-500/12',
          glow2: 'bg-indigo-500/10'
        };
    }
  };

  const ambient = getAmbientColors();

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center p-6 bg-gradient-to-b from-neutral-950 via-[#0e0d0b] to-black text-neutral-100 select-none overflow-hidden">
      
      {/* Top Floating Theme Switcher */}
      <div className="absolute top-5 inset-x-0 z-30 flex justify-center sm:justify-end px-6 pointer-events-none">
        <div className="pointer-events-auto relative">
          <div className="flex items-center gap-1.5 p-1 rounded-full bg-neutral-900/85 hover:bg-neutral-900 border border-white/10 hover:border-amber-400/30 shadow-2xl backdrop-blur-2xl transition-all">
            
            {/* Direct Swatches */}
            <div className="flex items-center gap-0.5 px-1">
              {themes.map((t) => {
                const isSelected = currentTheme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => onThemeChange(t.id)}
                    title={t.label}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all duration-200 ${
                      isSelected
                        ? 'bg-amber-500/20 text-amber-200 font-medium border border-amber-400/40 shadow-xs'
                        : 'hover:bg-white/5 text-neutral-400 hover:text-neutral-200 border border-transparent'
                    }`}
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-full transition-all ${
                        isSelected ? 'scale-110 ring-2 ring-amber-400/60' : 'opacity-70'
                      }`}
                      style={{ backgroundColor: t.dot }}
                    />
                    <span className="text-[11px] capitalize hidden md:inline">
                      {t.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Dropdown trigger button for full labels */}
            <div className="w-[1px] h-4 bg-white/10 mx-0.5" />
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              title="قائمة الثيمات الكاملة"
              className="p-1 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors flex items-center gap-1 pr-1.5"
            >
              <Palette className="w-3.5 h-3.5 text-amber-400" />
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showThemeMenu ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Expanded Dropdown Menu */}
          {showThemeMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowThemeMenu(false)}
              />
              <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl bg-neutral-900/98 border border-white/10 p-1.5 shadow-2xl backdrop-blur-2xl z-50 text-neutral-200 animate-in fade-in zoom-in-95 duration-150">
                <div className="text-[10px] uppercase font-mono px-2.5 py-1 text-neutral-500 font-semibold tracking-wider">
                  بيئات القراءة (Themes)
                </div>
                {themes.map((t) => {
                  const isSelected = currentTheme === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        onThemeChange(t.id);
                        setShowThemeMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors ${
                        isSelected
                          ? 'bg-amber-500/15 text-amber-200 font-medium border border-amber-400/30'
                          : 'hover:bg-white/5 text-neutral-300 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-black/30 shadow-xs shrink-0"
                          style={{ backgroundColor: t.dot }}
                        />
                        <span>{t.label}</span>
                      </div>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Dynamic Ambient Glows matching chosen theme */}
      <div className={`absolute top-1/6 left-1/2 -translate-x-1/2 w-[34rem] h-[20rem] ${ambient.glow1} rounded-full blur-[110px] pointer-events-none transition-all duration-700 animate-glow-amber`} />
      <div className={`absolute bottom-1/5 right-1/4 w-[26rem] h-[18rem] ${ambient.glow2} rounded-full blur-[100px] pointer-events-none transition-all duration-700 animate-glow-indigo`} />

      <div className="relative max-w-xl w-full flex flex-col items-center text-center space-y-6 z-10 pt-8 sm:pt-4">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center space-y-2">
          <div className="relative group">
            <div className="absolute -inset-1.5 rounded-2xl bg-amber-500/20 blur-md opacity-60 group-hover:opacity-100 transition duration-500" />
            <div className="relative p-3.5 rounded-2xl bg-neutral-900/90 border border-amber-400/25 shadow-xl backdrop-blur-2xl">
              <OtiumLogo size={42} />
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-neutral-100 to-amber-200 font-sans">
            Otium
          </h1>
        </div>

        {/* Dropzone Card */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`w-full p-8 rounded-3xl border-2 border-dashed transition-all duration-300 cursor-pointer flex flex-col items-center justify-center gap-3 backdrop-blur-2xl ${
            isDragging
              ? 'border-amber-400 bg-amber-500/15 scale-[1.02] shadow-[0_0_40px_rgba(245,158,11,0.25)]'
              : 'border-white/10 bg-neutral-900/60 hover:border-amber-400/40 hover:bg-neutral-900/85 hover:shadow-[0_16px_40px_rgba(245,158,11,0.12)] hover:-translate-y-0.5 shadow-2xl'
          }`}
        >
          <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-amber-500/20 via-amber-400/10 to-neutral-800 border border-amber-400/25 flex items-center justify-center text-amber-300 shadow-md">
            <Upload className="w-6 h-6 text-amber-300" />
          </div>

          <div className="space-y-1">
            <div className="text-sm font-semibold text-neutral-100">
              اسحب وأفلت ملف PDF هنا
            </div>
            <div className="text-xs text-neutral-400">
              أو انقر للاستعراض من جهازك
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
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs sm:text-sm font-medium bg-neutral-900/80 hover:bg-neutral-800 text-neutral-200 border border-white/10 hover:border-amber-400/35 transition-all hover:scale-[1.01] active:scale-95 shadow-md group"
          >
            <BookOpen className="w-4 h-4 text-amber-400 group-hover:text-amber-300 transition-colors" />
            <span>فتح الوثيقة النموذجية للمعاينة</span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
          </button>
        </div>

        {/* Stored Recent Files with Date & Size */}
        {recents.length > 0 && (
          <div className="w-full text-right pt-4 border-t border-white/10 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>الملفات المحفوظة</span>
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
                title="مسح كل الملفات المحفوظة"
              >
                <Trash2 className="w-3 h-3" />
                <span>مسح الكل</span>
              </button>
            </div>

            <div className="space-y-2">
              {recents.map((r) => (
                <div
                  key={r.id}
                  onClick={() => onOpenRecent(r)}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-900/60 hover:bg-neutral-900/95 cursor-pointer border border-white/5 hover:border-amber-400/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg group"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-1">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 text-amber-400 group-hover:scale-105 transition-transform">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col min-w-0 gap-1 text-right">
                      <span className="truncate font-medium text-xs sm:text-sm text-neutral-200 group-hover:text-amber-200 transition-colors">
                        {r.name}
                      </span>
                      <div className="flex items-center gap-2.5 text-[11px] text-neutral-400 font-mono">
                        <span className="text-amber-400/90 font-sans">
                          صفحة {r.lastPage} / {r.totalPages}
                        </span>
                        <span className="text-neutral-600">•</span>
                        <span className="flex items-center gap-1 font-sans text-neutral-400">
                          <Calendar className="w-3 h-3 text-neutral-500 shrink-0" />
                          <span>{formatDate(r.lastOpened)}</span>
                        </span>
                        <span className="text-neutral-600">•</span>
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
                      title="حذف من السجل"
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-70 hover:opacity-100 hover:bg-rose-500/20 text-neutral-400 hover:text-rose-400 transition-all"
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
