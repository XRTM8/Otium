export interface OcrWordToken {
  text: string;
  x: number; // percentage (0 to 1) or natural px
  y: number;
  width: number;
  height: number;
}

export interface PdfPageInput {
  canvas: HTMLCanvasElement;
  words?: OcrWordToken[];
}

export type PdfCompressionPreset = 'compact' | 'balanced' | 'max';
export type PdfPageFormat = 'a4' | 'fit';
export type PdfWatermarkStyle = 'diagonal' | 'tiled';

const textEncoder = new TextEncoder();

/**
 * Enterprise Searchable PDF 1.4 Compiler with Smart Multi-Tier Compression
 * and Standard ISO A4 Page Normalization (595x842 pt).
 */
export async function createPdfFromCanvases(
  pagesInput: (HTMLCanvasElement | PdfPageInput)[],
  compressionPreset: PdfCompressionPreset = 'balanced',
  pageFormat: PdfPageFormat = 'a4',
  watermarkText?: string,
  watermarkStyle: PdfWatermarkStyle = 'diagonal'
): Promise<Blob> {
  const pages: PdfPageInput[] = pagesInput.map((item) =>
    'canvas' in item ? item : { canvas: item, words: [] }
  );

  const offsets: number[] = [];

  // Convert canvases to optimized JPEG bytes in controlled batches to avoid mobile OOM crashes
  const BATCH_SIZE = 2;
  const imageSpecs: {
    width: number;
    height: number;
    bytes: Uint8Array;
    words: OcrWordToken[];
  }[] = [];

  for (let i = 0; i < pages.length; i += BATCH_SIZE) {
    const chunk = pages.slice(i, i + BATCH_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(async ({ canvas, words }) => {
        const { optCanvas, quality } = getOptimizedCanvas(canvas, compressionPreset);

        // Render high-fidelity Unicode/Arabic watermark directly onto canvas pixels
        if (watermarkText && watermarkText.trim().length > 0) {
          applyCanvasWatermark(optCanvas, watermarkText.trim(), watermarkStyle);
        }

        const blob = await new Promise<Blob>((res) =>
          optCanvas.toBlob((b) => res(b || new Blob()), 'image/jpeg', quality)
        );
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const result = {
          width: optCanvas.width,
          height: optCanvas.height,
          bytes,
          words: words || [],
        };

        // Promptly release internal canvas backing store memory
        optCanvas.width = 1;
        optCanvas.height = 1;

        return result;
      })
    );
    imageSpecs.push(...chunkResults);
  }

  const catalogIndex = 1;
  const pagesContainerIndex = 2;
  const fontObjIndex = 3;

  const pageObjIndices: number[] = [];
  let currentIndex = 4;

  for (let i = 0; i < imageSpecs.length; i++) {
    currentIndex++; // Image XObject
    pageObjIndices.push(currentIndex++); // Page Object
    currentIndex++; // Content stream
  }

  const pageRefs = pageObjIndices.map((idx) => `${idx} 0 R`).join(' ');

  const finalChunks: (Uint8Array | string)[] = [];
  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  let byteOffset = 0;

  function writeText(str: string) {
    finalChunks.push(str);
    byteOffset += textEncoder.encode(str).length;
  }

  function writeBytes(bytes: Uint8Array) {
    finalChunks.push(bytes);
    byteOffset += bytes.length;
  }

  function recordOffset(objIndex: number) {
    offsets[objIndex] = byteOffset;
  }

  writeText(header);

  // 1: Catalog
  recordOffset(catalogIndex);
  writeText(`${catalogIndex} 0 obj\n<< /Type /Catalog /Pages ${pagesContainerIndex} 0 R >>\nendobj\n`);

  // 2: Pages
  recordOffset(pagesContainerIndex);
  writeText(`${pagesContainerIndex} 0 obj\n<< /Type /Pages /Kids [ ${pageRefs} ] /Count ${pageObjIndices.length} >>\nendobj\n`);

  // 3: Base Font (Helvetica for invisible search layer)
  recordOffset(fontObjIndex);
  writeText(`${fontObjIndex} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`);

  let objCounter = 4;
  for (let i = 0; i < imageSpecs.length; i++) {
    const spec = imageSpecs[i];
    const imgObjIdx = objCounter++;
    const pageObjIdx = objCounter++;
    const contentObjIdx = objCounter++;

    let pagePtWidth: number;
    let pagePtHeight: number;
    let drawX: number;
    let drawY: number;
    let drawW: number;
    let drawH: number;

    if (pageFormat === 'a4') {
      const isPortrait = spec.width <= spec.height;
      pagePtWidth = isPortrait ? 595 : 842;
      pagePtHeight = isPortrait ? 842 : 595;

      const margin = 14;
      const availW = pagePtWidth - margin * 2;
      const availH = pagePtHeight - margin * 2;
      const scale = Math.min(availW / spec.width, availH / spec.height);

      drawW = Math.round(spec.width * scale);
      drawH = Math.round(spec.height * scale);
      drawX = Math.round((pagePtWidth - drawW) / 2);
      drawY = Math.round((pagePtHeight - drawH) / 2);
    } else {
      pagePtWidth = Math.round(spec.width * 0.75);
      pagePtHeight = Math.round(spec.height * 0.75);
      drawX = 0;
      drawY = 0;
      drawW = pagePtWidth;
      drawH = pagePtHeight;
    }

    // Image XObject
    recordOffset(imgObjIdx);
    writeText(
      `${imgObjIdx} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${spec.width} /Height ${spec.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${spec.bytes.length} >>\nstream\n`
    );
    writeBytes(spec.bytes);
    writeText('\nendstream\nendobj\n');

    // Content Stream: Paint image background + optional invisible OCR text layer
    let contentStream = `q\n${drawW} 0 0 ${drawH} ${drawX} ${drawY} cm\n/Im0 Do\nQ\n`;

    if (spec.words.length > 0) {
      let textOperators = '';
      for (const w of spec.words) {
        if (!w || typeof w.text !== 'string') continue;
        // Sanitize control characters (\x00-\x1f, except space) and collapse newlines/tabs
        const sanitized = w.text
          .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
          .replace(/[\r\n\t]+/g, ' ')
          .trim();
        if (!sanitized) continue;

        // Escape backslashes, opening and closing parentheses for PDF literal strings
        const escaped = sanitized
          .replace(/\\/g, '\\\\')
          .replace(/\(/g, '\\(')
          .replace(/\)/g, '\\)');

        const wx = Math.round(drawX + (w.x || 0) * drawW);
        const wy = Math.round(drawY + drawH - (w.y || 0) * drawH - 10);
        textOperators += `1 0 0 1 ${wx} ${wy} Tm (${escaped}) Tj\n`;
      }

      if (textOperators.length > 0) {
        contentStream += `BT\n/F1 10 Tf\n3 Tr\n${textOperators}ET\n`;
      }
    }

    const streamLen = textEncoder.encode(contentStream).length;

    recordOffset(contentObjIdx);
    writeText(`${contentObjIdx} 0 obj\n<< /Length ${streamLen} >>\nstream\n${contentStream}endstream\nendobj\n`);

    // Page Object
    recordOffset(pageObjIdx);
    writeText(
      `${pageObjIdx} 0 obj\n<< /Type /Page /Parent ${pagesContainerIndex} 0 R /MediaBox [ 0 0 ${pagePtWidth} ${pagePtHeight} ] /Contents ${contentObjIdx} 0 R /Resources << /XObject << /Im0 ${imgObjIdx} 0 R >> /Font << /F1 ${fontObjIndex} 0 R >> >> >>\nendobj\n`
    );
  }

  // Cross-reference table
  const xrefStart = byteOffset;
  const totalObjs = objCounter;
  writeText(`xref\n0 ${totalObjs}\n`);
  writeText('0000000000 65535 f \n');

  for (let i = 1; i < totalObjs; i++) {
    const off = String(offsets[i] || 0).padStart(10, '0');
    writeText(`${off} 00000 n \n`);
  }

  writeText(
    `trailer\n<< /Size ${totalObjs} /Root ${catalogIndex} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  );

  return new Blob(finalChunks as BlobPart[], { type: 'application/pdf' });
}

function applyCanvasWatermark(
  canvas: HTMLCanvasElement,
  text: string,
  style: PdfWatermarkStyle
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;

  ctx.save();
  ctx.fillStyle = 'rgba(120, 120, 120, 0.22)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (style === 'tiled') {
    ctx.font = `bold ${Math.round(w * 0.042)}px 'Tajawal', sans-serif`;
    ctx.rotate((-45 * Math.PI) / 180);
    const stepX = Math.round(w * 0.4);
    const stepY = Math.round(h * 0.18);
    for (let y = -h; y < h * 2; y += stepY) {
      for (let x = -w; x < w * 2; x += stepX) {
        ctx.fillText(text, x, y);
      }
    }
  } else {
    ctx.font = `bold ${Math.round(w * 0.085)}px 'Tajawal', sans-serif`;
    ctx.translate(w / 2, h / 2);
    ctx.rotate((-45 * Math.PI) / 180);
    ctx.fillText(text, 0, 0);
  }
  ctx.restore();
}

function getOptimizedCanvas(
  canvas: HTMLCanvasElement,
  preset: PdfCompressionPreset
): { optCanvas: HTMLCanvasElement; quality: number } {
  let maxDimension = 2000;
  let quality = 0.78;

  if (preset === 'compact') {
    maxDimension = 1350; // ~150 DPI for standard A4
    quality = 0.65;
  } else if (preset === 'balanced') {
    maxDimension = 1900; // ~200 DPI
    quality = 0.78;
  } else {
    maxDimension = 3200; // Optimal high-res print
    quality = 0.90;
  }

  const w = canvas.width;
  const h = canvas.height;
  const currentMax = Math.max(w, h);

  if (currentMax === 0 || currentMax <= maxDimension) {
    // Clone canvas so watermark or modifications do not mutate source review page
    const copyCanvas = document.createElement('canvas');
    copyCanvas.width = Math.max(1, w);
    copyCanvas.height = Math.max(1, h);
    const ctx = copyCanvas.getContext('2d');
    if (ctx && w > 0 && h > 0) ctx.drawImage(canvas, 0, 0);
    return { optCanvas: copyCanvas, quality };
  }

  const scale = maxDimension / currentMax;
  const targetW = Math.round(w * scale);
  const targetH = Math.round(h * scale);

  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = targetW;
  scaledCanvas.height = targetH;
  const ctx = scaledCanvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, targetW, targetH);
  }

  return { optCanvas: scaledCanvas, quality };
}
