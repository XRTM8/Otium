import React from 'react';
import { ArrowUpRight, BookOpen } from 'lucide-react';
import type { getTranslations, Language } from '../core/i18n/translations';
import { triggerHaptic } from '../core/utils/haptics';
import {
  formatLibraryProgressLabel,
  isPagedLibraryItem,
  type WelcomeLibraryItem,
} from './welcomeRecentsHelpers';

interface WelcomeHeroResumeCardProps {
  heroRecent: WelcomeLibraryItem | undefined;
  currentLang: Language;
  t: ReturnType<typeof getTranslations>;
  onOpenRecent: (item: WelcomeLibraryItem) => void;
}

export const WelcomeHeroResumeCard: React.FC<WelcomeHeroResumeCardProps> = ({
  heroRecent,
  currentLang,
  t,
  onOpenRecent,
}) => {
  if (!heroRecent?.available) return null;
  const paged = isPagedLibraryItem(heroRecent);
  const progressLabel = formatLibraryProgressLabel(heroRecent, currentLang, t);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        triggerHaptic('medium');
        onOpenRecent(heroRecent);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenRecent(heroRecent);
        }
      }}
      className="fluid-press w-full p-3.5 px-4 rounded-2xl chrome-surface hover:border-accent hover:-translate-y-0.5 shadow-lg hover:shadow-xl flex items-center justify-between gap-3 text-start cursor-pointer group transition-all duration-200"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shrink-0 group-hover:scale-105 group-hover:bg-accent/25 transition-all">
          <BookOpen className="w-5 h-5 text-accent" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-accent font-mono">
            {heroRecent.mediaKind
              ? (currentLang === 'ar' ? 'متابعة العرض' : 'Resume viewing')
              : (currentLang === 'ar' ? 'متابعة القراءة' : 'Resume Reading')}
          </span>
          <span className="text-xs sm:text-sm font-bold text-ink truncate group-hover:text-accent transition-colors">
            <bdi>{heroRecent.name}</bdi>
          </span>
          <span className="text-[11px] text-ink-muted font-mono">
            {progressLabel}
            {paged && heroRecent.totalPages > 0 && (
              <span className="ml-1 text-accent font-semibold">
                ({Math.min(100, Math.round((heroRecent.lastPage / heroRecent.totalPages) * 100))}%)
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent text-on-accent text-xs font-semibold shrink-0 group-hover:bg-accent-strong shadow-xs group-hover:shadow-md transition-all">
        <span>{currentLang === 'ar' ? 'متابعة' : 'Resume'}</span>
        <ArrowUpRight className="w-3.5 h-3.5 rtl:rotate-[-90deg] group-hover:translate-x-0.5 transition-transform" />
      </div>
    </div>
  );
};
