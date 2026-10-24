import * as pdfjsLib from 'pdfjs-dist';
// Import worker as a bundled asset URL in Vite
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

if (typeof window !== 'undefined' && 'Worker' in window) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
}

export { pdfjsLib };
