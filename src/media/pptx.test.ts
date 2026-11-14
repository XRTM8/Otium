// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openPptx } from './pptx';
import { crc32 } from './zip';

const pptxMocks = vi.hoisted(() => ({
  parsePptxWithRust: vi.fn<() => Promise<unknown>>(),
}));

vi.mock('../platform/rustEngine', () => ({
  parsePptxWithRust: pptxMocks.parsePptxWithRust,
}));

function buildStoredZip(files: Array<{ name: string; content: string }>): ArrayBuffer {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + 22);
  let cursor = 0;
  for (const part of localParts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  out.set(eocd, cursor);
  return out.buffer;
}

const sampleDeckFiles = [
  {
    name: 'ppt/presentation.xml',
    content:
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<p:sldIdLst><p:sldId r:id="rId1"/></p:sldIdLst>' +
      '<p:sldSz cx="12192000" cy="6858000"/>' +
      '</p:presentation>',
  },
  {
    name: 'ppt/_rels/presentation.xml.rels',
    content:
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>' +
      '</Relationships>',
  },
  {
    name: 'ppt/slides/slide1.xml',
    content: '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>',
  },
];

describe('openPptx Rust bridge and fallback', () => {
  afterEach(() => {
    pptxMocks.parsePptxWithRust.mockReset();
  });

  it('attaches nativeSummary when parsePptxWithRust succeeds', async () => {
    const summary = { slide_count: 1, title: 'Demo Deck' };
    pptxMocks.parsePptxWithRust.mockResolvedValueOnce(summary);

    const deck = await openPptx(buildStoredZip(sampleDeckFiles));
    expect(deck.slides).toEqual(['ppt/slides/slide1.xml']);
    expect(deck.width).toBe(960);
    expect(deck.height).toBe(540);
    expect(deck.nativeSummary).toEqual(summary);
  });

  it('opens deck seamlessly without nativeSummary when Rust bridge returns null', async () => {
    pptxMocks.parsePptxWithRust.mockResolvedValueOnce(null);

    const deck = await openPptx(buildStoredZip(sampleDeckFiles));
    expect(deck.slides).toEqual(['ppt/slides/slide1.xml']);
    expect(deck.nativeSummary).toBeUndefined();
  });
});
