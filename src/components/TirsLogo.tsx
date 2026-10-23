import React from 'react';

export const TirsLogo: React.FC<{ className?: string; size?: number }> = ({
  className = '',
  size = 28
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Background Page Sheet */}
      <rect
        x="6"
        y="4"
        width="18"
        height="24"
        rx="2"
        className="stroke-neutral-500/60"
        strokeWidth="1.5"
      />
      {/* Foreground Folded Folio */}
      <rect
        x="10"
        y="7"
        width="16"
        height="21"
        rx="2"
        className="fill-neutral-900 stroke-amber-400"
        strokeWidth="1.5"
      />
      {/* Editorial Content Lines */}
      <line
        x1="14"
        y1="13"
        x2="22"
        y2="13"
        className="stroke-amber-300/80"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="14"
        y1="17"
        x2="22"
        y2="17"
        className="stroke-neutral-400"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="14"
        y1="21"
        x2="19"
        y2="21"
        className="stroke-neutral-400"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
};
