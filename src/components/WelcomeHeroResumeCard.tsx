import { ArrowUpRight } from 'lucide-react';
import type { getTranslations, Language } from '../core/i18n/translations';
import { triggerHaptic } from '../core/utils/haptics';
import { BookCover } from './BookCover';
import { formatLibraryProgressLabel, isPagedLibraryItem, type WelcomeLibraryItem } from './welcomeRecentsHelpers';

interface WelcomeHeroResumeCardProps {
  heroRecent: WelcomeLibraryItem | undefined;
  currentLang: Language;
  t: ReturnType<typeof getTranslations>;
  onOpenRecent: (item: WelcomeLibraryItem) => void;
}

export function WelcomeHeroResumeCard({ heroRecent, currentLang, t, onOpenRecent }: WelcomeHeroResumeCardProps) {
  if (!heroRecent?.available) return null;
  const ar = currentLang === 'ar';
  const hasPages = isPagedLibraryItem(heroRecent) && heroRecent.totalPages > 0;
  const progressPct = hasPages ? Math.max(0, Math.min(100, (heroRecent.lastPage / heroRecent.totalPages) * 100)) : 0;

  return (
    <button
      type="button"
      className="welcome-resume group"
      onClick={() => {
        triggerHaptic('medium');
        onOpenRecent(heroRecent);
      }}
    >
      <BookCover item={heroRecent} />
      <span className="resume-info">
        <span className="resume-badge">
          {heroRecent.mediaKind ? (ar ? 'متابعة العرض' : 'Resume viewing') : (ar ? 'متابعة القراءة' : 'Resume reading')}
        </span>
        <strong className="resume-title" title={heroRecent.name}>
          <span className="resume-title-text" dir="auto">
            {heroRecent.name}
          </span>
        </strong>
        <span className="resume-meta">
          <small>{formatLibraryProgressLabel(heroRecent, currentLang, t)}</small>
          {hasPages && (
            <span className="resume-progress-track">
              <i style={{ width: `${progressPct}%` }} />
            </span>
          )}
        </span>
      </span>
      <span className="resume-action-pill">
        <ArrowUpRight size={18} className="rtl:-rotate-90 transition-transform duration-200 group-hover:scale-110" />
      </span>
    </button>
  );
}
