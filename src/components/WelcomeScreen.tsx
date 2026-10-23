import React, { useRef, useState, useEffect } from 'react';
import { FileUp, BookOpen, Sparkles, Clock, Compass, ShieldCheck } from 'lucide-react';
import type { RecentDoc } from '../types';

interface WelcomeScreenProps {
  onOpenFile: (file: File) => void;
  onOpenSample: () => void;
  onOpenRecent: (doc: RecentDoc) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onOpenFile,
  onOpenSample,
  onOpenRecent
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [recents, setRecents] = useState<RecentDoc[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('vibe_recent_docs');
      if (stored) {
        setRecents(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
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

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-gradient-to-b from-neutral-950 via-neutral-900 to-black text-neutral-100 select-none">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-xl w-full flex flex-col items-center text-center z-10 space-y-6">
        {/* App Title & Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium tracking-wide bg-amber-500/10 text-amber-300 border border-amber-500/20">
          <Sparkles className="w-3.5 h-3.5" />
          <span>VIBE CODED ZEN READER</span>
        </div>

        <div className="space-y-2">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-neutral-100 via-neutral-200 to-amber-200">
            قارئ الـ Vibe الهادئ
          </h1>
          <p className="text-sm sm:text-base text-neutral-400 max-w-md mx-auto leading-relaxed">
            قارئ PDF احترافي فائق البساطة، مصمم خصيصاً للقراءة الصافية بدون أشرطة أدوات مزعجة أو مشتتات.
          </p>
        </div>

        {/* Drag & Drop Card */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`w-full p-8 rounded-3xl border-2 border-dashed transition-all duration-300 cursor-pointer flex flex-col items-center justify-center gap-3 backdrop-blur-xl ${
            isDragging
              ? 'border-amber-400 bg-amber-500/10 scale-[1.02] shadow-2xl shadow-amber-500/20'
              : 'border-white/10 bg-white/5 hover:border-amber-500/50 hover:bg-white/[0.07] shadow-xl'
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-300 shadow-lg">
            <FileUp className="w-7 h-7" />
          </div>

          <div className="space-y-1">
            <div className="text-base font-semibold text-neutral-200">
              اسحب وأفلت أي ملف PDF هنا
            </div>
            <div className="text-xs text-neutral-400">
              أو انقر لاختيار ملف من جهازك
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

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3 w-full">
          <button
            onClick={onOpenSample}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs sm:text-sm font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-white/10 transition-all hover:scale-105 active:scale-95 shadow-md"
          >
            <BookOpen className="w-4 h-4 text-amber-400" />
            <span>جرّب كتاب العينة المدمج</span>
          </button>
        </div>

        {/* Recents list if available */}
        {recents.length > 0 && (
          <div className="w-full text-right pt-4 border-t border-white/10">
            <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-medium mb-3">
              <Clock className="w-3.5 h-3.5" />
              <span>الكتب المفتوحة مؤخراً</span>
            </div>
            <div className="space-y-1.5">
              {recents.slice(0, 3).map((r) => (
                <div
                  key={r.id}
                  onClick={() => onOpenRecent(r)}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 hover:bg-white/10 cursor-pointer border border-white/5 transition-colors text-xs"
                >
                  <span className="truncate max-w-[280px] font-medium text-neutral-300">
                    {r.name}
                  </span>
                  <span className="font-mono text-[11px] text-amber-400/80">
                    ص {r.lastPage} من {r.totalPages}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Features Minimal Grid */}
        <div className="grid grid-cols-3 gap-3 w-full pt-4 text-center">
          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col items-center gap-1">
            <Compass className="w-4 h-4 text-amber-400" />
            <span className="text-[11px] font-medium text-neutral-300">5 ثيمات مريحة</span>
            <span className="text-[10px] text-neutral-500">Paper, Midnight, E-Ink</span>
          </div>

          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col items-center gap-1">
            <Sparkles className="w-4 h-4 text-sky-400" />
            <span className="text-[11px] font-medium text-neutral-300">مسطرة تركيز ومطر</span>
            <span className="text-[10px] text-neutral-500">للقراءة العميقة</span>
          </div>

          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px] font-medium text-neutral-300">100% محلي وخاص</span>
            <span className="text-[10px] text-neutral-500">بدون سحابة أو تتبع</span>
          </div>
        </div>
      </div>
    </div>
  );
};
