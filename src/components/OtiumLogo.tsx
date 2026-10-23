import React from 'react';

interface OtiumLogoProps {
  className?: string;
  size?: number;
}

export const OtiumLogo: React.FC<OtiumLogoProps> = ({
  className = '',
  size = 32
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="otiumGold" x1="6" y1="4" x2="30" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="45%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
        <linearGradient id="otiumPageGlow" x1="12" y1="10" x2="24" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.05" />
        </linearGradient>
        <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Outer Quiet Circle Ring ("O") */}
      <circle
        cx="18"
        cy="18"
        r="14"
        stroke="url(#otiumGold)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="76 12"
        className="opacity-90"
      />

      {/* Soft Ambient Inner Backing */}
      <circle
        cx="18"
        cy="18"
        r="11"
        fill="url(#otiumPageGlow)"
        className="opacity-60"
      />

      {/* Left Folio Wing */}
      <path
        d="M18 11.5C15.2 11.5 12 12.8 11 13.6V24.2C12 23.4 15.2 22.3 18 22.3V11.5Z"
        fill="url(#otiumGold)"
        fillOpacity="0.85"
      />

      {/* Right Folio Wing */}
      <path
        d="M18 11.5C20.8 11.5 24 12.8 25 13.6V24.2C24 23.4 20.8 22.3 18 22.3V11.5Z"
        fill="url(#otiumGold)"
        fillOpacity="0.95"
      />

      {/* Book Spine Center Highlight */}
      <line
        x1="18"
        y1="11"
        x2="18"
        y2="24.5"
        stroke="#fff"
        strokeWidth="1.2"
        strokeLinecap="round"
        className="opacity-80"
      />
    </svg>
  );
};
