import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

async function main() {
  const masterIconPath = path.resolve('app-icon.png');
  console.log('Generating public PWA & web icons from app-icon.png...');
  await sharp(masterIconPath).resize(192, 192).png().toFile('public/pwa-192x192.png');
  await sharp(masterIconPath).resize(512, 512).png().toFile('public/pwa-512x512.png');

  const pwa192Buffer = await sharp(masterIconPath).resize(192, 192).png().toBuffer();
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

  console.log('Running tauri icon to generate desktop and mobile icons...');
  execSync('npx tauri icon app-icon.png', { stdio: 'inherit' });

  const androidResDir = path.resolve('src-tauri/gen/android/app/src/main/res');
  const tauriAndroidDir = path.resolve('src-tauri/icons/android');
  if (fs.existsSync(androidResDir) && fs.existsSync(tauriAndroidDir)) {
    fs.cpSync(tauriAndroidDir, androidResDir, { recursive: true, force: true });
    console.log('Android mipmaps synchronized.');
  }

  console.log('All platform icons synchronized successfully!');
}

main().catch(console.error);
