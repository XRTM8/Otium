import React from 'react';
import type { ThemeMode } from '../types';

export interface OtiumLogoProps {
  className?: string;
  size?: number;
  theme?: ThemeMode | string;
  variant?: 'vector' | '3d' | 'transparent' | 'lockup';
  withGlow?: boolean;
  withAura?: boolean;
}

export const OtiumLogo: React.FC<OtiumLogoProps> = ({
  className = '',
  size = 36,
  theme = 'paper'
}) => {
  // Theme-specific color gradients and core glow
  const getThemePalettes = () => {
    switch (theme) {
      case 'midnight':
        return {
          id: 'otiumMidnight',
          mainStart: '#E0F2FE',
          mainMid: '#38BDF8',
          mainEnd: '#0284C7',
          accentStart: '#BAE6FD',
          accentEnd: '#0369A1',
          spark: '#38BDF8',
          spine: '#FFFFFF'
        };
      case 'eink':
        return {
          id: 'otiumEink',
          mainStart: '#FFFFFF',
          mainMid: '#D4D4D8',
          mainEnd: '#71717A',
          accentStart: '#F4F4F5',
          accentEnd: '#A1A1AA',
          spark: '#E4E4E7',
          spine: '#FFFFFF'
        };
      case 'amber':
        return {
          id: 'otiumAmber',
          mainStart: '#FEF3C7',
          mainMid: '#F59E0B',
          mainEnd: '#EA580C',
          accentStart: '#FCD34D',
          accentEnd: '#C2410C',
          spark: '#F59E0B',
          spine: '#FFFFFF'
        };
      case 'amoled':
        return {
          id: 'otiumAmoled',
          mainStart: '#F0FDF4',
          mainMid: '#10B981',
          mainEnd: '#047857',
          accentStart: '#A7F3D0',
          accentEnd: '#059669',
          spark: '#10B981',
          spine: '#FFFFFF'
        };
      case 'parchment':
        return {
          id: 'otiumParchment',
          mainStart: '#FEF9C3',
          mainMid: '#CA8A04',
          mainEnd: '#78350F',
          accentStart: '#FDE047',
          accentEnd: '#92400E',
          spark: '#D97706',
          spine: '#FEF08A'
        };
      case 'pure':
        return {
          id: 'otiumPure',
          mainStart: '#EEF2FF',
          mainMid: '#818CF8',
          mainEnd: '#4338CA',
          accentStart: '#C7D2FE',
          accentEnd: '#4F46E5',
          spark: '#818CF8',
          spine: '#FFFFFF'
        };
      case 'paper':
      default:
        return {
          id: 'otiumPaper',
          mainStart: '#FFFBEB',
          mainMid: '#F59E0B',
          mainEnd: '#B45309',
          accentStart: '#FDE68A',
          accentEnd: '#D97706',
          spark: '#F59E0B',
          spine: '#FFFFFF'
        };
    }
  };

  const p = getThemePalettes();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`transition-all duration-500 select-none shrink-0 ${className}`}
    >
      <defs>
        <linearGradient id={`mainGrad_${p.id}`} x1="6" y1="4" x2="38" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={p.mainStart} />
          <stop offset="40%" stopColor={p.mainMid} />
          <stop offset="100%" stopColor={p.mainEnd} />
        </linearGradient>
        <linearGradient id={`accentGrad_${p.id}`} x1="14" y1="10" x2="30" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={p.accentStart} />
          <stop offset="100%" stopColor={p.accentEnd} />
        </linearGradient>
      </defs>

      {/* Pristine Circular Perimeter (Letter O) */}
      <circle
        cx="22"
        cy="22"
        r="18"
        stroke={`url(#mainGrad_${p.id})`}
        strokeWidth="1.75"
        strokeLinecap="round"
      />

      {/* Symmetrical Left Open Folio Arc */}
      <path
        d="M 22 10.5 C 15 10.5 11 15 11 22 C 11 29 15 33.5 22 33.5"
        stroke={`url(#accentGrad_${p.id})`}
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Symmetrical Right Open Folio Arc */}
      <path
        d="M 22 10.5 C 29 10.5 33 15 33 22 C 33 29 29 33.5 22 33.5"
        stroke={`url(#accentGrad_${p.id})`}
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Spine Hairline Axis */}
      <line
        x1="22"
        y1="8.5"
        x2="22"
        y2="35.5"
        stroke={p.spine}
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.85"
      />

      {/* Radiant Focal Core */}
      <circle cx="22" cy="22" r="2.2" fill={p.spark} />
    </svg>
  );
};
