import { stripControlChars } from '../../core/utils/textSanitize';

export interface OcrWordToken {
  text: string;
  x: number; // normalized page coordinate
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
const graphemes = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

// PDF text operators put glyphs in visual order, including for invisible text.
function visualOcrWord(word: string): string {
  if (!/[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(word)) return word;
  const reverse = (text: string) => (graphemes
    ? Array.from(graphemes.segment(text), ({ segment }) => segment)
    : text.match(/[^\p{M}]\p{M}*|\p{M}+/gu) ?? []).reverse().join('');
  // Preserve the order within Latin and decimal runs after reversing the RTL token.
  return reverse(word).replace(/[\p{Script=Latin}\p{Nd}]+(?:[.,٫٬/_-][\p{Script=Latin}\p{Nd}]+)*/gu, reverse);
}

/**
 * Builds a PDF from canvases already available to the caller.
 */
export async function createPdfFromCanvases(
  pagesInput: (HTMLCanvasElement | PdfPageInput)[],
  compressionPreset: PdfCompressionPreset = 'balanced',
  pageFormat: PdfPageFormat = 'a4',
  watermarkText?: string,
  watermarkStyle: PdfWatermarkStyle = 'diagonal'
): Promise<Blob> {
  const pages = pagesInput.map((item) => 'canvas' in item ? item : { canvas: item });
  return createScannedPdf(pages, pages.length, compressionPreset, pageFormat, watermarkText, watermarkStyle);
}

export async function createScannedPdf(
  pages: Iterable<PdfPageInput> | AsyncIterable<PdfPageInput>,
  pageCount: number,
  compressionPreset: PdfCompressionPreset,
  pageFormat: PdfPageFormat,
  watermarkText?: string,
  watermarkStyle: PdfWatermarkStyle = 'diagonal',
): Promise<Blob> {
  const offsets: number[] = [];
  const catalogIndex = 1;
  const pagesContainerIndex = 2;
  const fontObjIndex = 3;
  const descendantIndex = 4;
  const unicodeIndex = 5;
  const descriptorIndex = 6;
  const firstImageIndex = 7;
  const pageRefs = Array.from({ length: pageCount }, (_, index) => `${firstImageIndex + index * 3 + 1} 0 R`).join(' ');
  const characters = new Map<string, string>();
  const encodeText = (value: string) => Array.from(value, (character) => {
    let code = characters.get(character);
    if (!code) {
      if (characters.size >= 0xfffe) throw new Error('Too many distinct characters in the scan');
      code = (characters.size + 1).toString(16).padStart(4, '0');
      characters.set(character, code);
    }
    return code;
  }).join('');

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
  writeText(`${pagesContainerIndex} 0 obj\n<< /Type /Pages /Kids [ ${pageRefs} ] /Count ${pageCount} >>\nendobj\n`);

  let objCounter = firstImageIndex;
  let written = 0;
  for await (const { canvas, words = [] } of pages) {
    const { optCanvas, quality } = getOptimizedCanvas(canvas, compressionPreset);
    const width = optCanvas.width;
    const height = optCanvas.height;
    let bytes: Uint8Array;
    try {
      if (watermarkText?.trim()) applyCanvasWatermark(optCanvas, watermarkText.trim(), watermarkStyle);
      const blob = await new Promise<Blob>((resolve, reject) =>
        optCanvas.toBlob((result) => result?.size ? resolve(result) : reject(new Error('Could not encode a PDF page')), 'image/jpeg', quality)
      );
      bytes = new Uint8Array(await blob.arrayBuffer());
    } finally {
      optCanvas.width = optCanvas.height = 1;
    }
    const spec = { width, height, bytes, words };
    written++;
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
        const sanitized = stripControlChars(w.text, { keepLineBreaks: true })
          .replace(/[\r\n\t]+/g, ' ')
          .trim();
        if (!sanitized) continue;

        const wx = (drawX + w.x * drawW).toFixed(2);
        const fontSize = Math.max(1, (w.height || 0.015) * drawH);
        const wy = (drawY + drawH - w.y * drawH - fontSize * 0.82).toFixed(2);
        const charCount = Array.from(sanitized).length;
        const scale = w.width > 0 ? Math.max(1, w.width * drawW / (charCount * fontSize) * 100) : 100;
        textOperators += `/F1 ${fontSize.toFixed(2)} Tf ${scale.toFixed(2)} Tz 1 0 0 1 ${wx} ${wy} Tm <${encodeText(visualOcrWord(sanitized))}> Tj\n`;
      }

      if (textOperators.length > 0) {
        contentStream += `BT\n3 Tr\n${textOperators}ET\n`;
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

  if (written !== pageCount) throw new Error('Scan page count changed during PDF export');

  recordOffset(fontObjIndex);
  writeText(`${fontObjIndex} 0 obj\n<< /Type /Font /Subtype /Type0 /BaseFont /OtiumOCR /Encoding /Identity-H /DescendantFonts [${descendantIndex} 0 R] /ToUnicode ${unicodeIndex} 0 R >>\nendobj\n`);
  recordOffset(descendantIndex);
  writeText(`${descendantIndex} 0 obj\n<< /Type /Font /Subtype /CIDFontType2 /BaseFont /OtiumOCR /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptorIndex} 0 R /DW 1000 /CIDToGIDMap /Identity >>\nendobj\n`);
  recordOffset(descriptorIndex);
  writeText(`${descriptorIndex} 0 obj\n<< /Type /FontDescriptor /FontName /OtiumOCR /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 900 /Descent -200 /CapHeight 700 /StemV 80 >>\nendobj\n`);
  const entries = Array.from(characters, ([character, code]) => {
    const utf16 = character.split('').map((unit) => unit.charCodeAt(0).toString(16).padStart(4, '0')).join('');
    return `<${code}> <${utf16}>`;
  });
  let cmap = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /OtiumOCRUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
  for (let i = 0; i < entries.length; i += 100) {
    const chunk = entries.slice(i, i + 100);
    cmap += `${chunk.length} beginbfchar\n${chunk.join('\n')}\nendbfchar\n`;
  }
  cmap += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n';
  recordOffset(unicodeIndex);
  writeText(`${unicodeIndex} 0 obj\n<< /Length ${cmap.length} >>\nstream\n${cmap}endstream\nendobj\n`);

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
    maxDimension = 3600;
    quality = 0.94;
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
  const targetW = Math.max(1, Math.round(w * scale));
  const targetH = Math.max(1, Math.round(h * scale));

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
