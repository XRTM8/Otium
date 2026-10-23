import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const MASTER_SOURCE = 'C:/Users/mjd20/.gemini/antigravity/brain/a3d8bddd-0f88-4a4e-aa4d-651ce03f56f5/.user_uploaded/media_1792765243652_f8348f02.jpg';

const THEMES = [
  {
    id: 'amoled',
    nameAr: 'الزمردي النيوني (AMOLED Signature)',
    nameEn: 'AMOLED Emerald',
    primaryColor: '#10b981',
    glowColor: '#00ff88',
    bgAura: 'rgba(16, 185, 129, 0.32)',
    modulate: (img) => img
  },
  {
    id: 'midnight',
    nameAr: 'الأزرق السماوي (Midnight Azure)',
    nameEn: 'Midnight Azure',
    primaryColor: '#38bdf8',
    glowColor: '#00e1ff',
    bgAura: 'rgba(56, 189, 248, 0.32)',
    modulate: (img) => img.modulate({ hue: 45, saturation: 1.2, brightness: 1.02 })
  },
  {
    id: 'amber',
    nameAr: 'العنبر الدافئ (Warm Amber)',
    nameEn: 'Warm Amber',
    primaryColor: '#f59e0b',
    glowColor: '#fbbf24',
    bgAura: 'rgba(245, 158, 11, 0.32)',
    modulate: (img) => img.modulate({ hue: 235, saturation: 1.28, brightness: 1.04 })
  },
  {
    id: 'pure',
    nameAr: 'الأرجواني الملكي (Amethyst Violet)',
    nameEn: 'Pure Amethyst',
    primaryColor: '#818cf8',
    glowColor: '#c084fc',
    bgAura: 'rgba(129, 140, 248, 0.32)',
    modulate: (img) => img.modulate({ hue: 105, saturation: 1.22, brightness: 1.04 })
  },
  {
    id: 'crimson',
    nameAr: 'الياقوتي القرمزي (Ruby Crimson)',
    nameEn: 'Ruby Crimson',
    primaryColor: '#f43f5e',
    glowColor: '#fb7185',
    bgAura: 'rgba(244, 63, 94, 0.32)',
    modulate: (img) => img.modulate({ hue: 195, saturation: 1.25, brightness: 1.02 })
  },
  {
    id: 'parchment',
    nameAr: 'الورق العتيق (Antique Parchment)',
    nameEn: 'Antique Parchment',
    primaryColor: '#d97706',
    glowColor: '#f59e0b',
    bgAura: 'rgba(217, 119, 6, 0.26)',
    modulate: (img) => img.modulate({ hue: 220, saturation: 0.95, brightness: 1.02 })
  },
  {
    id: 'crystal',
    nameAr: 'الألماسي النقي (Crystal Diamond)',
    nameEn: 'Crystal Diamond',
    primaryColor: '#ffffff',
    glowColor: '#e2e8f0',
    bgAura: 'rgba(255, 255, 255, 0.3)',
    modulate: (img) => img.modulate({ saturation: 0.08, brightness: 1.2 })
  },
  {
    id: 'eink',
    nameAr: 'الحبر الإلكتروني (E-Ink Paperwhite)',
    nameEn: 'E-Ink Paperwhite',
    primaryColor: '#a1a1aa',
    glowColor: '#e4e4e7',
    bgAura: 'rgba(161, 161, 170, 0.22)',
    modulate: (img) => img.grayscale().modulate({ brightness: 1.06 })
  }
];

function getSquircleSvgMask(size) {
  const rx = Math.round(size * 0.22);
  return Buffer.from(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" rx="${rx}" fill="#ffffff"/>` +
    `</svg>`
  );
}

async function extractTransparentBook(imageBuffer, size = 1024) {
  // Extract clean book with alpha channel from the cropped squircle
  const { data, info } = await sharp(imageBuffer)
    .resize(size, size, { kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(size * size * 4);
  const bgThreshold = 22; // threshold for dark background

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const srcIdx = (y * size + x) * 3;
      const dstIdx = (y * size + x) * 4;

      const r = data[srcIdx];
      const g = data[srcIdx + 1];
      const b = data[srcIdx + 2];

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      let alpha = 0;

      if (lum > bgThreshold) {
        // Smooth linear ramp for glass glow
        alpha = Math.min(255, Math.max(0, Math.round(((lum - bgThreshold) / 38) * 255)));
      }

      out[dstIdx] = r;
      out[dstIdx + 1] = g;
      out[dstIdx + 2] = b;
      out[dstIdx + 3] = alpha;
    }
  }

  return sharp(out, { raw: { width: size, height: size, channels: 4 } })
    .sharpen({ sigma: 1.2, m1: 1.0, m2: 0.5 })
    .png()
    .toBuffer();
}

async function main() {
  console.log('=== Otium Ultra-HD Brand Engine ===');

  if (!fs.existsSync(MASTER_SOURCE)) {
    throw new Error('Master source not found: ' + MASTER_SOURCE);
  }

  const outDir = path.resolve('public/icons/themes');
  const transDir = path.resolve('public/icons/transparent');
  const brainBrandDir = 'C:/Users/mjd20/.gemini/antigravity/brain/a3d8bddd-0f88-4a4e-aa4d-651ce03f56f5/brand';

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(transDir, { recursive: true });
  fs.mkdirSync(brainBrandDir, { recursive: true });

  // 1. Crop the squircle directly to eliminate wasted outer padding
  // Inner tile in master image is located around left=100, top=108, width=824, height=824
  console.log('Cropping master squircle to eliminate wasted padding...');
  const croppedMaster = sharp(MASTER_SOURCE).extract({ left: 100, top: 108, width: 824, height: 824 });

  // 2. Upscale to 2048x2048 Ultra-HD using Lanczos3 and unsharp masking
  console.log('Generating 2048x2048 Ultra-HD Master Base...');
  const master2KBuffer = await croppedMaster
    .resize(2048, 2048, { kernel: 'lanczos3' })
    .sharpen({ sigma: 1.5, m1: 1.2, m2: 0.6 })
    .png()
    .toBuffer();

  const mask1024 = getSquircleSvgMask(1024);
  const mask512 = getSquircleSvgMask(512);

  // 3. Process every theme at Ultra-HD resolution
  for (const th of THEMES) {
    console.log(`Rendering Ultra-HD Theme: ${th.id} (${th.nameEn})...`);

    // Modulate colors on the 2K master
    const modulated2K = await th.modulate(sharp(master2KBuffer)).png().toBuffer();

    // 3.A Squircle Icon (1024x1024) with anti-aliased squircle mask
    const squircle1024 = await sharp(modulated2K)
      .resize(1024, 1024, { kernel: 'lanczos3' })
      .composite([{ input: mask1024, blend: 'dest-in' }])
      .png()
      .toBuffer();

    // Save 1024x1024 master
    fs.writeFileSync(path.join(outDir, `otium-${th.id}.png`), squircle1024);

    // Save 512x512 Retina icon
    const squircle512 = await sharp(modulated2K)
      .resize(512, 512, { kernel: 'lanczos3' })
      .composite([{ input: mask512, blend: 'dest-in' }])
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(outDir, `otium-${th.id}-512.png`), squircle512);

    // Save 192x192
    await sharp(squircle512)
      .resize(192, 192, { kernel: 'lanczos3' })
      .png()
      .toFile(path.join(outDir, `otium-${th.id}-192.png`));

    // Save WebP 512x512
    await sharp(squircle512)
      .webp({ quality: 95 })
      .toFile(path.join(outDir, `otium-${th.id}.webp`));

    // 3.B Transparent Glass Emblem (Isolated 3D Book on Alpha Transparency)
    console.log(`  Extracting razor-sharp transparent emblem for ${th.id}...`);
    const transEmblem1024 = await extractTransparentBook(modulated2K, 1024);
    fs.writeFileSync(path.join(transDir, `otium-symbol-${th.id}.png`), transEmblem1024);

    const transEmblem512 = await sharp(transEmblem1024)
      .resize(512, 512, { kernel: 'lanczos3' })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(transDir, `otium-symbol-${th.id}-512.png`), transEmblem512);

    // Copy to brain brand directory for documentation & artifact embedding
    fs.copyFileSync(path.join(outDir, `otium-${th.id}-512.png`), path.join(brainBrandDir, `icon-${th.id}.png`));
    fs.copyFileSync(path.join(transDir, `otium-symbol-${th.id}-512.png`), path.join(brainBrandDir, `symbol-${th.id}.png`));
  }

  // 4. Update official master app-icon.png with Emerald Edition
  console.log('Writing razor-sharp app-icon.png...');
  fs.copyFileSync(path.join(outDir, 'otium-amoled.png'), 'app-icon.png');
  fs.copyFileSync(path.join(outDir, 'otium-amoled-512.png'), 'public/pwa-512x512.png');
  fs.copyFileSync(path.join(outDir, 'otium-amoled-192.png'), 'public/pwa-192x192.png');
  fs.copyFileSync(path.join(outDir, 'otium-amoled-512.png'), path.join(brainBrandDir, 'master-app-icon.png'));

  // 5. Update Favicon SVG with clean embedded data
  const pwa512Buf = fs.readFileSync('public/pwa-512x512.png');
  const b64 = pwa512Buf.toString('base64');
  const faviconSvg = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <clipPath id="squircleClip">
    <rect width="512" height="512" rx="112" fill="black"/>
  </clipPath>
  <g clip-path="url(#squircleClip)">
    <image width="512" height="512" href="data:image/png;base64,${b64}"/>
  </g>
</svg>`;
  fs.writeFileSync('public/favicon.svg', faviconSvg, 'utf8');

  // 6. Regenerate platform icons via tauri icon
  console.log('Re-synchronizing native platform icons (Windows .ico, Android mipmaps)...');
  try {
    execSync('npx tauri icon app-icon.png', { stdio: 'inherit' });
    const androidResDir = path.resolve('src-tauri/gen/android/app/src/main/res');
    const tauriAndroidDir = path.resolve('src-tauri/icons/android');
    if (fs.existsSync(androidResDir) && fs.existsSync(tauriAndroidDir)) {
      fs.cpSync(tauriAndroidDir, androidResDir, { recursive: true, force: true });
      console.log('Android mipmaps successfully synchronized!');
    }
  } catch (err) {
    console.warn('Tauri icon generation:', err.message);
  }

  console.log('Ultra-HD Brand Pipeline completed successfully!');
}

main().catch(console.error);
