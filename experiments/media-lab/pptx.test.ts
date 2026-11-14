import { expect, it, vi } from 'vitest';
import { openPptx, readSlide } from '../../src/media/pptx';
import { crc32, LocalZip, resolvePart } from '../../src/media/zip';
import { zipFixture, deckParts, slideXml } from './test/fixture';

it('reads native deflate, slide order, geometry, Arabic and basic run styling locally', async () => {
  const deck = await openPptx(zipFixture(deckParts()));
  expect(deck.slides).toEqual(['ppt/slides/slide2.xml', 'ppt/slides/slide1.xml']);
  expect([deck.width, deck.height]).toEqual([960, 540]);
  const slide = await readSlide(deck, 1);
  expect(slide.elements[0]).toMatchObject({ x: 10, y: 20, width: 500, height: 100, fill: '#CCFFEE' });
  expect(slide.elements[0].paragraphs[0].runs[0]).toMatchObject({ text: 'مرحبا Otium', size: 24, bold: true });
  expect((await readSlide(deck, 2)).elements[0].paragraphs[0].runs[0].text).toBe('Second');
});
it('also supports stored ZIP entries and rejects invalid CRC data', async () => {
  expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  const buffer = zipFixture({ 'a.xml': '<root>good</root>' }, false);
  const zip = new LocalZip(buffer);
  expect(new TextDecoder().decode(await zip.read('a.xml'))).toContain('good');
  new Uint8Array(buffer)[35] ^= 1;
  await expect(zip.read('a.xml')).rejects.toThrow();
});
it('rejects traversal, duplicates, oversized advertised data and malformed ZIP', () => {
  expect(() => new LocalZip(zipFixture({ '../escape.xml': 'bad' }))).toThrow();
  const buffer = zipFixture({ 'a.xml': 'x' });
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  const central = bytes.findIndex((_, at) => at + 4 < bytes.length && view.getUint32(at, true) === 0x02014b50);
  view.setUint32(central + 24, 20 * 1024 ** 2, true);
  expect(() => new LocalZip(buffer)).toThrow();
  expect(() => new LocalZip(new ArrayBuffer(100))).toThrow();
});
it('bounds actual decompression even when an archive lies about its inflated size', async () => {
  const buffer = zipFixture({ 'large.xml': 'x'.repeat(100_000) });
  const view = new DataView(buffer), bytes = new Uint8Array(buffer);
  const central = bytes.findIndex((_, at) => at + 4 < bytes.length && view.getUint32(at, true) === 0x02014b50);
  view.setUint32(central + 24, 10, true);
  await expect(new LocalZip(buffer).read('large.xml')).rejects.toThrow();
});
it('rejects DTD/entity XML and honors cancellation before parsing', async () => {
  const zip = new LocalZip(zipFixture({ 'bad.xml': '<!DOCTYPE x [<!ENTITY a "boom">]><x>&a;</x>' }));
  await expect(zip.xml('bad.xml')).rejects.toThrow();
  const controller = new AbortController(); controller.abort();
  await expect(zip.read('bad.xml', 1000, controller.signal)).rejects.toThrow();
});
it('ignores external relationships and rejects paths escaping the package', async () => {
  const parts = deckParts();
  parts['ppt/_rels/presentation.xml.rels'] = '<Relationships><Relationship Id="rId1" Type="x/slide" Target="https://example.test/slide.xml" TargetMode="External"/></Relationships>';
  await expect(openPptx(zipFixture(parts))).rejects.toThrow();
  expect(resolvePart('ppt/slides/slide1.xml', '../media/image.png')).toBe('ppt/media/image.png');
  for (const target of ['../../../escape', 'https://example.test/a', '\\server\\file']) expect(resolvePart('ppt/slides/slide1.xml', target)).toBeNull();
});
it('flags missing group transforms instead of rendering groups at wrong positions', async () => {
  const parts = deckParts();
  parts['ppt/slides/slide2.xml'] = slideXml('text').replace('</p:spTree>', '<p:grpSp/></p:spTree>');
  expect((await readSlide(await openPptx(zipFixture(parts)), 1)).limited).toBe(true);
});

it('inherits placeholder position and text size from layout/master and uses the master background', async () => {
  const parts = deckParts();
  const p = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const a = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const ns = `xmlns:p="${p}" xmlns:a="${a}"`;
  parts['ppt/slides/slide2.xml'] = `<p:sld ${ns}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:p><a:r><a:t>Inherited text</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  parts['ppt/slides/_rels/slide2.xml.rels'] = '<Relationships><Relationship Id="layout" Type="x/slideLayout" Target="../slideLayouts/layout1.xml"/></Relationships>';
  parts['ppt/slideLayouts/layout1.xml'] = `<p:sldLayout ${ns}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="254000" y="508000"/><a:ext cx="6350000" cy="1270000"/></a:xfrm></p:spPr><p:txBody><a:p><a:pPr><a:defRPr sz="3200"/></a:pPr></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sldLayout>`;
  parts['ppt/slideLayouts/_rels/layout1.xml.rels'] = '<Relationships><Relationship Id="master" Type="x/slideMaster" Target="../slideMasters/master1.xml"/></Relationships>';
  parts['ppt/slideMasters/master1.xml'] = `<p:sldMaster ${ns}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="123456"/></a:solidFill></p:bgPr></p:bg><p:spTree/></p:cSld></p:sldMaster>`;
  const slide = await readSlide(await openPptx(zipFixture(parts)), 1);
  expect(slide.background).toBe('#123456');
  expect(slide.elements).toHaveLength(1);
  expect(slide.elements[0]).toMatchObject({ x: 20, y: 40, width: 500, height: 100 });
  expect(slide.elements[0].paragraphs[0].runs[0].size).toBe(32);
});

it('retains group transforms and marks unknown geometry instead of inventing a rectangle', async () => {
  const parts = deckParts();
  const original = String(parts['ppt/slides/slide2.xml']);
  const shape = original.match(/<p:sp>.*<\/p:sp>/)![0];
  const group = `<p:grpSp><p:grpSpPr><a:xfrm><a:off x="1270000" y="635000"/><a:ext cx="12700000" cy="2540000"/><a:chOff x="0" y="0"/><a:chExt cx="6350000" cy="1270000"/></a:xfrm></p:grpSpPr>${shape.replace('prst="rect"', 'prst="cloud"')}</p:grpSp>`;
  parts['ppt/slides/slide2.xml'] = original.replace(shape, group);
  const slide = await readSlide(await openPptx(zipFixture(parts)), 1);
  expect(slide.elements[0].parentTransform).toContain('translate(100 50)');
  expect(slide.elements[0].parentTransform).toContain('scale(2 2)');
  expect(slide.elements[0].geometry).toBe('cloud');
  expect(slide.limited).toBe(true);
});

it('loads embedded image bytes without following an external picture link', async () => {
  const parts = deckParts();
  const original = String(parts['ppt/slides/slide2.xml']);
  const picture = '<p:pic><p:blipFill><a:blip r:embed="picture"/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1270000" cy="1270000"/></a:xfrm></p:spPr></p:pic>';
  parts['ppt/slides/slide2.xml'] = original.replace('</p:spTree>', `${picture}</p:spTree>`);
  parts['ppt/slides/_rels/slide2.xml.rels'] = '<Relationships><Relationship Id="picture" Type="x/image" Target="../media/test.png"/></Relationships>';
  parts['ppt/media/test.png'] = new Uint8Array([137, 80, 78, 71]);
  const slide = await readSlide(await openPptx(zipFixture(parts)), 1);
  expect(slide.elements[1].image?.type).toBe('image/png');
  expect(slide.elements[1].image?.size).toBe(4);
  parts['ppt/slides/_rels/slide2.xml.rels'] = '<Relationships><Relationship Id="picture" Type="x/image" Target="https://example.test/x.png" TargetMode="External"/></Relationships>';
  const blocked = await readSlide(await openPptx(zipFixture(parts)), 1);
  expect(blocked.elements).toHaveLength(1); expect(blocked.limited).toBe(true);
});

it('caches shared slide layout/master/theme XML lookups per Deck and honors AbortSignal', async () => {
  const parts = deckParts();
  const p = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const a = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const ns = `xmlns:p="${p}" xmlns:a="${a}"`;
  parts['ppt/slides/_rels/slide2.xml.rels'] = '<Relationships><Relationship Id="layout" Type="x/slideLayout" Target="../slideLayouts/layout1.xml"/></Relationships>';
  parts['ppt/slides/_rels/slide1.xml.rels'] = '<Relationships><Relationship Id="layout" Type="x/slideLayout" Target="../slideLayouts/layout1.xml"/></Relationships>';
  parts['ppt/slideLayouts/layout1.xml'] = `<p:sldLayout ${ns}><p:cSld><p:spTree/></p:cSld></p:sldLayout>`;
  parts['ppt/slideLayouts/_rels/layout1.xml.rels'] = '<Relationships><Relationship Id="master" Type="x/slideMaster" Target="../slideMasters/master1.xml"/></Relationships>';
  parts['ppt/slideMasters/master1.xml'] = `<p:sldMaster ${ns}><p:cSld><p:spTree/></p:cSld></p:sldMaster>`;
  parts['ppt/slideMasters/_rels/master1.xml.rels'] = '<Relationships><Relationship Id="theme" Type="x/theme" Target="../theme/theme1.xml"/></Relationships>';

  const deck = await openPptx(zipFixture(parts));
  const xmlSpy = vi.spyOn(deck.zip, 'xml');

  await readSlide(deck, 1);
  await readSlide(deck, 2);
  await readSlide(deck, 1);

  const callsForLayout = xmlSpy.mock.calls.filter(([path]) => path === 'ppt/slideLayouts/layout1.xml');
  const callsForMaster = xmlSpy.mock.calls.filter(([path]) => path === 'ppt/slideMasters/master1.xml');
  const callsForSlide2 = xmlSpy.mock.calls.filter(([path]) => path === 'ppt/slides/slide2.xml');
  expect(callsForLayout).toHaveLength(1);
  expect(callsForMaster).toHaveLength(1);
  expect(callsForSlide2).toHaveLength(1);

  const controller = new AbortController();
  controller.abort();
  await expect(readSlide(deck, 1, controller.signal)).rejects.toThrow();
});
