import React, { useRef, useState, useEffect } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Calendar,
  Clock,
  FileText,
  HardDrive,
  Trash2,
  Upload,
  X
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

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center p-6 bg-gradient-to-b from-neutral-950 via-[#0e0d0b] to-black text-neutral-100 select-none overflow-hidden">
      
      {/* Soft Ambient Glows */}
      <div className="absolute top-1/6 left-1/2 -translate-x-1/2 w-[34rem] h-[20rem] bg-amber-500/12 rounded-full blur-[110px] pointer-events-none animate-glow-amber" />
      <div className="absolute bottom-1/5 right-1/4 w-[26rem] h-[18rem] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none animate-glow-indigo" />

      <div className="relative max-w-xl w-full flex flex-col items-center text-center space-y-6 z-10">
        
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
