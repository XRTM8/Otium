/**
 * Zero-dependency, ultra-fast client-side PDF generator from JPEG image buffers.
 * Implements standard PDF 1.4 DCTDecode embedding (ISO 32000-1).
 */

export interface PdfImagePage {
  width: number;
  height: number;
  jpegBytes: Uint8Array;
}

export function buildPdfFromJpegPages(pages: PdfImagePage[]): Uint8Array {
  if (pages.length === 0) {
    throw new Error('At least one page is required to generate a PDF');
  }

  const chunks: (Uint8Array | string)[] = [];
  const offsets: number[] = [];
  let currentOffset = 0;

  function pushString(str: string) {
    const enc = new TextEncoder().encode(str);
    chunks.push(enc);
    currentOffset += enc.length;
  }

  function pushBytes(bytes: Uint8Array) {
    chunks.push(bytes);
    currentOffset += bytes.length;
  }

  // Header
  pushString('%PDF-1.4\r\n%\xE2\xE3\xCF\xD3\r\n');

  // We assign object numbers:
  // Obj 1: Catalog
  // Obj 2: Pages
  // For each page i (0 to N-1):
  //   Obj 3 + i*3: Page
  //   Obj 4 + i*3: Content Stream
  //   Obj 5 + i*3: Image XObject

  const totalPages = pages.length;
  const totalObjects = 2 + totalPages * 3;

  // Obj 1: Catalog
  offsets[1] = currentOffset;
  pushString(`1 0 obj\r\n<<\r\n  /Type /Catalog\r\n  /Pages 2 0 R\r\n>>\r\nendobj\r\n`);

  // Obj 2: Pages
  offsets[2] = currentOffset;
  const kidsStr = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  pushString(`2 0 obj\r\n<<\r\n  /Type /Pages\r\n  /Kids [${kidsStr}]\r\n  /Count ${totalPages}\r\n>>\r\nendobj\r\n`);

  for (let i = 0; i < totalPages; i++) {
    const page = pages[i];
    const pageObjId = 3 + i * 3;
    const contentObjId = pageObjId + 1;
    const imageObjId = pageObjId + 2;

    const w = Math.round(page.width);
    const h = Math.round(page.height);

    // Page object
    offsets[pageObjId] = currentOffset;
    pushString(
      `${pageObjId} 0 obj\r\n<<\r\n  /Type /Page\r\n  /Parent 2 0 R\r\n  /MediaBox [0 0 ${w} ${h}]\r\n  /Resources <<\r\n    /XObject <<\r\n      /Im1 ${imageObjId} 0 R\r\n    >>\r\n  >>\r\n  /Contents ${contentObjId} 0 R\r\n>>\r\nendobj\r\n`
    );

    // Content stream object: scale and draw image Im1
    offsets[contentObjId] = currentOffset;
    const contentStream = `q\r\n${w} 0 0 ${h} 0 0 cm\r\n/Im1 Do\r\nQ\r\n`;
    const contentStreamBytes = new TextEncoder().encode(contentStream);
    pushString(
      `${contentObjId} 0 obj\r\n<<\r\n  /Length ${contentStreamBytes.length}\r\n>>\r\nstream\r\n${contentStream}endstream\r\nendobj\r\n`
    );

    // Image XObject with DCTDecode (JPEG)
    offsets[imageObjId] = currentOffset;
    pushString(
      `${imageObjId} 0 obj\r\n<<\r\n  /Type /XObject\r\n  /Subtype /Image\r\n  /Width ${w}\r\n  /Height ${h}\r\n  /ColorSpace /DeviceRGB\r\n  /BitsPerComponent 8\r\n  /Filter /DCTDecode\r\n  /Length ${page.jpegBytes.length}\r\n>>\r\nstream\r\n`
    );
    pushBytes(page.jpegBytes);
    pushString(`\r\nendstream\r\nendobj\r\n`);
  }

  // Cross-reference table
  const startXref = currentOffset;
  pushString(`xref\r\n0 ${totalObjects + 1}\r\n0000000000 65535 f \r\n`);

  for (let i = 1; i <= totalObjects; i++) {
    const off = offsets[i] ?? 0;
    const offPadded = off.toString().padStart(10, '0');
    pushString(`${offPadded} 00000 n \r\n`);
  }

  // Trailer
  pushString(
    `trailer\r\n<<\r\n  /Size ${totalObjects + 1}\r\n  /Root 1 0 R\r\n>>\r\nstartxref\r\n${startXref}\r\n%%EOF\r\n`
  );

  // Flatten chunks into a single Uint8Array
  const totalLength = chunks.reduce((acc, c) => acc + (c instanceof Uint8Array ? c.length : 0), 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const c of chunks) {
    if (c instanceof Uint8Array) {
      result.set(c, pos);
      pos += c.length;
    }
  }

  return result;
}
