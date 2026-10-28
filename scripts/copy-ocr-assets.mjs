/**
 * Copies the Tesseract worker and WASM core into `public/tesseract` so the OCR
 * engine is served from the app itself.
 *
 * Why not the CDN defaults? Two reasons:
 *  - the production CSP only allows 'self' (no jsdelivr), so the default paths
 *    would be blocked and OCR would fail silently;
 *  - a local-first app should not need a network round trip to start its engine.
 *
 * Only the LSTM-only builds are copied because the app always creates workers
 * with OEM 1. A device without SIMD support falls back to the plain build, so
 * all three variants have to be present.
 *
 * The language models (`*.traineddata.gz`) are intentionally NOT vendored:
 * they are downloaded once on first use and cached locally in IndexedDB.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'public', 'tesseract');
const coreTarget = path.join(target, 'core');

const workerSource = path.join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
const coreSource = path.join(root, 'node_modules', 'tesseract.js-core');

const coreFiles = [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js'
];

if (!existsSync(workerSource) || !existsSync(coreSource)) {
  console.error(
    'OCR assets are missing. Run `npm ci` (or `npm install`) before building so\n' +
      'tesseract.js and tesseract.js-core are present in node_modules.'
  );
  process.exit(1);
}

mkdirSync(coreTarget, { recursive: true });
copyFileSync(workerSource, path.join(target, 'worker.min.js'));

for (const file of coreFiles) {
  const source = path.join(coreSource, file);
  if (!existsSync(source)) {
    console.error(`Missing OCR core file: ${file}`);
    process.exit(1);
  }
  copyFileSync(source, path.join(coreTarget, file));
}

console.log(
  `OCR engine staged in public/tesseract (worker + ${coreFiles.length} WASM core variants).`
);
