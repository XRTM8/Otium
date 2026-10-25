import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * One icon pipeline for desktop, PWA and Android.
 *
 * - `favicon.svg` is the opaque plate used for .ico/.png/PWA/Store assets.
 * - `app-icon-glyph.svg` is the transparent adaptive-icon foreground, padded
 *   for Android's 66% safe zone.
 * - Both are flat vectors, so taskbars and launchers never resample gradients
 *   into muddy edges.
 */

const ADAPTIVE_SIZES = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432
};

// Android 7.0/7.1 (minSdk 24) predates adaptive icons and still loads these
// legacy bitmaps. They must carry the same plate as the adaptive foreground,
// otherwise older launchers keep showing the retired mark.
const LEGACY_SIZES = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192
};

async function main() {
  const plateSvg = fs.readFileSync(path.resolve('public/favicon.svg'));
  const glyphSvg = fs.readFileSync(path.resolve('public/app-icon-glyph.svg'));

  console.log('Rendering master app-icon.png from the flat Otium plate...');
  await sharp(plateSvg).resize(1024, 1024).png().toFile(path.resolve('app-icon.png'));

  await sharp(plateSvg).resize(192, 192).png().toFile(path.resolve('public/pwa-192x192.png'));
  await sharp(plateSvg).resize(512, 512).png().toFile(path.resolve('public/pwa-512x512.png'));
  console.log('PWA web icons generated.');

  console.log('Generating platform icons via Tauri CLI...');
  execSync('npx tauri icon app-icon.png', { stdio: 'inherit' });

  const androidAssetDir = path.resolve('src-tauri/icons/android');
  for (const [density, size] of Object.entries(ADAPTIVE_SIZES)) {
    const dir = path.join(androidAssetDir, `mipmap-${density}`);
    if (!fs.existsSync(dir)) continue;
    await sharp(glyphSvg)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(dir, 'ic_launcher_foreground.png'));
  }

  for (const [density, size] of Object.entries(LEGACY_SIZES)) {
    const dir = path.join(androidAssetDir, `mipmap-${density}`);
    if (!fs.existsSync(dir)) continue;

    await sharp(plateSvg).resize(size, size).png().toFile(path.join(dir, 'ic_launcher.png'));

    const square = await sharp(plateSvg).resize(size, size).png().toBuffer();
    const roundMask = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
    );
    await sharp(square)
      .composite([{ input: roundMask, blend: 'dest-in' }])
      .png()
      .toFile(path.join(dir, 'ic_launcher_round.png'));
  }

  const backgroundXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="ic_launcher_background">#0B0906</color>
</resources>
`;
  const adaptiveBackground = path.join(androidAssetDir, 'values/ic_launcher_background.xml');
  if (fs.existsSync(path.dirname(adaptiveBackground))) {
    fs.writeFileSync(adaptiveBackground, backgroundXml);
  }

  const androidResDir = path.resolve('src-tauri/gen/android/app/src/main/res');
  if (fs.existsSync(androidResDir)) {
    // Tauri's template ships green Android-robot vectors. The adaptive icon
    // points at the generated mipmaps, so these stale drawables can go.
    for (const stale of ['drawable/ic_launcher_background.xml', 'drawable-v24/ic_launcher_foreground.xml']) {
      const staleFile = path.join(androidResDir, stale);
      if (fs.existsSync(staleFile)) fs.rmSync(staleFile);
    }

    fs.cpSync(path.join(androidAssetDir), androidResDir, { recursive: true, force: true });

    const resBackground = path.join(androidResDir, 'values/ic_launcher_background.xml');
    fs.writeFileSync(resBackground, backgroundXml);
    console.log('Android adaptive foreground and #0B0906 plate synchronized.');
  }

  console.log('All platform icons generated with the Otium folio identity.');
}

main().catch((err) => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
