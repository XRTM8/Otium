import { ArrowUpRight } from 'lucide-react';
import type { getTranslations, Language } from '../core/i18n/translations';
import { triggerHaptic } from '../core/utils/haptics';
import { BookCover } from './BookCover';
import { formatLibraryProgressLabel, type WelcomeLibraryItem } from './welcomeRecentsHelpers';

interface WelcomeHeroResumeCardProps {
  heroRecent: WelcomeLibraryItem | undefined;
  currentLang: Language;
  t: ReturnType<typeof getTranslations>;
  onOpenRecent: (item: WelcomeLibraryItem) => void;
}

export function WelcomeHeroResumeCard({ heroRecent, currentLang, t, onOpenRecent }: WelcomeHeroResumeCardProps) {
  if (!heroRecent?.available) return null;
  const ar = currentLang === 'ar';
  return <button type="button" className="welcome-resume" onClick={() => {
    triggerHaptic('medium');
    onOpenRecent(heroRecent);
  }}>
    <BookCover item={heroRecent} />
    <span className="resume-info">
      <span>{heroRecent.mediaKind ? (ar ? 'متابعة العرض' : 'Resume viewing') : (ar ? 'متابعة القراءة' : 'Resume reading')}</span>
      <strong><bdi>{heroRecent.name}</bdi></strong>
      <small>{formatLibraryProgressLabel(heroRecent, currentLang, t)}</small>
    </span>
    <ArrowUpRight size={19} className="shrink-0 rtl:-rotate-90" />
  </button>;
}
