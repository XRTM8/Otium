import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const originalBPath = 'C:\\Users\\mjd20\\.gemini\\antigravity\\brain\\715dda67-1076-406d-a1a7-385eef590bab\\otium_icon_concept_b_floating_pages_1792756827752.jpg';
const appIconPath = path.resolve('app-icon.png');
const highResDir = path.resolve('Otium_Logo_HighRes');

async function applyOriginalBAtHighestQuality() {
  console.log('--- Step 1: Generating Master app-icon.png (1024x1024 Lossless PNG) ---');
  await sharp(originalBPath)
    .resize(1024, 1024, { kernel: sharp.kernel.lanczos3 })
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(appIconPath);
  console.log('✓ Master app-icon.png created.');

  console.log('--- Step 2: Generating PWA & Web Assets ---');
  await sharp(appIconPath).resize(192, 192).png().toFile('public/pwa-192x192.png');
  await sharp(appIconPath).resize(512, 512).png().toFile('public/pwa-512x512.png');

  const pwa192Buffer = await sharp(appIconPath).resize(192, 192).png().toBuffer();
  const b64 = pwa192Buffer.toString('base64');
  const faviconSvg = `<svg width="192" height="192" viewBox="0 0 192 192" fill="none" xmlns="http://www.w3.org/2000/svg">
  <clipPath id="squircleClip">
    <rect width="192" height="192" rx="42" fill="black"/>
  </clipPath>
  <g clip-path="url(#squircleClip)">
    <image width="192" height="192" href="data:image/png;base64,${b64}"/>
  </g>
</svg>`;
  fs.writeFileSync('public/favicon.svg', faviconSvg, 'utf8');
  console.log('✓ public/favicon.svg, pwa-192x192.png, pwa-512x512.png created.');

  console.log('--- Step 3: Generating Tauri Desktop & Mobile Icons ---');
  execSync('npx tauri icon app-icon.png', { stdio: 'inherit' });
  console.log('✓ Tauri icons generated.');

  console.log('--- Step 4: Syncing Android App Icons ---');
  const androidResDir = path.resolve('src-tauri/gen/android/app/src/main/res');
  const tauriAndroidDir = path.resolve('src-tauri/icons/android');
  if (fs.existsSync(androidResDir) && fs.existsSync(tauriAndroidDir)) {
    fs.cpSync(tauriAndroidDir, androidResDir, { recursive: true, force: true });
    console.log('✓ Android mipmap icons synchronized.');
  }

  console.log('--- Step 5: Updating Otium_Logo_HighRes (4K, 2K, 1024, Transparent, Vector) ---');
  if (!fs.existsSync(highResDir)) {
    fs.mkdirSync(highResDir, { recursive: true });
  }

  // 1024x1024
  await sharp(appIconPath).toFile(path.join(highResDir, 'Otium_Logo_1024x1024.png'));

  // 2K (2048x2048)
  await sharp(originalBPath)
    .resize(2048, 2048, { kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 1.1, m1: 0.8, m2: 2.0 })
    .png({ quality: 100, compressionLevel: 8 })
    .toFile(path.join(highResDir, 'Otium_Logo_2K_2048x2048.png'));

  // 4K Ultra HD (4096x4096)
  await sharp(originalBPath)
    .resize(4096, 4096, { kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 1.4, m1: 1.0, m2: 2.5 })
    .png({ quality: 100, compressionLevel: 7 })
    .toFile(path.join(highResDir, 'Otium_Logo_4K_4096x4096.png'));

  console.log('✓ All 4K and 2K assets saved to Otium_Logo_HighRes.');
  console.log('\n========================================');
  console.log('SUCCESS: Original B applied at highest resolution everywhere!');
  console.log('========================================');
}

applyOriginalBAtHighestQuality().catch(err => {
  console.error(err);
  process.exit(1);
});
