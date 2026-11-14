import { useEffect, useRef } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';
GlobalWorkerOptions.workerSrc = worker;

export function Pdf({ url, page, onReady, onError }: {
  url: string; page: number;
  onReady: (width: number, height: number, total: number) => void;
  onError: (message: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onReady, onError });
  useEffect(() => { callbacks.current = { onReady, onError }; });
  const doc = useRef<Promise<PDFDocumentProxy> | null>(null);
  useEffect(() => {
    const base = new URL(import.meta.env.BASE_URL, window.location.href).href;
    const task = getDocument({ url, useSystemFonts: true, maxImageSize: 16_000_000,
      cMapUrl: `${base}cmaps/`, cMapPacked: true,
      standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/`,
    });
    doc.current = task.promise;
    // Handle rejection even if a source is closed before the render effect runs.
    void task.promise.then(undefined, (err: unknown) => {
      console.debug('[MediaLabPdf] Page render promise rejected:', err);
    });
    return () => {
      doc.current = null;
      void task.destroy().then(undefined, (err: unknown) => {
        console.debug('[MediaLabPdf] Task destroy skipped:', err);
      });
    };
  }, [url]);
  useEffect(() => {
    if (!url) return;
    let disposed = false;
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    void (async () => {
      try {
        const pdf = await doc.current;
        if (!pdf || disposed) return;
        const selected = await pdf.getPage(Math.min(page, pdf.numPages));
        if (disposed || !canvas.current) return;
        const base = selected.getViewport({ scale: 1 });
        const scale = Math.min(2, Math.sqrt(8_000_000 / (base.width * base.height)));
        const viewport = selected.getViewport({ scale });
        canvas.current.width = Math.ceil(viewport.width);
        canvas.current.height = Math.ceil(viewport.height);
        callbacks.current.onReady(base.width, base.height, pdf.numPages);
        render = selected.render({ canvas: canvas.current, viewport });
        await render.promise;
      } catch (error) {
        if (!disposed && (error as Error).name !== 'RenderingCancelledException') callbacks.current.onError('تعذّر عرض PDF. جرّب ملفاً سليماً غير محمي بكلمة مرور.');
      }
    })();
    return () => { disposed = true; render?.cancel(); };
  }, [url, page]);
  return <canvas ref={canvas} className="pdf-canvas" aria-label={`صفحة PDF ${page}`} />;
}
