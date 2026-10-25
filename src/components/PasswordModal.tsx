import React, { useState } from 'react';
import { Lock, Eye, EyeOff, X, KeyRound } from 'lucide-react';
import type { Language } from '../core/i18n/translations';
import { getTranslations } from '../core/i18n/translations';

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
      <div className="fixed inset-0 bg-scrim backdrop-blur-md" onClick={onCancel} />

      <div className="otium-panel relative z-10 flex w-full max-w-sm flex-col items-center p-6 text-center text-ink">
        <button
          onClick={onCancel}
          aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}
          className="toolbar-icon absolute left-4 top-4"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-14 h-14 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent mb-4 shadow-lg shadow-accent/10">
          <Lock className="w-7 h-7" />
        </div>

        <h3 className="text-base font-bold text-ink mb-1">
          {t.passwordRequired}
        </h3>
        {docTitle && (
          <p className="text-[11px] font-mono text-accent/80 mb-2 truncate max-w-[240px]">
            {docTitle}
          </p>
        )}
        <p className="text-xs text-ink-muted max-w-xs mb-5 leading-relaxed font-sans">
          {t.enterPasswordPrompt}
        </p>

        {isIncorrect && (
          <div className="w-full mb-4 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-danger-ink text-xs font-sans">
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
              className="w-full rounded-2xl border border-line bg-hover-subtle px-4 py-2.5 text-center text-sm tracking-widest text-ink transition-colors placeholder:tracking-normal placeholder:text-ink-faint focus:border-accent focus:outline-hidden"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition-colors cursor-pointer p-1"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={password.trim().length === 0}
            className="btn-primary w-full px-4 py-2.5 text-xs disabled:opacity-40"
          >
            <KeyRound className="w-4 h-4" />
            <span>{t.unlockButton}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
