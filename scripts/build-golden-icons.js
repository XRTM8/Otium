import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

async function main() {
  console.log('Rendering master app-icon.png from golden Otium favicon.svg...');
  const svgBuffer = fs.readFileSync(path.resolve('public/favicon.svg'));

  // 1024x1024 ultra-HD master
  await sharp(svgBuffer)
    .resize(1024, 1024)
    .png()
    .toFile(path.resolve('app-icon.png'));

  console.log('app-icon.png generated at 1024x1024.');

  // PWA web assets
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.resolve('public/pwa-192x192.png'));

  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.resolve('public/pwa-512x512.png'));

  console.log('PWA web icons generated.');

  // Tauri icons generation (Desktop .ico, .icns, taskbar, Android)
  console.log('Generating platform icons via Tauri CLI...');
  execSync('npx tauri icon app-icon.png', { stdio: 'inherit' });

  // Sync Android mipmap if present
  const androidResDir = path.resolve('src-tauri/gen/android/app/src/main/res');
  const tauriAndroidDir = path.resolve('src-tauri/icons/android');
  if (fs.existsSync(androidResDir) && fs.existsSync(tauriAndroidDir)) {
    fs.cpSync(tauriAndroidDir, androidResDir, { recursive: true, force: true });
    console.log('Android mipmaps synchronized.');
  }

  console.log('All platform icons generated successfully with the golden Otium identity!');
}

main().catch(err => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
