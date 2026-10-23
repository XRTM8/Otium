import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const svgContent = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Deep AMOLED Emerald Gradients -->
    <linearGradient id="amoledEmerald" x1="128" y1="128" x2="896" y2="896" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#F0FDF4"/>
      <stop offset="35%" stop-color="#34D399"/>
      <stop offset="65%" stop-color="#10B981"/>
      <stop offset="100%" stop-color="#047857"/>
    </linearGradient>

    <linearGradient id="amoledEmeraldAccent" x1="256" y1="256" x2="768" y2="768" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#A7F3D0"/>
      <stop offset="50%" stop-color="#10B981"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>

    <radialGradient id="emeraldGlow" cx="512" cy="512" r="480" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#10B981" stop-opacity="0.32"/>
      <stop offset="50%" stop-color="#047857" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>

    <radialGradient id="sparkGlow" cx="512" cy="512" r="80" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="40%" stop-color="#6EE7B7"/>
      <stop offset="100%" stop-color="#10B981" stop-opacity="0"/>
    </radialGradient>

    <filter id="neonBlur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="16" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Pitch Black AMOLED Canvas Background -->
  <rect width="1024" height="1024" rx="240" fill="#000000"/>
  
  <!-- Subtle Emerald Ambient Aura -->
  <circle cx="512" cy="512" r="460" fill="url(#emeraldGlow)"/>

  <!-- Outer Orbit Ring (Glowing) -->
  <circle cx="512" cy="512" r="384" stroke="url(#amoledEmerald)" stroke-width="26" stroke-linecap="round" filter="url(#neonBlur)" opacity="0.95"/>

  <!-- Left Open Book Wing -->
  <path d="M 512 256 C 368 256 272 360 272 512 C 272 664 368 768 512 768" 
        stroke="url(#amoledEmerald)" stroke-width="26" stroke-linecap="round"/>
  <path d="M 512 344 C 420 344 360 416 360 512 C 360 608 420 680 512 680" 
        stroke="url(#amoledEmeraldAccent)" stroke-width="14" stroke-linecap="round" opacity="0.85"/>

  <!-- Right Open Book Wing -->
  <path d="M 512 256 C 656 256 752 360 752 512 C 752 664 656 768 512 768" 
        stroke="url(#amoledEmerald)" stroke-width="26" stroke-linecap="round"/>
  <path d="M 512 344 C 604 344 664 416 664 512 C 664 608 604 680 512 680" 
        stroke="url(#amoledEmeraldAccent)" stroke-width="14" stroke-linecap="round" opacity="0.85"/>

  <!-- Center White Spine Axis -->
  <line x1="512" y1="208" x2="512" y2="816" stroke="#FFFFFF" stroke-width="18" stroke-linecap="round"/>

  <!-- Core Radiant Spark Center -->
  <circle cx="512" cy="512" r="64" fill="url(#sparkGlow)"/>
  <circle cx="512" cy="512" r="22" fill="#FFFFFF"/>
</svg>`;

async function main() {
  const iconSvgPath = path.resolve('public/favicon.svg');
  fs.writeFileSync(iconSvgPath, svgContent, 'utf8');
  console.log('Saved AMOLED emerald favicon.svg');

  const highResPngPath = path.resolve('app-icon.png');
  await sharp(Buffer.from(svgContent))
    .resize(1024, 1024)
    .png()
    .toFile(highResPngPath);
  console.log('Generated 1024x1024 app-icon.png');

  // Also write public PWA icons
  await sharp(Buffer.from(svgContent)).resize(192, 192).png().toFile('public/pwa-192x192.png');
  await sharp(Buffer.from(svgContent)).resize(512, 512).png().toFile('public/pwa-512x512.png');

  console.log('Running tauri icon to generate all desktop and mobile icons...');
  execSync('npx tauri icon app-icon.png', { stdio: 'inherit' });
  console.log('All icons generated successfully!');
}

main().catch(console.error);
