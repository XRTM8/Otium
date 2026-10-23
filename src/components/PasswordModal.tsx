import React, { useState } from 'react';
import { Lock, Eye, EyeOff, X, KeyRound } from 'lucide-react';
import type { Language } from '../utils/translations';
import { getTranslations } from '../utils/translations';

interface PasswordModalProps {
  isOpen: boolean;
  docTitle: string;
  isIncorrect?: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
  lang?: Language;
}

export const PasswordModal: React.FC<PasswordModalProps> = ({
  isOpen,
  docTitle,
  isIncorrect = false,
  onSubmit,
  onCancel,
  lang = 'ar'
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const t = getTranslations(lang);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim().length > 0) {
      onSubmit(password);
      setPassword('');
    }
  };

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
    >
      <div className="fixed inset-0 bg-black/75 backdrop-blur-md" onClick={onCancel} />

      <div className="relative w-full max-w-sm bg-neutral-900 border border-white/15 rounded-3xl shadow-2xl p-6 text-neutral-100 z-10 flex flex-col items-center text-center backdrop-blur-2xl">
        <button
          onClick={onCancel}
          className="absolute top-4 left-4 p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-14 h-14 rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400 mb-4 shadow-lg shadow-amber-400/10">
          <Lock className="w-7 h-7" />
        </div>

        <h3 className="text-base font-bold text-white mb-1">
          {t.passwordRequired}
        </h3>
        {docTitle && (
          <p className="text-[11px] font-mono text-amber-300/80 mb-2 truncate max-w-[240px]">
            {docTitle}
          </p>
        )}
        <p className="text-xs text-neutral-400 max-w-xs mb-5 leading-relaxed font-sans">
          {t.enterPasswordPrompt}
        </p>

        {isIncorrect && (
          <div className="w-full mb-4 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-sans">
            {t.passwordIncorrect}
          </div>
        )}

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div className="relative w-full">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              autoFocus
              className="w-full py-2.5 px-4 pr-10 rounded-2xl bg-white/5 border border-white/15 focus:border-amber-400 focus:outline-hidden text-sm text-center text-white tracking-widest placeholder:tracking-normal placeholder:text-neutral-500 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors cursor-pointer p-1"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={password.trim().length === 0}
            className="w-full py-2.5 rounded-2xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-neutral-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md shadow-amber-400/10"
          >
            <KeyRound className="w-4 h-4" />
            <span>{t.unlockButton}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
