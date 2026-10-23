import React, { useRef, useState, useEffect } from 'react';
import { ArrowUpRight, Clock, FileText, Upload } from 'lucide-react';
import type { RecentDoc } from '../types';
import { TirsLogo } from './TirsLogo';

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
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-neutral-950 text-neutral-100 select-none">
      <div className="relative max-w-lg w-full flex flex-col items-center text-center space-y-7">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center space-y-3">
          <div className="p-3 rounded-2xl bg-neutral-900 border border-white/10 shadow-lg">
            <TirsLogo size={36} />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-neutral-100 font-sans">
                T I R S
              </h1>
              <span className="text-neutral-500 font-light text-xl">|</span>
              <span className="text-lg font-medium text-amber-300 font-sans tracking-wide">
                طِـرْس
              </span>
            </div>
            <p className="text-xs text-neutral-400 font-light tracking-wide">
              بيئة قراءة هادئة ومجردة للمستندات والكتب
            </p>
          </div>
        </div>

        {/* Dropzone Card */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`w-full p-8 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col items-center justify-center gap-3 ${
            isDragging
              ? 'border-amber-400/80 bg-neutral-900 shadow-xl'
              : 'border-white/10 bg-neutral-900/60 hover:border-white/20 hover:bg-neutral-900/90 shadow-lg'
          }`}
        >
          <div className="w-11 h-11 rounded-xl bg-neutral-800/80 border border-white/5 flex items-center justify-center text-neutral-300">
            <Upload className="w-5 h-5 text-neutral-300" />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium text-neutral-200">
              اسحب وأفلت ملف PDF هنا لفتحه
            </div>
            <div className="text-[11px] text-neutral-500">
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

        {/* Action Controls */}
        <div className="flex items-center justify-center gap-3 w-full">
          <button
            onClick={onOpenSample}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-white/10 transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            <span>فتح الوثيقة النموذجية</span>
            <ArrowUpRight className="w-3 h-3 opacity-40 ml-0.5" />
          </button>
        </div>

        {/* Recent Files */}
        {recents.length > 0 && (
          <div className="w-full text-right pt-3 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono px-1">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                <span>المستندات الأخيرة</span>
              </span>
              <button
                onClick={() => {
                  localStorage.removeItem('vibe_recent_docs');
                  setRecents([]);
                }}
                className="hover:text-neutral-400 transition-colors"
              >
                مسح السجل
              </button>
            </div>

            <div className="space-y-1">
              {recents.slice(0, 3).map((r) => (
                <div
                  key={r.id}
                  onClick={() => onOpenRecent(r)}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-900/40 hover:bg-neutral-900 cursor-pointer border border-white/5 transition-colors text-xs group"
                >
                  <span className="truncate max-w-[280px] font-medium text-neutral-300 group-hover:text-white transition-colors">
                    {r.name}
                  </span>
                  <span className="font-mono text-[10px] text-neutral-500 group-hover:text-amber-400 transition-colors">
                    صفحة {r.lastPage} / {r.totalPages}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Minimalist Notice */}
        <div className="text-[10px] text-neutral-600 font-mono select-none">
          LOCAL-FIRST • ZERO TELEMETRY • HIGH FIDELITY RENDERING
        </div>
      </div>
    </div>
  );
};
