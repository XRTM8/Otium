import React from 'react';

interface OtiumLogoProps {
  className?: string;
  size?: number;
}

export const OtiumLogo: React.FC<OtiumLogoProps> = ({
  className = '',
  size = 36
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="otiumGoldMain" x1="6" y1="4" x2="38" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFBEB" />
          <stop offset="35%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>
        <linearGradient id="otiumGoldAccent" x1="14" y1="10" x2="30" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
      </defs>

      {/* Pristine Circular Perimeter (Letter O) */}
      <circle
        cx="22"
        cy="22"
        r="18"
        stroke="url(#otiumGoldMain)"
        strokeWidth="1.75"
        strokeLinecap="round"
      />

      {/* Symmetrical Left Open Folio Arc */}
      <path
        d="M 22 10.5 C 15 10.5 11 15 11 22 C 11 29 15 33.5 22 33.5"
        stroke="url(#otiumGoldAccent)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Symmetrical Right Open Folio Arc */}
      <path
        d="M 22 10.5 C 29 10.5 33 15 33 22 C 33 29 29 33.5 22 33.5"
        stroke="url(#otiumGoldAccent)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Spine Hairline Axis */}
      <line
        x1="22"
        y1="8.5"
        x2="22"
        y2="35.5"
        stroke="#FFFFFF"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.8"
      />

      {/* Golden Focal Core */}
      <circle cx="22" cy="22" r="2.2" fill="url(#otiumGoldMain)" />
    </svg>
  );
};
