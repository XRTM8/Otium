import React from 'react';

export interface OtiumLogoProps {
  className?: string;
  size?: number;
  /** Kept for API compatibility; the mark inherits the surrounding ink. */
  theme?: string;
}

/**
 * The Otium mark. Everything is `currentColor`, so the glyph stays crisp and
 * legible on every theme instead of baking gradient stops into the SVG.
 */
export const OtiumLogo: React.FC<OtiumLogoProps> = ({ className = '', size = 36 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="24"
        cy="24"
        r="18.25"
        stroke="currentColor"
        strokeWidth="2.5"
        opacity="0.9"
      />
      <path
        d="M24 17.1c-2.35-1.65-5.15-2.25-7.7-2.05v13.2c2.55-.2 5.35.4 7.7 2.05 2.35-1.65 5.15-2.25 7.7-2.05V15.05c-2.55-.2-5.35.4-7.7 2.05Z"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinejoin="round"
      />
      <path d="M24 17.1v13.3" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
};
