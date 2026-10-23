import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'J / ↓', desc: 'الصفحة التالية / تمرير لأسفل' },
    { key: 'K / ↑', desc: 'الصفحة السابقة / تمرير لأعلى' },
    { key: '+ / -', desc: 'تكبير / تصغير الصفحة' },
    { key: '0', desc: 'إعادة ضبط نسبة التكبير (100%)' },
    { key: 'T', desc: 'التبديل بين ثيمات القراءة (Paper, Midnight, E-Ink)' },
    { key: 'R', desc: 'تفعيل / إلغاء مسطرة التركيز السطري' },
    { key: 'F', desc: 'ملء الشاشة بالكامل للقراءة الصافية' },
    { key: 'S', desc: 'فتح / إغلاق شريط الفهرس والصفحات' },
    { key: 'Esc', desc: 'إغلاق النوافذ المنبثقة' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-md bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl p-6 text-neutral-200 z-10 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-amber-400" />
            <h3 className="font-semibold text-sm">اختصارات القراءة السريعة</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2.5">
          {shortcuts.map((s, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-white/5">
              <span className="text-neutral-300">{s.desc}</span>
              <kbd className="px-2 py-0.5 rounded bg-black/40 border border-white/10 font-mono text-[11px] text-amber-300">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="mt-5 pt-4 border-t border-white/10 text-[11px] text-neutral-400 text-center">
          مُصمم لتجربة قراءة هادئة ومركزة بنقرة واحدة وبدون مشتتات.
        </div>
      </div>
    </div>
  );
};
