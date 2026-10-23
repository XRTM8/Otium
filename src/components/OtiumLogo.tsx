import React from 'react';
import type { ThemeMode } from '../types';

export type BrandThemeId = ThemeMode | 'crystal' | 'crimson';

export interface OtiumLogoProps {
  className?: string;
  size?: number;
  theme?: BrandThemeId;
  variant?: 'vector' | '3d' | 'transparent' | 'lockup';
  withGlow?: boolean;
  withAura?: boolean;
}

// Color palettes for the dynamic vector engine
const THEME_COLOR_MAP: Record<BrandThemeId, {
  id: string;
  primary: string;
  glow: string;
  rim: string;
  faceStart: string;
  faceEnd: string;
  aura: string;
  shadow: string;
  filterHue: number;
}> = {
  amoled: {
    id: 'amoled',
    primary: '#10b981',
    glow: '#00ff88',
    rim: '#34d399',
    faceStart: 'rgba(16, 185, 129, 0.35)',
    faceEnd: 'rgba(6, 78, 59, 0.25)',
    aura: 'rgba(16, 185, 129, 0.28)',
    shadow: 'rgba(0, 255, 136, 0.35)',
    filterHue: 0
  },
  midnight: {
    id: 'midnight',
    primary: '#38bdf8',
    glow: '#00e1ff',
    rim: '#7dd3fc',
    faceStart: 'rgba(56, 189, 248, 0.35)',
    faceEnd: 'rgba(12, 74, 110, 0.25)',
    aura: 'rgba(56, 189, 248, 0.28)',
    shadow: 'rgba(56, 189, 248, 0.35)',
    filterHue: 45
  },
  amber: {
    id: 'amber',
    primary: '#f59e0b',
    glow: '#fbbf24',
    rim: '#fde68a',
    faceStart: 'rgba(245, 158, 11, 0.35)',
    faceEnd: 'rgba(120, 53, 15, 0.25)',
    aura: 'rgba(245, 158, 11, 0.28)',
    shadow: 'rgba(245, 158, 11, 0.35)',
    filterHue: 235
  },
  paper: {
    id: 'paper',
    primary: '#d97706',
    glow: '#f59e0b',
    rim: '#fef3c7',
    faceStart: 'rgba(217, 119, 6, 0.3)',
    faceEnd: 'rgba(113, 63, 18, 0.22)',
    aura: 'rgba(217, 119, 6, 0.22)',
    shadow: 'rgba(217, 119, 6, 0.3)',
    filterHue: 225
  },
  parchment: {
    id: 'parchment',
    primary: '#ca8a04',
    glow: '#eab308',
    rim: '#fef08a',
    faceStart: 'rgba(202, 138, 4, 0.3)',
    faceEnd: 'rgba(113, 63, 18, 0.22)',
    aura: 'rgba(202, 138, 4, 0.24)',
    shadow: 'rgba(202, 138, 4, 0.3)',
    filterHue: 220
  },
  pure: {
    id: 'pure',
    primary: '#818cf8',
    glow: '#a855f7',
    rim: '#c7d2fe',
    faceStart: 'rgba(129, 140, 248, 0.35)',
    faceEnd: 'rgba(49, 46, 129, 0.25)',
    aura: 'rgba(129, 140, 248, 0.28)',
    shadow: 'rgba(129, 140, 248, 0.35)',
    filterHue: 105
  },
  crystal: {
    id: 'crystal',
    primary: '#ffffff',
    glow: '#e2e8f0',
    rim: '#f8fafc',
    faceStart: 'rgba(255, 255, 255, 0.35)',
    faceEnd: 'rgba(148, 163, 184, 0.2)',
    aura: 'rgba(255, 255, 255, 0.25)',
    shadow: 'rgba(255, 255, 255, 0.3)',
    filterHue: 0
  },
  eink: {
    id: 'eink',
    primary: '#a1a1aa',
    glow: '#d4d4d8',
    rim: '#f4f4f5',
    faceStart: 'rgba(161, 161, 170, 0.3)',
    faceEnd: 'rgba(63, 63, 70, 0.2)',
    aura: 'rgba(161, 161, 170, 0.18)',
    shadow: 'rgba(161, 161, 170, 0.25)',
    filterHue: 0
  },
  crimson: {
    id: 'crimson',
    primary: '#f43f5e',
    glow: '#fb7185',
    rim: '#fecdd3',
    faceStart: 'rgba(244, 63, 94, 0.35)',
    faceEnd: 'rgba(136, 19, 55, 0.25)',
    aura: 'rgba(244, 63, 94, 0.28)',
    shadow: 'rgba(244, 63, 94, 0.35)',
    filterHue: 195
  }
};

export const OtiumLogo: React.FC<OtiumLogoProps> = ({
  className = '',
  size = 36,
  theme = 'amoled',
  variant = '3d',
  withGlow = true,
  withAura = false
}) => {
  const currentPalette = THEME_COLOR_MAP[theme] || THEME_COLOR_MAP.amoled;
  const themeFileKey = theme === 'paper' ? 'amber' : theme;

  // Dynamic 3D Squircle App Icon with live theme assets
  if (variant === '3d') {
    const iconPath = size <= 64
      ? `/icons/themes/otium-${themeFileKey}-64.png`
      : size <= 192
      ? `/icons/themes/otium-${themeFileKey}-192.png`
      : `/icons/themes/otium-${themeFileKey}.png`;

    return (
      <div
        className={`relative inline-flex items-center justify-center transition-transform duration-300 ${className}`}
        style={{ width: size, height: size }}
      >
        {withAura && (
          <div
            className="absolute inset-0 rounded-full blur-xl pointer-events-none transition-colors duration-500"
            style={{
              background: currentPalette.aura,
              transform: 'scale(1.25)'
            }}
          />
        )}
        <img
          src={iconPath}
          alt={`Otium Logo (${currentPalette.id})`}
          width={size}
          height={size}
          className="relative rounded-2xl object-contain transition-all duration-500"
          style={{
            filter: withGlow ? `drop-shadow(0 4px 16px ${currentPalette.shadow})` : undefined
          }}
          loading="eager"
        />
      </div>
    );
  }

  // Dynamic 3D Transparent Symbol (No squircle background, pure glass emblem)
  if (variant === 'transparent') {
    const symbolPath = `/icons/transparent/otium-symbol-${themeFileKey}.png`;

    return (
      <div
        className={`relative inline-flex items-center justify-center transition-transform duration-300 ${className}`}
        style={{ width: size, height: size }}
      >
        {withAura && (
          <div
            className="absolute inset-0 rounded-full blur-xl pointer-events-none transition-colors duration-500"
            style={{
              background: currentPalette.aura,
              transform: 'scale(1.3)'
            }}
          />
        )}
        <img
          src={symbolPath}
          alt={`Otium Glass Emblem (${currentPalette.id})`}
          width={size}
          height={size}
          className="relative object-contain transition-all duration-500"
          style={{
            filter: withGlow ? `drop-shadow(0 6px 20px ${currentPalette.shadow})` : undefined
          }}
          loading="eager"
        />
      </div>
    );
  }

  // Complete Brand Horizontal Lockup: Symbol + Arabic & English Typography + Tagline
  if (variant === 'lockup') {
    return (
      <div className={`inline-flex items-center gap-3 select-none ${className}`}>
        <OtiumLogo
          size={size}
          theme={theme}
          variant="3d"
          withGlow={withGlow}
          withAura={withAura}
        />
        <div className="flex flex-col text-left">
          <div className="flex items-baseline gap-2">
            <span
              className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent font-sans"
              style={{
                textShadow: `0 0 20px ${currentPalette.aura}`
              }}
            >
              Otium
            </span>
            <span
              className="text-base font-semibold text-slate-300 font-serif"
              dir="rtl"
            >
              أوتيوم
            </span>
          </div>
          <span className="text-[10px] tracking-wider uppercase text-slate-400 font-medium">
            The Quiet Reader
          </span>
        </div>
      </div>
    );
  }

  // Pure Scalable Vector SVG Engine (Default / variant === 'vector')
  const gradId = `otium_vec_${currentPalette.id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`transition-all duration-500 ${className}`}
      style={{
        filter: withGlow ? `drop-shadow(0 2px 10px ${currentPalette.shadow})` : undefined
      }}
    >
      <defs>
        {/* Ambient Radial Aura */}
        <radialGradient id={`aura_${gradId}`} cx="50%" cy="55%" r="48%">
          <stop offset="0%" stopColor={currentPalette.glow} stopOpacity="0.32" />
          <stop offset="50%" stopColor={currentPalette.primary} stopOpacity="0.12" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>

        {/* Translucent Frosted Glass Face Gradient */}
        <linearGradient id={`glass_${gradId}`} x1="15%" y1="15%" x2="85%" y2="85%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="40%" stopColor={currentPalette.primary} stopOpacity="0.22" />
          <stop offset="100%" stopColor="#0b111e" stopOpacity="0.35" />
        </linearGradient>

        {/* Laser Glow Rim Gradient */}
        <linearGradient id={`rim_${gradId}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor={currentPalette.glow} />
          <stop offset="100%" stopColor={currentPalette.primary} />
        </linearGradient>
      </defs>

      {/* Ambient Floor Glow Aura */}
      <circle cx="50" cy="55" r="42" fill={`url(#aura_${gradId})`} />

      {/* Back Layer Floating Glass Wings */}
      <path
        d="M 22 68 C 34 62 44 64 50 69 C 56 64 66 62 78 68 L 81 41 C 69 35 59 38 50 43 C 41 38 31 35 19 41 Z"
        fill={`url(#glass_${gradId})`}
        stroke={currentPalette.primary}
        strokeWidth="1.2"
        strokeOpacity="0.6"
      />

      {/* Mid Layer Floating Glass Leaves */}
      <path
        d="M 18 60 C 32 53 43 56 50 61 C 57 56 68 53 82 60 L 85 32 C 71 25 60 29 50 34 C 40 29 29 25 15 32 Z"
        fill={`url(#glass_${gradId})`}
        stroke={`url(#rim_${gradId})`}
        strokeWidth="1.6"
        strokeOpacity="0.85"
      />

      {/* Front Hero Open Book Wings (Prominent Laser Rim Glow) */}
      <path
        d="M 15 52 C 30 44 42 47 50 53 C 58 47 70 44 85 52 L 87 23 C 72 15 60 19 50 25 C 40 19 28 15 13 23 Z"
        fill={`url(#glass_${gradId})`}
        stroke={`url(#rim_${gradId})`}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />

      {/* Etched Glass Spine Axis */}
      <line
        x1="50"
        y1="25"
        x2="50"
        y2="53"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.95"
      />

      {/* Center Laser Spark Core */}
      <circle cx="50" cy="18" r="2.5" fill="#ffffff" />
      <circle cx="50" cy="18" r="5" fill={currentPalette.glow} opacity="0.4" />
    </svg>
  );
};
