import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function createGitHubBanner() {
  const dir = path.resolve('assets');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const width = 1280;
  const height = 640;

  const svgBanner = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1280" y2="640" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#070A10"/>
          <stop offset="50%" stop-color="#020406"/>
          <stop offset="100%" stop-color="#000000"/>
        </linearGradient>

        <radialGradient id="auraEmerald" cx="300" cy="320" r="440" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#10b981" stop-opacity="0.25"/>
          <stop offset="45%" stop-color="#059669" stop-opacity="0.08"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>

        <radialGradient id="auraCyan" cx="950" cy="300" r="380" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.14"/>
          <stop offset="55%" stop-color="#0284c7" stop-opacity="0.03"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      <circle cx="300" cy="320" r="440" fill="url(#auraEmerald)"/>
      <circle cx="950" cy="300" r="380" fill="url(#auraCyan)"/>

      <g opacity="0.06" stroke="#ffffff" stroke-width="1">
        <line x1="0" y1="160" x2="1280" y2="160"/>
        <line x1="0" y1="320" x2="1280" y2="320"/>
        <line x1="0" y1="480" x2="1280" y2="480"/>
        <line x1="320" y1="0" x2="320" y2="640"/>
        <line x1="640" y1="0" x2="640" y2="640"/>
        <line x1="960" y1="0" x2="960" y2="640"/>
      </g>
    </svg>
  `;

  const bgBuf = await sharp(Buffer.from(svgBanner)).png().toBuffer();

  const emblemBuf = await sharp('public/icons/transparent/otium-symbol-amoled.png')
    .resize(400, 400, { kernel: 'lanczos3' })
    .png()
    .toBuffer();

  const typographySvg = Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>
        .titleEn { font-family: system-ui, -apple-system, sans-serif; font-size: 72px; font-weight: 800; fill: #ffffff; letter-spacing: -1.5px; }
        .titleAr { font-family: 'Amiri', 'Cairo', serif; font-size: 56px; font-weight: 700; fill: #6ee7b7; }
        .tagline { font-family: system-ui, -apple-system, sans-serif; font-size: 24px; font-weight: 500; fill: #94a3b8; }
        .taglineAr { font-family: 'Cairo', system-ui, sans-serif; font-size: 22px; font-weight: 600; fill: #a7f3d0; }
        .sub { font-family: system-ui, -apple-system, sans-serif; font-size: 16px; fill: #64748b; font-weight: 400; }
        .pillTxt { font-family: monospace, system-ui; font-size: 13px; font-weight: 700; fill: #e2e8f0; }
      </style>

      <g transform="translate(540, 200)">
        <text x="0" y="0" class="titleEn">Otium</text>
        <text x="225" y="-6" class="titleAr">أوتيوم</text>
        
        <text x="2" y="48" class="tagline">The Quiet Reader • <tspan class="taglineAr">قارئ المستندات الهادئ</tspan></text>
        
        <text x="2" y="88" class="sub">
          A high-performance document reader crafted with Rust, Tauri v2 &amp; React 19.
        </text>

        <g transform="translate(0, 130)">
          <!-- Rust -->
          <rect x="0" y="0" width="130" height="34" rx="17" fill="#1e293b" stroke="#334155" stroke-width="1"/>
          <text x="65" y="22" text-anchor="middle" class="pillTxt">🦀 Rust Tauri v2</text>

          <!-- 120Hz -->
          <rect x="142" y="0" width="140" height="34" rx="17" fill="#064e3b" stroke="#10b981" stroke-width="1.2"/>
          <text x="212" y="22" text-anchor="middle" class="pillTxt" fill="#6ee7b7">⚡ 120Hz Native</text>

          <!-- Dual Spread -->
          <rect x="294" y="0" width="125" height="34" rx="17" fill="#1e293b" stroke="#334155" stroke-width="1"/>
          <text x="356" y="22" text-anchor="middle" class="pillTxt">📖 Dual-Spread</text>

          <!-- Smart Board -->
          <rect x="431" y="0" width="130" height="34" rx="17" fill="#1e293b" stroke="#334155" stroke-width="1"/>
          <text x="496" y="22" text-anchor="middle" class="pillTxt">🖊️ Smart Board</text>

          <!-- Offline -->
          <rect x="573" y="0" width="100" height="34" rx="17" fill="#1e293b" stroke="#334155" stroke-width="1"/>
          <text x="623" y="22" text-anchor="middle" class="pillTxt">🔒 100% Local</text>
        </g>
      </g>
    </svg>
  `);

  await sharp(bgBuf)
    .composite([
      { input: emblemBuf, top: 120, left: 95 },
      { input: typographySvg, top: 0, left: 0 }
    ])
    .png({ quality: 96 })
    .toFile('assets/github-social-preview.png');

  fs.copyFileSync('assets/github-social-preview.png', 'assets/banner.png');
  console.log('GitHub Social Preview generated successfully at assets/github-social-preview.png');
}

createGitHubBanner().catch(console.error);
