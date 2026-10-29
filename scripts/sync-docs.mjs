import { existsSync, rmSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const distDir = resolve(rootDir, 'dist');
const docsDir = resolve(rootDir, 'docs');

if (!existsSync(distDir)) {
  console.error('[sync-docs] dist/ directory does not exist. Run build first.');
  process.exit(1);
}

// Clean previous docs directory completely
if (existsSync(docsDir)) {
  rmSync(docsDir, { recursive: true, force: true });
}
mkdirSync(docsDir, { recursive: true });

// Copy full dist output to docs directory
cpSync(distDir, docsDir, { recursive: true });

// Ensure .nojekyll exists for GitHub Pages
writeFileSync(resolve(docsDir, '.nojekyll'), '');

console.log('[sync-docs] Successfully synced built Otium web app to docs/ directory for GitHub Pages.');
