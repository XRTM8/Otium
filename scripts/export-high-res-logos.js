import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const srcJpg = 'C:\\Users\\mjd20\\.gemini\\antigravity\\brain\\715dda67-1076-406d-a1a7-385eef590bab\\otium_icon_concept_b_floating_pages_1792756827752.jpg';
const outFolder = path.resolve('Otium_Logo_HighRes');

if (!fs.existsSync(outFolder)) {
  fs.mkdirSync(outFolder, { recursive: true });
}

// Infinite Vector SVG representation of Concept B: The Floating Pages
const infiniteSvg = `<svg width="4096" height="4096" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Obsidian AMOLED Base -->
    <linearGradient id="bgGrad" x1="100" y1="100" x2="924" y2="924" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#050C14"/>
      <stop offset="60%" stop-color="#02060B"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>

    <!-- Deep Ambient Emerald Glow -->
    <radialGradient id="emeraldAura" cx="512" cy="580" r="480" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#10B981" stop-opacity="0.35"/>
      <stop offset="50%" stop-color="#047857" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>

    <!-- Back Page Gradient -->
    <linearGradient id="pageBackGrad" x1="280" y1="360" x2="744" y2="760" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#065F46"/>
      <stop offset="100%" stop-color="#022C22"/>
    </linearGradient>

    <!-- Mid Page Gradient -->
    <linearGradient id="pageMidGrad" x1="300" y1="320" x2="724" y2="720" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#059669"/>
      <stop offset="50%" stop-color="#10B981"/>
      <stop offset="100%" stop-color="#047857"/>
    </linearGradient>

    <!-- Front Hero Page Gradient (Radiant Glass) -->
    <linearGradient id="pageFrontGrad" x1="320" y1="280" x2="704" y2="680" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="25%" stop-color="#D1FAE5"/>
      <stop offset="65%" stop-color="#34D399"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>

    <!-- Depth Shadows -->
    <filter id="softDepthShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#000000" flood-opacity="0.75"/>
    </filter>

    <filter id="heroNeonGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Dark Squircle Canvas -->
  <rect x="32" y="32" width="960" height="960" rx="224" fill="url(#bgGrad)"/>
  <rect x="32" y="32" width="960" height="960" rx="224" stroke="#13231F" stroke-width="3"/>
  <circle cx="512" cy="580" r="440" fill="url(#emeraldAura)"/>

  <!-- Back Layer Book Sheet -->
  <g filter="url(#softDepthShadow)">
    <path d="M 230 680 C 370 640 470 670 512 710 C 554 670 654 640 794 680 L 814 430 C 674 390 574 420 512 460 C 450 420 350 390 210 430 Z" 
          fill="url(#pageBackGrad)" stroke="#065F46" stroke-width="3"/>
  </g>

  <!-- Mid Layer Book Sheet -->
  <g filter="url(#softDepthShadow)">
    <path d="M 220 630 C 360 590 460 620 512 660 C 564 620 664 590 804 630 L 824 370 C 684 330 584 360 512 400 C 440 360 340 330 200 370 Z" 
          fill="url(#pageMidGrad)" opacity="0.92" stroke="#34D399" stroke-width="3"/>
  </g>

  <!-- Front Crisp Hero Sheet (Shining Frosted Glass) -->
  <g filter="url(#softDepthShadow)">
    <path d="M 210 570 C 360 520 460 550 512 600 C 564 550 664 520 814 570 L 830 300 C 680 250 580 280 512 330 C 444 280 344 250 194 300 Z" 
          fill="url(#pageFrontGrad)" stroke="#A7F3D0" stroke-width="2"/>
    
    <!-- Page Spine Reflection Line -->
    <path d="M 512 330 L 512 600" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" opacity="0.95"/>
    
    <!-- Subtle Reading Rhythm Accent Lines -->
    <line x1="280" y1="380" x2="450" y2="420" stroke="#047857" stroke-width="8" stroke-linecap="round" opacity="0.35"/>
    <line x1="290" y1="430" x2="440" y2="465" stroke="#047857" stroke-width="8" stroke-linecap="round" opacity="0.35"/>
    <line x1="310" y1="480" x2="430" y2="510" stroke="#047857" stroke-width="8" stroke-linecap="round" opacity="0.25"/>

    <line x1="574" y1="420" x2="744" y2="380" stroke="#047857" stroke-width="8" stroke-linecap="round" opacity="0.35"/>
    <line x1="584" y1="465" x2="734" y2="430" stroke="#047857" stroke-width="8" stroke-linecap="round" opacity="0.35"/>
    <line x1="594" y1="510" x2="714" y2="480" stroke="#047857" stroke-width="8" stroke-linecap="round" opacity="0.25"/>
  </g>

  <!-- Top Crown Focus Beacon -->
  <circle cx="512" cy="240" r="14" fill="#FFFFFF"/>
  <circle cx="512" cy="240" r="32" fill="#34D399" opacity="0.45"/>
</svg>`;

async function exportAll() {
  console.log('Generating high resolution master exports...');

  // 1. 1024x1024 Master PNG
  const p1024 = path.join(outFolder, 'Otium_Logo_1024x1024.png');
  await sharp(srcJpg)
    .resize(1024, 1024, { kernel: sharp.kernel.lanczos3 })
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(p1024);
  console.log('✓ Created 1024x1024 Master PNG');

  // 2. 2048x2048 2K Retina PNG with subtle adaptive sharpening
  const p2K = path.join(outFolder, 'Otium_Logo_2K_2048x2048.png');
  await sharp(srcJpg)
    .resize(2048, 2048, { kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 1.2, m1: 0.8, m2: 2.0 })
    .png({ quality: 100, compressionLevel: 8 })
    .toFile(p2K);
  console.log('✓ Created 2K 2048x2048 Retina PNG');

  // 3. 4096x4096 4K Ultra HD Master PNG
  const p4K = path.join(outFolder, 'Otium_Logo_4K_4096x4096.png');
  await sharp(srcJpg)
    .resize(4096, 4096, { kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 1.5, m1: 1.0, m2: 2.5 })
    .png({ quality: 100, compressionLevel: 7 })
    .toFile(p4K);
  console.log('✓ Created 4K 4096x4096 Ultra HD PNG');

  // 4. Infinite Scalable Vector SVG
  const pSvg = path.join(outFolder, 'Otium_Logo_Vector_Infinite.svg');
  fs.writeFileSync(pSvg, infiniteSvg, 'utf8');
  console.log('✓ Created Infinite Scalable Vector SVG');

  // 5. 4K Vector Rendered PNG from SVG (Razor sharp vector render at 4096x4096)
  const pVector4K = path.join(outFolder, 'Otium_Logo_Vector_4K_Crisp.png');
  await sharp(Buffer.from(infiniteSvg))
    .resize(4096, 4096)
    .png({ quality: 100, compressionLevel: 8 })
    .toFile(pVector4K);
  console.log('✓ Created 4K Vector Rendered PNG');

  // 6. Transparent SVG & 4K PNG (Without black background box - perfect for overlays & mockups)
  const transparentSvg = infiniteSvg
    .replace('<rect x="32" y="32" width="960" height="960" rx="224" fill="url(#bgGrad)"/>', '')
    .replace('<rect x="32" y="32" width="960" height="960" rx="224" stroke="#13231F" stroke-width="3"/>', '');

  const pSvgTransparent = path.join(outFolder, 'Otium_Logo_Transparent_Vector.svg');
  fs.writeFileSync(pSvgTransparent, transparentSvg, 'utf8');

  const p4KTransparent = path.join(outFolder, 'Otium_Logo_Transparent_4K.png');
  await sharp(Buffer.from(transparentSvg))
    .resize(4096, 4096)
    .png({ quality: 100, compressionLevel: 8 })
    .toFile(p4KTransparent);
  console.log('✓ Created 4K Transparent Logo PNG & SVG');

  console.log('\nAll high-resolution files successfully exported to:', outFolder);
}

exportAll().catch(console.error);
