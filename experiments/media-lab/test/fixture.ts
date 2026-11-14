import { deflateRawSync } from 'node:zlib';
import { crc32 } from '../../../src/media/zip.ts';

export function zipFixture(files: Record<string, string | Uint8Array>, compress = true) {
  const chunks: Uint8Array[] = [], directory: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    const packed = compress ? new Uint8Array(deflateRawSync(data)) : data;
    const filename = new TextEncoder().encode(name);
    const local = new Uint8Array(30 + filename.length + packed.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(8, compress ? 8 : 0, true);
    v.setUint32(14, crc32(data), true); v.setUint32(18, packed.length, true); v.setUint32(22, data.length, true);
    v.setUint16(26, filename.length, true); local.set(filename, 30); local.set(packed, 30 + filename.length);
    const central = new Uint8Array(46 + filename.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(6, 20, true); c.setUint16(10, compress ? 8 : 0, true);
    c.setUint32(16, crc32(data), true); c.setUint32(20, packed.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, filename.length, true); c.setUint32(42, offset, true); central.set(filename, 46);
    chunks.push(local); directory.push(central); offset += local.length;
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, directory.length, true); e.setUint16(10, directory.length, true);
  const length = directory.reduce((sum, item) => sum + item.length, 0);
  e.setUint32(12, length, true); e.setUint32(16, offset, true);
  const result = new Uint8Array(offset + length + 22);
  let at = 0;
  for (const chunk of [...chunks, ...directory, end]) { result.set(chunk, at); at += chunk.length; }
  return result.buffer;
}

const ns = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const relns = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const slideXml = (text: string) => `<p:sld ${ns}><p:cSld><p:spTree><p:sp><p:spPr><a:xfrm><a:off x="127000" y="254000"/><a:ext cx="6350000" cy="1270000"/></a:xfrm><a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="CCFFEE"/></a:solidFill></p:spPr><p:txBody><a:p><a:r><a:rPr sz="2400" b="1"/><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
export function deckParts(): Record<string, string | Uint8Array> {
  return {
    // happy-dom drops r:id when the same element also has an unqualified id.
    // Numeric slide IDs are unused by the viewer, so omit them in this fixture.
    'ppt/presentation.xml': `<p:presentation ${ns}><p:sldIdLst><p:sldId r:id="rId2"/><p:sldId r:id="rId1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': `<Relationships><Relationship Id="rId1" Type="${relns}/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="${relns}/slide" Target="slides/slide2.xml"/></Relationships>`,
    'ppt/slides/slide1.xml': slideXml('Second'),
    'ppt/slides/slide2.xml': slideXml('مرحبا Otium'),
  };
}
