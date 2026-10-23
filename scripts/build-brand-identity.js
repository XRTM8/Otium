import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const MASTER_SOURCE = 'C:/Users/mjd20/.gemini/antigravity/brain/a3d8bddd-0f88-4a4e-aa4d-651ce03f56f5/.user_uploaded/media_1792765243652_f8348f02.jpg';

// Theme specifications with color science parameters
const THEMES = [
  {
    id: 'amoled',
    nameAr: 'الزمردي النيوني (AMOLED Signature)',
    nameEn: 'AMOLED Emerald',
    primaryColor: '#10b981',
    glowColor: '#00ff88',
    bgAura: 'rgba(16, 185, 129, 0.28)',
    modulate: (img) => img // original emerald neon
  },
  {
    id: 'midnight',
    nameAr: 'الأزرق السماوي (Midnight Azure)',
    nameEn: 'Midnight Azure',
    primaryColor: '#38bdf8',
    glowColor: '#00e1ff',
    bgAura: 'rgba(56, 189, 248, 0.28)',
    modulate: (img) => img.modulate({ hue: 45, saturation: 1.18, brightness: 1.02 })
  },
  {
    id: 'amber',
    nameAr: 'العنبر الدافئ (Warm Amber)',
    nameEn: 'Warm Amber',
    primaryColor: '#f59e0b',
    glowColor: '#fbbf24',
    bgAura: 'rgba(245, 158, 11, 0.28)',
    modulate: (img) => img.modulate({ hue: 235, saturation: 1.25, brightness: 1.05 })
  },
  {
    id: 'pure',
    nameAr: 'الأرجواني الملكي (Amethyst Violet)',
    nameEn: 'Pure Amethyst',
    primaryColor: '#818cf8',
    glowColor: '#c084fc',
    bgAura: 'rgba(129, 140, 248, 0.28)',
    modulate: (img) => img.modulate({ hue: 105, saturation: 1.2, brightness: 1.04 })
  },
  {
    id: 'crimson',
    nameAr: 'الياقوتي القرمزي (Ruby Crimson)',
    nameEn: 'Ruby Crimson',
    primaryColor: '#f43f5e',
    glowColor: '#fb7185',
    bgAura: 'rgba(244, 63, 94, 0.28)',
    modulate: (img) => img.modulate({ hue: 195, saturation: 1.22, brightness: 1.02 })
  },
  {
    id: 'parchment',
    nameAr: 'الورق العتيق (Antique Parchment)',
    nameEn: 'Antique Parchment',
    primaryColor: '#d97706',
    glowColor: '#f59e0b',
    bgAura: 'rgba(217, 119, 6, 0.24)',
    modulate: (img) => img.modulate({ hue: 220, saturation: 0.92, brightness: 1.02 })
  },
  {
    id: 'crystal',
    nameAr: 'الألماسي النقي (Crystal Diamond)',
    nameEn: 'Crystal Diamond',
    primaryColor: '#ffffff',
    glowColor: '#e2e8f0',
    bgAura: 'rgba(255, 255, 255, 0.26)',
    modulate: (img) => img.modulate({ saturation: 0.08, brightness: 1.18 })
  },
  {
    id: 'eink',
    nameAr: 'الحبر الإلكتروني (E-Ink Paperwhite)',
    nameEn: 'E-Ink Paperwhite',
    primaryColor: '#a1a1aa',
    glowColor: '#e4e4e7',
    bgAura: 'rgba(161, 161, 170, 0.2)',
    modulate: (img) => img.grayscale().modulate({ brightness: 1.06 })
  }
];

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Generates an SVG mask for squircle with rounded corners (iOS/macOS/Windows style)
function getSquircleMask(size) {
  const rx = Math.round(size * 0.22);
  return Buffer.from(`
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" rx="${rx}" fill="#ffffff" />
    </svg>
  `);
}

async function main() {
  console.log('--- Otium Visual Identity Asset Pipeline ---');

  if (!fs.existsSync(MASTER_SOURCE)) {
    throw new Error('Master source file not found at: ' + MASTER_SOURCE);
  }

  const outDir = path.resolve('public/icons/themes');
  const transparentOutDir = path.resolve('public/icons/transparent');
  await ensureDir(outDir);
  await ensureDir(transparentOutDir);
  await ensureDir('public/brand');

  const squircleMask1024 = getSquircleMask(1024);

  // 1. Process each theme
  for (const theme of THEMES) {
    console.log(`Processing theme: ${theme.id} (${theme.nameEn})...`);
    
    // Apply color modulation to master source
    const modulatedBase = theme.modulate(sharp(MASTER_SOURCE));
    const base1024Buf = await modulatedBase.resize(1024, 1024).png().toBuffer();

    // 1.A Full squircle icon with anti-aliased rounded alpha mask
    const squircleIconBuf = await sharp(base1024Buf)
      .composite([{
        input: squircleMask1024,
        blend: 'dest-in'
      }])
      .png()
      .toBuffer();

    // Save master theme squircle icon
    const themeIconPath = path.join(outDir, `otium-${theme.id}.png`);
    await sharp(squircleIconBuf).toFile(themeIconPath);

    // Save sizes for web / pwa / components
    await sharp(squircleIconBuf).resize(512, 512).png().toFile(path.join(outDir, `otium-${theme.id}-512.png`));
    await sharp(squircleIconBuf).resize(192, 192).png().toFile(path.join(outDir, `otium-${theme.id}-192.png`));
    await sharp(squircleIconBuf).resize(64, 64).png().toFile(path.join(outDir, `otium-${theme.id}-64.png`));

    // Save WebP optimized versions
    await sharp(squircleIconBuf).resize(512, 512).webp({ quality: 92 }).toFile(path.join(outDir, `otium-${theme.id}.webp`));

    // 1.B Generate SVG vector remaster for this theme
    // We update the master SVG template with the theme's palette!
    const themeSvgContent = generateThemeSvg(theme);
    fs.writeFileSync(path.join(outDir, `otium-${theme.id}.svg`), themeSvgContent, 'utf8');

    // Also transparent emblem SVG
    const themeTransparentSvgContent = generateTransparentThemeSvg(theme);
    fs.writeFileSync(path.join(transparentOutDir, `otium-symbol-${theme.id}.svg`), themeTransparentSvgContent, 'utf8');

    // Render transparent PNG version
    await sharp(Buffer.from(themeTransparentSvgContent))
      .resize(1024, 1024)
      .png()
      .toFile(path.join(transparentOutDir, `otium-symbol-${theme.id}.png`));
  }

  // 2. Set AMOLED Emerald as the official master app-icon.png
  console.log('Writing master app-icon.png (Emerald Signature Edition)...');
  const masterAmoledSquircle = path.join(outDir, 'otium-amoled.png');
  fs.copyFileSync(masterAmoledSquircle, 'app-icon.png');
  fs.copyFileSync(path.join(outDir, 'otium-amoled-192.png'), 'public/pwa-192x192.png');
  fs.copyFileSync(path.join(outDir, 'otium-amoled-512.png'), 'public/pwa-512x512.png');

  // Favicon SVG with AMOLED emerald glow
  const amoledSvg = fs.readFileSync(path.join(outDir, 'otium-amoled.svg'), 'utf8');
  fs.writeFileSync('public/favicon.svg', amoledSvg, 'utf8');

  // 3. Synchronize desktop & mobile icons via tauri icon
  console.log('Executing tauri icon app-icon.png...');
  try {
    execSync('npx tauri icon app-icon.png', { stdio: 'inherit' });
    const androidResDir = path.resolve('src-tauri/gen/android/app/src/main/res');
    const tauriAndroidDir = path.resolve('src-tauri/icons/android');
    if (fs.existsSync(androidResDir) && fs.existsSync(tauriAndroidDir)) {
      fs.cpSync(tauriAndroidDir, androidResDir, { recursive: true, force: true });
      console.log('Android mipmaps synchronized successfully!');
    }
  } catch (err) {
    console.warn('Tauri icon generation warning:', err.message);
  }

  console.log('Generating Brand System JSON manifest...');
  const brandManifest = {
    brandName: 'Otium',
    brandNameArabic: 'أوتيوم',
    taglineEn: 'The Quiet Reader',
    taglineAr: 'قارئ المستندات الهادئ',
    symbolDescription: '3D Frosted Glass Book with Dynamic Laser-Glow Rim and Ambient Aura',
    themes: THEMES.map(t => ({
      id: t.id,
      nameAr: t.nameAr,
      nameEn: t.nameEn,
      primaryColor: t.primaryColor,
      glowColor: t.glowColor,
      bgAura: t.bgAura,
      iconPng: `/icons/themes/otium-${t.id}.png`,
      iconWebp: `/icons/themes/otium-${t.id}.webp`,
      iconSvg: `/icons/themes/otium-${t.id}.svg`,
      transparentSymbolPng: `/icons/transparent/otium-symbol-${t.id}.png`,
      transparentSymbolSvg: `/icons/transparent/otium-symbol-${t.id}.svg`
    }))
  };

  fs.writeFileSync('public/brand/brand-manifest.json', JSON.stringify(brandManifest, null, 2), 'utf8');
  console.log('All brand assets and themes generated successfully!');
}

// Generate complete Vector SVG for squircle tile
function generateThemeSvg(theme) {
  const masterSvgPath = path.resolve('otium_master_crystal_white_remastered.svg');
  let content = fs.readFileSync(masterSvgPath, 'utf8');

  // Replace colors with theme palette
  content = content.replace(/#FFFFFF/g, theme.primaryColor);
  content = content.replace(/#E2E8F0/g, theme.glowColor);
  content = content.replace(/#94A3B8/g, theme.primaryColor);
  return content;
}

// Generate complete Vector SVG for transparent symbol (no background)
function generateTransparentThemeSvg(theme) {
  const transparentSvgPath = path.resolve('otium_master_crystal_white_transparent.svg');
  let content = fs.readFileSync(transparentSvgPath, 'utf8');

  content = content.replace(/#FFFFFF/g, theme.primaryColor);
  content = content.replace(/#E2E8F0/g, theme.glowColor);
  content = content.replace(/#94A3B8/g, theme.primaryColor);
  return content;
}

main().catch(console.error);
