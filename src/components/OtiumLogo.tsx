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

// Color palettes for the dynamic vector engine and lighting effects
const THEME_COLOR_MAP: Record<BrandThemeId, {
  id: string;
  primary: string;
  glow: string;
  rim: string;
  faceStart: string;
  faceEnd: string;
  aura: string;
  shadow: string;
}> = {
  amoled: {
    id: 'amoled',
    primary: '#10b981',
    glow: '#00ff88',
    rim: '#34d399',
    faceStart: 'rgba(16, 185, 129, 0.35)',
    faceEnd: 'rgba(6, 78, 59, 0.25)',
    aura: 'rgba(16, 185, 129, 0.35)',
    shadow: 'rgba(0, 255, 136, 0.45)'
  },
  midnight: {
    id: 'midnight',
    primary: '#38bdf8',
    glow: '#00e1ff',
    rim: '#7dd3fc',
    faceStart: 'rgba(56, 189, 248, 0.35)',
    faceEnd: 'rgba(12, 74, 110, 0.25)',
    aura: 'rgba(56, 189, 248, 0.35)',
    shadow: 'rgba(56, 189, 248, 0.45)'
  },
  amber: {
    id: 'amber',
    primary: '#f59e0b',
    glow: '#fbbf24',
    rim: '#fde68a',
    faceStart: 'rgba(245, 158, 11, 0.35)',
    faceEnd: 'rgba(120, 53, 15, 0.25)',
    aura: 'rgba(245, 158, 11, 0.35)',
    shadow: 'rgba(245, 158, 11, 0.45)'
  },
  paper: {
    id: 'paper',
    primary: '#d97706',
    glow: '#f59e0b',
    rim: '#fef3c7',
    faceStart: 'rgba(217, 119, 6, 0.32)',
    faceEnd: 'rgba(113, 63, 18, 0.22)',
    aura: 'rgba(217, 119, 6, 0.28)',
    shadow: 'rgba(217, 119, 6, 0.38)'
  },
  parchment: {
    id: 'parchment',
    primary: '#ca8a04',
    glow: '#eab308',
    rim: '#fef08a',
    faceStart: 'rgba(202, 138, 4, 0.32)',
    faceEnd: 'rgba(113, 63, 18, 0.22)',
    aura: 'rgba(202, 138, 4, 0.28)',
    shadow: 'rgba(202, 138, 4, 0.38)'
  },
  pure: {
    id: 'pure',
    primary: '#818cf8',
    glow: '#a855f7',
    rim: '#c7d2fe',
    faceStart: 'rgba(129, 140, 248, 0.35)',
    faceEnd: 'rgba(49, 46, 129, 0.25)',
    aura: 'rgba(129, 140, 248, 0.35)',
    shadow: 'rgba(129, 140, 248, 0.45)'
  },
  crystal: {
    id: 'crystal',
    primary: '#ffffff',
    glow: '#e2e8f0',
    rim: '#f8fafc',
    faceStart: 'rgba(255, 255, 255, 0.38)',
    faceEnd: 'rgba(148, 163, 184, 0.22)',
    aura: 'rgba(255, 255, 255, 0.3)',
    shadow: 'rgba(255, 255, 255, 0.4)'
  },
  eink: {
    id: 'eink',
    primary: '#a1a1aa',
    glow: '#d4d4d8',
    rim: '#f4f4f5',
    faceStart: 'rgba(161, 161, 170, 0.32)',
    faceEnd: 'rgba(63, 63, 70, 0.22)',
    aura: 'rgba(161, 161, 170, 0.22)',
    shadow: 'rgba(161, 161, 170, 0.3)'
  },
  crimson: {
    id: 'crimson',
    primary: '#f43f5e',
    glow: '#fb7185',
    rim: '#fecdd3',
    faceStart: 'rgba(244, 63, 94, 0.35)',
    faceEnd: 'rgba(136, 19, 55, 0.25)',
    aura: 'rgba(244, 63, 94, 0.35)',
    shadow: 'rgba(244, 63, 94, 0.45)'
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

  // Ultra-HD High-DPI 3D Squircle App Icon (Always uses crisp 512px/1024px assets)
  if (variant === '3d') {
    const iconPath = size >= 256
      ? `/icons/themes/otium-${themeFileKey}.png`
      : `/icons/themes/otium-${themeFileKey}-512.png`;

    return (
      <div
        className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
        style={{ width: size, height: size }}
      >
        {withAura && (
          <div
            className="absolute inset-0 rounded-full blur-xl pointer-events-none transition-colors duration-500"
            style={{
              background: currentPalette.aura,
              transform: 'scale(1.2)'
            }}
          />
        )}
        <img
          src={iconPath}
          alt={`Otium Logo (${currentPalette.id})`}
          width={size}
          height={size}
          className="relative rounded-2xl object-contain transition-all duration-500 select-none"
          style={{
            imageRendering: '-webkit-optimize-contrast',
            filter: withGlow ? `drop-shadow(0 4px 18px ${currentPalette.shadow})` : undefined
          }}
          loading="eager"
          decoding="async"
        />
      </div>
    );
  }

  // Ultra-HD Transparent 3D Glass Emblem (Isolated floating book on pure transparency)
  if (variant === 'transparent') {
    const symbolPath = size >= 256
      ? `/icons/transparent/otium-symbol-${themeFileKey}.png`
      : `/icons/transparent/otium-symbol-${themeFileKey}-512.png`;

    return (
      <div
        className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
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
          className="relative object-contain transition-all duration-500 select-none"
          style={{
            imageRendering: '-webkit-optimize-contrast',
            filter: withGlow ? `drop-shadow(0 4px 16px ${currentPalette.shadow})` : undefined
          }}
          loading="eager"
          decoding="async"
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

  // Pure Precision Vector SVG Engine (Zero Pixelation at ANY zoom level)
  const gradId = `otium_vec_${currentPalette.id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`transition-all duration-500 select-none shrink-0 ${className}`}
      style={{
        filter: withGlow ? `drop-shadow(0 2px 12px ${currentPalette.shadow})` : undefined
      }}
    >
      <defs>
        {/* Ambient Floor Glow */}
        <radialGradient id={`aura_${gradId}`} cx="50%" cy="58%" r="48%">
          <stop offset="0%" stopColor={currentPalette.glow} stopOpacity="0.38" />
          <stop offset="45%" stopColor={currentPalette.primary} stopOpacity="0.14" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>

        {/* Translucent Frosted Glass Face Gradients */}
        <linearGradient id={`glassLeft_${gradId}`} x1="30" y1="50" x2="100" y2="160" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
          <stop offset="35%" stopColor={currentPalette.rim} stopOpacity="0.22" />
          <stop offset="80%" stopColor={currentPalette.primary} stopOpacity="0.1" />
          <stop offset="100%" stopColor="#0a101d" stopOpacity="0.35" />
        </linearGradient>

        <linearGradient id={`glassRight_${gradId}`} x1="170" y1="50" x2="100" y2="160" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
          <stop offset="35%" stopColor={currentPalette.rim} stopOpacity="0.22" />
          <stop offset="80%" stopColor={currentPalette.primary} stopOpacity="0.1" />
          <stop offset="100%" stopColor="#0a101d" stopOpacity="0.35" />
        </linearGradient>

        {/* Laser Rim Edge Gradients */}
        <linearGradient id={`rimLeft_${gradId}`} x1="20" y1="50" x2="100" y2="150" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor={currentPalette.glow} />
          <stop offset="100%" stopColor={currentPalette.primary} />
        </linearGradient>

        <linearGradient id={`rimRight_${gradId}`} x1="180" y1="50" x2="100" y2="150" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor={currentPalette.glow} />
          <stop offset="100%" stopColor={currentPalette.primary} />
        </linearGradient>

        {/* Specular Bloom Filter */}
        <filter id={`bloom_${gradId}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Ambient Floor Glow Aura */}
      <circle cx="100" cy="115" r="80" fill={`url(#aura_${gradId})`} />

      {/* LAYER 1: Deep Back Glass Pages (Left & Right) */}
      <g opacity="0.65">
        <path
          d="M 40 138 C 65 126 85 130 100 142 C 100 142 85 86 46 80 Z"
          fill={`url(#glassLeft_${gradId})`}
          stroke={`url(#rimLeft_${gradId})`}
          strokeWidth="1.2"
        />
        <path
          d="M 160 138 C 135 126 115 130 100 142 C 100 142 115 86 154 80 Z"
          fill={`url(#glassRight_${gradId})`}
          stroke={`url(#rimRight_${gradId})`}
          strokeWidth="1.2"
        />
      </g>

      {/* LAYER 2: Mid-tier Floating Pages */}
      <g opacity="0.85">
        <path
          d="M 32 122 C 60 110 82 114 100 128 C 100 128 88 64 38 60 Z"
          fill={`url(#glassLeft_${gradId})`}
          stroke={`url(#rimLeft_${gradId})`}
          strokeWidth="1.6"
        />
        <path
          d="M 168 122 C 140 110 118 114 100 128 C 100 128 112 64 162 60 Z"
          fill={`url(#glassRight_${gradId})`}
          stroke={`url(#rimRight_${gradId})`}
          strokeWidth="1.6"
        />
      </g>

      {/* LAYER 3: Front Hero Glass Leaves with Laser Rim Bloom */}
      <g filter={`url(#bloom_${gradId})`}>
        {/* Left Open Hero Page */}
        <path
          d="M 25 105 C 55 90 80 95 100 112 C 100 112 85 45 32 42 Z"
          fill={`url(#glassLeft_${gradId})`}
          stroke={`url(#rimLeft_${gradId})`}
          strokeWidth="2.4"
          strokeLinejoin="round"
        />

        {/* Right Open Hero Page */}
        <path
          d="M 175 105 C 145 90 120 95 100 112 C 100 112 115 45 168 42 Z"
          fill={`url(#glassRight_${gradId})`}
          stroke={`url(#rimRight_${gradId})`}
          strokeWidth="2.4"
          strokeLinejoin="round"
        />

        {/* Etched Glass Micro-Lines (Document Representation) */}
        <g stroke={currentPalette.rim} strokeWidth="1" strokeOpacity="0.45" strokeLinecap="round">
          <line x1="52" y1="64" x2="82" y2="72" />
          <line x1="48" y1="74" x2="85" y2="83" />
          <line x1="44" y1="84" x2="88" y2="94" />

          <line x1="148" y1="64" x2="118" y2="72" />
          <line x1="152" y1="74" x2="115" y2="83" />
          <line x1="156" y1="84" x2="112" y2="94" />
        </g>

        {/* Central Luminous Spine Axis */}
        <line
          x1="100"
          y1="40"
          x2="100"
          y2="114"
          stroke="#ffffff"
          strokeWidth="2.8"
          strokeLinecap="round"
        />

        {/* Center Floating Laser Sparkle */}
        <circle cx="100" cy="30" r="3" fill="#ffffff" />
        <circle cx="100" cy="30" r="7" fill={currentPalette.glow} opacity="0.45" />
      </g>
    </svg>
  );
};
