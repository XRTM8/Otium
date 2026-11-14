import React from 'react';
import { Check } from 'lucide-react';
import { FONTS_LIST } from '../../core/settings/fonts';
import type { FontFamilyId } from '../../core/types';
import type { getTranslations } from '../../core/i18n/translations';

export { ReadingTabPanel } from './ReadingTabPanel';

export const FontsTabPanel: React.FC<{
  ar: boolean;
  t: ReturnType<typeof getTranslations>;
  currentFont: FontFamilyId;
  onFontChange: (font: FontFamilyId) => void;
}> = ({ ar, t, currentFont, onFontChange }) => (
  <div className="space-y-3 animate-in fade-in-50 duration-150">
    <div className="flex items-center justify-between text-xs text-ink-muted px-1 font-mono">
      <span>{t.fontsTitle}</span>
      <span className="text-highlight text-[11px] font-sans">
        {FONTS_LIST.length} {ar ? 'خطوط ممتازة' : 'premium fonts'}
      </span>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {FONTS_LIST.map((font) => {
        const isSelected = currentFont === font.id;
        return (
          <button
            key={font.id}
            onClick={() => onFontChange(font.id)}
            style={{ fontFamily: font.cssFamily }}
            className={`relative flex cursor-pointer flex-col rounded-2xl border p-3 text-right transition-all ${
              isSelected
                ? 'border-accent/45 bg-accent/10 text-ink shadow-sm ring-1 ring-accent/25'
                : 'border-line-subtle bg-hover-subtle text-ink-muted hover:border-line hover:bg-hover'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-1">
              <span className="text-sm font-bold">{font.name}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-hover text-ink-muted font-sans border border-line-subtle">
                  {font.badge}
                </span>
                {isSelected && (
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-on-accent">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                )}
              </div>
            </div>

            <p className="text-xs text-ink-muted opacity-90 truncate w-full mt-0.5">
              {font.sampleAr}
            </p>
            <span className="text-[10px] text-ink-faint font-mono mt-1 opacity-60">
              {font.subname}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);
