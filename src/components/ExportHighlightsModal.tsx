import React, { useState } from 'react';
import { X, Copy, Download, Check, FileText, Highlighter } from 'lucide-react';
import type { TextAnnotation } from '../types';
import type { Language } from '../utils/translations';
import { getTranslations } from '../utils/translations';

interface ExportHighlightsModalProps {
  isOpen: boolean;
  onClose: () => void;
  annotations: TextAnnotation[];
  docTitle: string;
  lang?: Language;
}

export const ExportHighlightsModal: React.FC<ExportHighlightsModalProps> = ({
  isOpen,
  onClose,
  annotations,
  docTitle,
  lang = 'ar'
}) => {
  const [copied, setCopied] = useState(false);
  const t = getTranslations(lang);

  if (!isOpen) return null;

  const sortedAnnotations = [...annotations].sort((a, b) => a.pageNumber - b.pageNumber);

  const generateMarkdown = () => {
    let md = `# اقتباسات وملاحظات: ${docTitle}\n`;
    md += `*تم التصدير عبر قارئ Otium في ${new Date().toLocaleDateString()}*\n\n`;
    md += `---\n\n`;

    if (sortedAnnotations.length === 0) {
      md += `لا توجد اقتباسات محفوظة بعد.\n`;
      return md;
    }

    let currentPage = -1;
    for (const anno of sortedAnnotations) {
      if (anno.pageNumber !== currentPage) {
        currentPage = anno.pageNumber;
        md += `\n### صفحة ${currentPage}\n\n`;
      }
      const typeLabel = anno.type === 'highlight' ? 'هايلايت' : 'تسطير';
      md += `> "${anno.text}"\n`;
      md += `*(${typeLabel} • ${new Date(anno.createdAt).toLocaleTimeString()})*\n\n`;
    }

    return md;
  };

  const handleCopyAll = async () => {
    try {
      const text = generateMarkdown();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy quotes:', err);
    }
  };

  const handleDownload = () => {
    const text = generateMarkdown();
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${docTitle.replace('.pdf', '')}_highlights.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-150"
    >
      <div className="fixed inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-neutral-900 border border-white/15 rounded-3xl shadow-2xl p-5 sm:p-6 text-neutral-100 z-10 flex flex-col max-h-[85vh] overflow-hidden backdrop-blur-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-400/15 border border-amber-400/25 flex items-center justify-center text-amber-400">
              <Highlighter className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                {t.exportQuotes}
              </h3>
              <p className="text-[11px] text-neutral-400 truncate max-w-xs font-sans">
                {docTitle} ({sortedAnnotations.length} اقتباس)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Quotes List */}
        <div className="flex-1 overflow-y-auto py-3 space-y-2.5 pr-1">
          {sortedAnnotations.length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-500 font-sans">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-30 text-amber-400" />
              <span>{t.noQuotes}</span>
            </div>
          ) : (
            sortedAnnotations.map((anno) => (
              <div
                key={anno.id}
                className="p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors space-y-1.5 text-right"
              >
                <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-black/30"
                      style={{ backgroundColor: anno.color }}
                    />
                    <span>صفحة {anno.pageNumber}</span>
                  </span>
                  <span className="text-[10px] opacity-60">
                    {anno.type === 'highlight' ? 'تظليل' : 'تسطير'}
                  </span>
                </div>
                <p className="text-xs text-neutral-200 leading-relaxed font-sans select-text">
                  "{anno.text}"
                </p>
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-white/10 flex items-center justify-between shrink-0 gap-2">
          <button
            onClick={handleCopyAll}
            disabled={sortedAnnotations.length === 0}
            className="flex-1 py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-40 transition-colors text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer text-neutral-200"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">تم النسخ</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>{t.copyAllQuotes}</span>
              </>
            )}
          </button>

          <button
            onClick={handleDownload}
            disabled={sortedAnnotations.length === 0}
            className="flex-1 py-2 px-3 rounded-xl bg-amber-400 text-neutral-950 hover:bg-amber-300 disabled:opacity-40 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-amber-400/10"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t.downloadMarkdown}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
