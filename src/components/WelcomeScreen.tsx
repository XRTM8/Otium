import React, { useRef, useState, useEffect } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Clock,
  Sparkles,
  Trash2,
  Upload,
  X,
  Compass,
  Headphones,
  ShieldCheck
} from 'lucide-react';
import type { RecentDocItem } from '../utils/storage';
import {
  getRecentDocumentsList,
  removeDocumentFromStorage,
  clearAllStoredDocuments
} from '../utils/storage';
import { OtiumLogo } from './OtiumLogo';

interface WelcomeScreenProps {
  onOpenFile: (file: File) => void;
  onOpenSample: () => void;
  onOpenRecent: (doc: RecentDocItem) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onOpenFile,
  onOpenSample,
  onOpenRecent
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [recents, setRecents] = useState<RecentDocItem[]>([]);

  const loadRecents = async () => {
    const docs = await getRecentDocumentsList();
    setRecents(docs);
  };

  useEffect(() => {
    loadRecents();
  }, []);

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

  const formatSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center p-6 bg-gradient-to-b from-neutral-950 via-[#100f0d] to-black text-neutral-100 select-none overflow-hidden">
      
      {/* Dynamic Ambient Glow Lighting */}
      <div className="absolute top-1/6 left-1/2 -translate-x-1/2 w-[34rem] h-[22rem] bg-amber-500/15 rounded-full blur-[110px] pointer-events-none animate-glow-amber" />
      <div className="absolute bottom-1/5 right-1/4 w-[28rem] h-[20rem] bg-indigo-500/12 rounded-full blur-[100px] pointer-events-none animate-glow-indigo" />
      <div className="absolute top-1/3 left-1/4 w-72 h-72 bg-amber-600/10 rounded-full blur-[90px] pointer-events-none" />

      <div className="relative max-w-xl w-full flex flex-col items-center text-center space-y-7 z-10">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center space-y-3">
          {/* Vibe Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-mono font-medium tracking-wider bg-amber-500/10 text-amber-300 border border-amber-500/25 shadow-[0_0_20px_rgba(245,158,11,0.15)] backdrop-blur-xl">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>OTIUM • THE QUIET READER</span>
          </div>

          {/* Logo with Soft Golden Rim */}
          <div className="relative group">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-amber-500/30 to-amber-300/20 blur-md opacity-75 group-hover:opacity-100 transition duration-500" />
            <div className="relative p-3.5 rounded-2xl bg-neutral-900/90 border border-amber-400/30 shadow-2xl backdrop-blur-2xl">
              <OtiumLogo size={42} />
            </div>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-neutral-100 to-amber-200 font-sans">
              Otium
            </h1>
            <p className="text-xs sm:text-sm text-neutral-400 max-w-md mx-auto leading-relaxed">
              بيئة قراءة هادئة ومجردة للمستندات والكتب، مصممة للتركيز والتأمل المعرفي
            </p>
          </div>
        </div>

        {/* Dropzone Card with Warm Glassmorphism & Hover Lift */}
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
          <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-amber-500/25 via-amber-400/15 to-neutral-800 border border-amber-400/30 flex items-center justify-center text-amber-300 shadow-lg shadow-amber-500/15">
            <Upload className="w-6 h-6 text-amber-300" />
          </div>

          <div className="space-y-1">
            <div className="text-sm font-semibold text-neutral-100">
              اسحب وأفلت أي ملف PDF هنا
            </div>
            <div className="text-xs text-neutral-400">
              أو انقر لتصفح واختيار الملف من جهازك
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

        {/* Primary Action Button */}
        <div className="flex items-center justify-center gap-3 w-full">
          <button
            onClick={onOpenSample}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-medium bg-neutral-900/90 hover:bg-neutral-800 text-neutral-200 border border-white/10 hover:border-amber-400/40 transition-all hover:scale-[1.02] active:scale-95 shadow-lg group"
          >
            <BookOpen className="w-4 h-4 text-amber-400 group-hover:text-amber-300 transition-colors" />
            <span>فتح الوثيقة النموذجية للمعاينة</span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
          </button>
        </div>

        {/* Stored Recent Files (IndexedDB Real Instant Reopening) */}
        {recents.length > 0 && (
          <div className="w-full text-right pt-4 border-t border-white/10 space-y-2.5">
            <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono px-1">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>المستندات المحفوظة محلياً (فتح فوري)</span>
              </span>
              <button
                onClick={async () => {
                  await clearAllStoredDocuments();
                  setRecents([]);
                }}
                className="hover:text-rose-400 transition-colors flex items-center gap-1 text-neutral-500 hover:text-neutral-300"
                title="مسح كل الملفات المحفوظة"
              >
                <Trash2 className="w-3 h-3" />
                <span>مسح السجل</span>
              </button>
            </div>

            <div className="space-y-2">
              {recents.map((r) => (
                <div
                  key={r.id}
                  onClick={() => onOpenRecent(r)}
                  className="flex items-center justify-between p-3 rounded-2xl bg-neutral-900/60 hover:bg-neutral-900/95 cursor-pointer border border-white/5 hover:border-amber-400/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg text-xs group"
                >
                  <div className="flex items-center gap-2.5 max-w-[300px]">
                    <div className="w-2 h-2 rounded-full bg-amber-400/80 group-hover:bg-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.5)] shrink-0" />
                    <span className="truncate font-medium text-neutral-200 group-hover:text-white transition-colors">
                      {r.name}
                    </span>
                    {r.sizeBytes > 0 && (
                      <span className="text-[10px] text-neutral-500 font-mono shrink-0">
                        {formatSize(r.sizeBytes)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[11px] text-neutral-400 group-hover:text-amber-300 transition-colors">
                      صفحة {r.lastPage} / {r.totalPages}
                    </span>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await removeDocumentFromStorage(r.id);
                        loadRecents();
                      }}
                      title="إزالة هذا الملف من الذاكرة"
                      className="p-1 rounded-md opacity-0 group-hover:opacity-70 hover:opacity-100 hover:bg-rose-500/20 text-neutral-400 hover:text-rose-400 transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Feature Highlights Minimalist Trio */}
        <div className="grid grid-cols-3 gap-3 w-full pt-3 text-center">
          <div className="p-3.5 rounded-2xl bg-neutral-900/40 hover:bg-neutral-900/70 border border-white/5 hover:border-amber-500/25 transition-all duration-300 flex flex-col items-center gap-1.5 backdrop-blur-md">
            <Compass className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-medium text-neutral-200">5 بيئات قراءة</span>
            <span className="text-[10px] text-neutral-500">Paper, Midnight, E-Ink</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-neutral-900/40 hover:bg-neutral-900/70 border border-white/5 hover:border-sky-500/25 transition-all duration-300 flex flex-col items-center gap-1.5 backdrop-blur-md">
            <Headphones className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-medium text-neutral-200">مسطرة وصوت مطر</span>
            <span className="text-[10px] text-neutral-500">تركيز ذهني هادئ</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-neutral-900/40 hover:bg-neutral-900/70 border border-white/5 hover:border-emerald-500/25 transition-all duration-300 flex flex-col items-center gap-1.5 backdrop-blur-md">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-medium text-neutral-200">100% محلي وخاص</span>
            <span className="text-[10px] text-neutral-500">بدون خوادم أو تتبع</span>
          </div>
        </div>

        {/* Footer Minimalist Notice */}
        <div className="text-[10px] text-neutral-500 font-mono tracking-widest select-none pt-2">
          OTIUM • LOCAL-FIRST • ZERO TELEMETRY • HIGH FIDELITY
        </div>
      </div>
    </div>
  );
};
