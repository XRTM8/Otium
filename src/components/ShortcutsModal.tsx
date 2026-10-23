import React from 'react';
import { X, Command } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'J / ↓', desc: 'الصفحة التالية / تمرير لأسفل' },
    { key: 'K / ↑', desc: 'الصفحة السابقة / تمرير لأعلى' },
    { key: 'Ctrl + F', desc: 'البحث النصي داخل الوثيقة' },
    { key: '+ / -', desc: 'تكبير / تصغير العرض' },
    { key: '0', desc: 'إعادة ضبط نسبة العرض (100%)' },
    { key: 'T', desc: 'التبديل بين بيئات القراءة (Paper, Midnight, E-Ink)' },
    { key: 'R', desc: 'تفعيل / إلغاء مسطرة التركيز السطري' },
    { key: 'F', desc: 'ملء الشاشة بالكامل' },
    { key: 'S', desc: 'فتح / إغلاق شريط الفهرس والصفحات' },
    { key: 'Esc', desc: 'إغلاق النوافذ المنبثقة' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl p-5 text-neutral-200 z-10 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
          <div className="flex items-center gap-2">
            <Command className="w-4 h-4 text-amber-400" />
            <h3 className="font-semibold text-xs tracking-wide">اختصارات لوحة المفاتيح</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-1.5">
          {shortcuts.map((s, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg bg-white/[0.03]">
              <span className="text-neutral-300 text-[11px]">{s.desc}</span>
              <kbd className="px-2 py-0.5 rounded bg-black/50 border border-white/10 font-mono text-[10px] text-amber-300">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-white/10 text-[10px] text-neutral-500 font-mono text-center tracking-widest">
          OTIUM • THE QUIET READER
        </div>
      </div>
    </div>
  );
};
