import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Palette } from 'lucide-react';
import type { ThemeMode } from '../core/types';
import type { Language } from '../core/i18n/translations';
import { getTranslations } from '../core/i18n/translations';
import { triggerHaptic } from '../core/utils/haptics';
import { registerBackHandler } from '../core/navigation/backHandler';
import { getThemeOptions } from './themeCatalog';

interface WelcomeThemeMenuProps {
  currentTheme: ThemeMode;
  currentLang: Language;
  t: ReturnType<typeof getTranslations>;
  onThemeChange: (theme: ThemeMode) => void;
}

export const WelcomeThemeMenu: React.FC<WelcomeThemeMenuProps> = ({
  currentTheme,
  currentLang,
  t,
  onThemeChange,
}) => {
  const themeButton = useRef<HTMLButtonElement>(null);
  const [showTopThemeMenu, setShowTopThemeMenu] = useState(false);

  useEffect(() => {
    if (!showTopThemeMenu) return;
    const close = () => {
      setShowTopThemeMenu(false);
      themeButton.current?.focus();
      return true;
    };
    const unregister = registerBackHandler(close);
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', escape);
    return () => {
      unregister();
      document.removeEventListener('keydown', escape);
    };
  }, [showTopThemeMenu]);

  const allThemes = getThemeOptions(t);

  const activeThemeMeta = allThemes.find((th) => th.id === currentTheme) || allThemes[0];

  return (
    <div className="pointer-events-auto flex items-center gap-2">
      <div className="relative">
        <button
          ref={themeButton}
          aria-expanded={showTopThemeMenu}
          aria-controls="home-reading-themes"
          onClick={() => {
            triggerHaptic('light');
            setShowTopThemeMenu((prev) => !prev);
          }}
          title={t.themeLabel}
          className={`fluid-press group flex items-center gap-2 px-3.5 py-1.5 rounded-full chrome-surface text-xs cursor-pointer hover:border-line-strong hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 ${
            showTopThemeMenu ? 'border-accent/60 shadow-md ring-1 ring-accent/25' : ''
          }`}
        >
          <span
            className="w-2.5 h-2.5 rounded-full ring-2 ring-line-strong transition-all duration-300 group-hover:scale-110"
            style={{ backgroundColor: activeThemeMeta?.dot ?? '#7b8a82' }}
          />
          <span className="font-semibold text-[11px] text-ink">
            {activeThemeMeta?.label ?? currentTheme}
          </span>
          <Palette className="w-3.5 h-3.5 text-ink-muted group-hover:text-ink transition-colors" />
          <ChevronDown
            className={`w-3 h-3 text-ink-muted transition-transform duration-300 ${
              showTopThemeMenu ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Compact Dropdown Menu directly under the top button like before */}
        {showTopThemeMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowTopThemeMenu(false)}
            />
            <div
              id="home-reading-themes"
              dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
              className="chrome-surface absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl p-2.5 z-50 text-ink fluid-pop shadow-2xl border border-line"
            >
              <div className="flex items-center justify-between px-1.5 pb-2 text-[10px] font-semibold uppercase text-ink-faint border-b border-line-subtle mb-1.5">
                <span className={currentLang === 'ar' ? 'font-sans' : 'font-mono tracking-wider'}>{t.readingThemesTitle}</span>
                <span className="font-mono text-[9px] opacity-70">10</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {allThemes.map((th) => {
                  const isSelected = currentTheme === th.id;
                  return (
                    <button
                      key={th.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        onThemeChange(th.id);
                        setShowTopThemeMenu(false);
                      }}
                      className={`fluid-press group flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-all duration-150 cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
                        isSelected
                          ? 'bg-hover-strong text-ink font-semibold border border-line shadow-xs'
                          : 'hover:bg-hover-subtle text-ink-muted hover:text-ink border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-3.5 h-3.5 rounded-full border border-black/25 shadow-xs shrink-0 transition-transform duration-200 group-hover:scale-115 ${
                            isSelected ? 'ring-2 ring-accent ring-offset-1 ring-offset-[var(--surface-1)]' : ''
                          }`}
                          style={{ backgroundColor: th.dot }}
                        />
                        <span className="text-[11px] font-medium truncate group-hover:text-ink transition-colors">{th.label}</span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0 animate-in zoom-in-75 duration-150" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
