import { fileURLToPath } from 'node:url';
import { cpSync, mkdirSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  publicDir: '.generated-assets',
  plugins: [{
    name: 'lab-local-pdf-resources',
    configResolved() {
      const destination = fileURLToPath(new URL('./.generated-assets', import.meta.url));
      mkdirSync(destination, { recursive: true });
      for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
        cpSync(fileURLToPath(new URL(`../../node_modules/pdfjs-dist/${folder}`, import.meta.url)), `${destination}/${folder}`, { recursive: true });
      }
    },
  }, react(), {
    name: 'lab-development-csp',
    apply: 'serve',
    transformIndexHtml: html => html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
  }],
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
  preview: { host: '127.0.0.1', port: 5188, strictPort: true },
  build: { outDir: '../../dist-media-lab', emptyOutDir: true, target: 'es2022' },
});
