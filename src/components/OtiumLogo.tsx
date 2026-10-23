import React from 'react';
import type { ThemeMode } from '../types';

interface OtiumLogoProps {
  className?: string;
  size?: number;
  theme?: ThemeMode;
  variant?: 'vector' | '3d';
}

export const OtiumLogo: React.FC<OtiumLogoProps> = ({
  className = '',
  size = 36,
  theme = 'paper',
  variant = 'vector'
}) => {
  if (variant === '3d') {
    return (
      <img
        src="./pwa-192x192.png"
        alt="Otium Logo"
        width={size}
        height={size}
        className={`rounded-2xl shadow-lg object-contain transition-all duration-300 ${className}`}
      />
    );
  }

  // Theme-specific color gradients and core glow for the Floating Pages geometry
  const getThemePalettes = () => {
    switch (theme) {
      case 'midnight':
        return {
          id: 'otiumMidnight',
          mainStart: '#FFFFFF',
          mainMid: '#38BDF8',
          mainEnd: '#0284C7',
          accentStart: '#BAE6FD',
          accentEnd: '#0369A1',
          backStart: '#0C4A6E',
          backEnd: '#082F49',
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
          backStart: '#52525B',
          backEnd: '#27272A',
          spark: '#E4E4E7',
          spine: '#FFFFFF'
        };
      case 'amber':
        return {
          id: 'otiumAmber',
          mainStart: '#FFFBEB',
          mainMid: '#F59E0B',
          mainEnd: '#EA580C',
          accentStart: '#FCD34D',
          accentEnd: '#C2410C',
          backStart: '#78350F',
          backEnd: '#451A03',
          spark: '#F59E0B',
          spine: '#FFFFFF'
        };
      case 'amoled':
        return {
          id: 'otiumAmoled',
          mainStart: '#FFFFFF',
          mainMid: '#F1F5F9',
          mainEnd: '#94A3B8',
          accentStart: '#FFFFFF',
          accentEnd: '#CBD5E1',
          backStart: '#475569',
          backEnd: '#1E293B',
          spark: '#FFFFFF',
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
          backStart: '#713F12',
          backEnd: '#451A03',
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
          backStart: '#312E81',
          backEnd: '#1E1B4B',
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
          backStart: '#78350F',
          backEnd: '#451A03',
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
      className={`transition-all duration-500 ${className}`}
    >
      <defs>
        <linearGradient id={`mainGrad_${p.id}`} x1="6" y1="8" x2="38" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={p.mainStart} />
          <stop offset="40%" stopColor={p.mainMid} />
          <stop offset="100%" stopColor={p.mainEnd} />
        </linearGradient>
        <linearGradient id={`accentGrad_${p.id}`} x1="6" y1="10" x2="38" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={p.accentStart} />
          <stop offset="100%" stopColor={p.accentEnd} />
        </linearGradient>
        <linearGradient id={`backGrad_${p.id}`} x1="10" y1="15" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={p.backStart} />
          <stop offset="100%" stopColor={p.backEnd} />
        </linearGradient>
      </defs>

      {/* Back Layer Floating Document Sheet */}
      <path
        d="M 10 30 C 15 27.5 19 28.5 22 30.5 C 25 28.5 29 27.5 34 30 L 35 18 C 30 15.5 26 16.5 22 18.5 C 18 16.5 14 15.5 9 18 Z"
        fill={`url(#backGrad_${p.id})`}
        stroke={p.mainEnd}
        strokeWidth="0.8"
        opacity="0.75"
      />

      {/* Mid Layer Floating Document Sheet */}
      <path
        d="M 8.5 26.5 C 14 23.5 18.5 24.8 22 27 C 25.5 24.8 30 23.5 35.5 26.5 L 36.5 14 C 31 11 26.5 12.5 22 14.8 C 17.5 12.5 13 11 7.5 14 Z"
        fill={`url(#accentGrad_${p.id})`}
        stroke={p.mainMid}
        strokeWidth="0.9"
        opacity="0.85"
      />

      {/* Front Hero Floating Document Sheet */}
      <path
        d="M 7 23 C 13 19.5 18 21 22 23.5 C 26 21 31 19.5 37 23 L 38 9.5 C 32 6.5 27 8 22 10.5 C 17 8 12 6.5 6 9.5 Z"
        fill={`url(#mainGrad_${p.id})`}
        stroke={p.mainStart}
        strokeWidth="0.9"
      />

      {/* Center Spine Reflection Axis */}
      <line
        x1="22"
        y1="10.5"
        x2="22"
        y2="23.5"
        stroke={p.spine}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.95"
      />

      {/* Floating Focus Core Sparkle */}
      <circle cx="22" cy="6" r="1.5" fill={p.spine} />
      <circle cx="22" cy="6" r="3.2" fill={p.spark} opacity="0.3" />
    </svg>
  );
};
