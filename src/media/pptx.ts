import { LocalZip, resolvePart } from './zip';
import { parsePptxWithRust } from '../platform/rustEngine';
const all = (node: Document | Element, name: string) => [...node.getElementsByTagName('*')].filter(item => item.localName === name);
const first = (node: Document | Element | undefined, name: string) => node ? all(node, name)[0] : undefined;
const num = (node: Element | undefined, key: string, fallback = 0) => {
  const n = Number(node?.getAttribute(key) ?? fallback);
  return Number.isFinite(n) && Math.abs(n) < 1e10 ? n : fallback;
};
type Relation = { target: string; type: string };
type DeckCache = {
  xml: Map<string, Promise<Document>>;
  rels: Map<string, Promise<Map<string, Relation>>>;
  schemes: Map<string, Promise<Record<string, string>>>;
};
const deckCache = new WeakMap<Deck, DeckCache>();
function getDeckCache(deck: Deck): DeckCache {
  let cached = deckCache.get(deck);
  if (!cached) {
    cached = { xml: new Map(), rels: new Map(), schemes: new Map() };
    deckCache.set(deck, cached);
  }
  return cached;
}
async function cachedXml(deck: Deck, path: string, signal?: AbortSignal): Promise<Document> {
  signal?.throwIfAborted();
  const { xml } = getDeckCache(deck);
  let pending = xml.get(path);
  if (!pending) {
    pending = deck.zip.xml(path).catch((err) => {
      if (xml.get(path) === pending) xml.delete(path);
      throw err;
    });
    xml.set(path, pending);
  }
  const doc = await pending;
  signal?.throwIfAborted();
  return doc;
}
async function relations(zip: LocalZip, source: string, signal?: AbortSignal) {
  const slash = source.lastIndexOf('/');
  const path = `${source.slice(0, slash + 1)}_rels/${source.slice(slash + 1)}.rels`;
  const result = new Map<string, Relation>();
  if (!zip.has(path)) return result;
  for (const rel of all(await zip.xml(path, signal), 'Relationship')) {
    if (rel.getAttribute('TargetMode') === 'External') continue;
    const target = resolvePart(source, rel.getAttribute('Target') ?? '');
    if (target && zip.has(target)) result.set(rel.getAttribute('Id') ?? '', { target, type: rel.getAttribute('Type') ?? '' });
  }
  return result;
}
async function cachedRelations(deck: Deck, source: string, signal?: AbortSignal): Promise<Map<string, Relation>> {
  signal?.throwIfAborted();
  const { rels } = getDeckCache(deck);
  let pending = rels.get(source);
  if (!pending) {
    const slash = source.lastIndexOf('/');
    const path = `${source.slice(0, slash + 1)}_rels/${source.slice(slash + 1)}.rels`;
    pending = (async () => {
      const result = new Map<string, Relation>();
      if (!deck.zip.has(path)) return result;
      for (const rel of all(await cachedXml(deck, path), 'Relationship')) {
        if (rel.getAttribute('TargetMode') === 'External') continue;
        const target = resolvePart(source, rel.getAttribute('Target') ?? '');
        if (target && deck.zip.has(target)) result.set(rel.getAttribute('Id') ?? '', { target, type: rel.getAttribute('Type') ?? '' });
      }
      return result;
    })().catch((err) => {
      if (rels.get(source) === pending) rels.delete(source);
      throw err;
    });
    rels.set(source, pending);
  }
  const map = await pending;
  signal?.throwIfAborted();
  return map;
}
async function cachedThemeScheme(deck: Deck, themePath: string, signal?: AbortSignal): Promise<Record<string, string>> {
  signal?.throwIfAborted();
  const { schemes } = getDeckCache(deck);
  let pending = schemes.get(themePath);
  if (!pending) {
    pending = (async () => {
      const overrides: Record<string, string> = {};
      const scheme = first(await cachedXml(deck, themePath), 'clrScheme');
      if (scheme) {
        const scratch = { ...deck.theme };
        for (const item of scheme.children) {
          const resolved = color(item, scratch, '#000000');
          scratch[item.localName] = resolved;
          overrides[item.localName] = resolved;
        }
      }
      return overrides;
    })().catch((err) => {
      if (schemes.get(themePath) === pending) schemes.delete(themePath);
      throw err;
    });
    schemes.set(themePath, pending);
  }
  const resolved = await pending;
  signal?.throwIfAborted();
  return resolved;
}
const rid = (node: Element, key = 'id') => node.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', key)
  || node.getAttributeNS('http://purl.oclc.org/ooxml/officeDocument/relationships', key) || node.getAttribute(`r:${key}`) || '';
const defaults: Record<string, string> = { dk1: '#000000', lt1: '#ffffff', dk2: '#44546a', lt2: '#e7e6e6', accent1: '#4472c4', accent2: '#ed7d31', accent3: '#a5a5a5', accent4: '#ffc000', accent5: '#5b9bd5', accent6: '#70ad47', tx1: '#000000', bg1: '#ffffff' };
function color(node: Element | undefined, theme: Record<string, string>, fallback: string): string {
  if (!node) return fallback;
  const rgb = first(node, 'srgbClr')?.getAttribute('val') ?? first(node, 'sysClr')?.getAttribute('lastClr');
  if (rgb && /^[0-9a-f]{6}$/i.test(rgb)) return `#${rgb}`;
  return theme[first(node, 'schemeClr')?.getAttribute('val') ?? ''] ?? fallback;
}
export type SlideRun = { text: string; size: number; color: string; bold: boolean; italic: boolean };
export type SlideElement = { x: number; y: number; width: number; height: number; rotation: number; geometry: string;
  fill: string; stroke: string; strokeWidth: number; parentTransform: string; insets: number[]; anchor: string;
  paragraphs: { align: string; rtl: boolean; runs: SlideRun[] }[]; image?: Blob };
export type Slide = { background: string; elements: SlideElement[]; limited: boolean };
export type Deck = { zip: LocalZip; slides: string[]; width: number; height: number; theme: Record<string, string>; nativeSummary?: unknown };
const child = (node: Element | undefined, name: string) => node ? [...node.children].find(item => item.localName === name) : undefined;
const geometries = new Set(['rect', 'roundRect', 'ellipse', 'triangle', 'rtTriangle', 'diamond', 'line']);
function placeholderShape(doc: Document | undefined, placeholder: Element | undefined) {
  if (!doc || !placeholder) return undefined;
  return all(doc, 'sp').find(shape => {
    const match = first(shape, 'ph');
    if (!match) return false;
    const index = placeholder.getAttribute('idx');
    return index !== null ? (match.getAttribute('idx') ?? '0') === index
      : (match.getAttribute('type') ?? 'body') === (placeholder.getAttribute('type') ?? 'body');
  });
}

export async function openPptx(buffer: ArrayBuffer, signal?: AbortSignal): Promise<Deck> {
  const zip = new LocalZip(buffer);
  if (!zip.has('ppt/presentation.xml')) throw new Error('هذا الملف ليس عرض PPTX صالحاً. صيغة PPT القديمة تحتاج تصديراً إلى PPTX أو PDF.');
  const presentation = await zip.xml('ppt/presentation.xml', signal);
  const refs = await relations(zip, 'ppt/presentation.xml', signal);
  const slides = all(presentation, 'sldId').map(node => refs.get(rid(node))).filter(rel => rel?.type.endsWith('/slide')).map(rel => rel!.target);
  if (!slides.length || slides.length > 200) throw new Error('المعاينة تدعم عروضاً من 1 إلى 200 شريحة.');
  const size = first(presentation, 'sldSz');
  const width = num(size, 'cx', 12192000), height = num(size, 'cy', 6858000);
  if (width <= 0 || height <= 0 || width / height > 10 || height / width > 10) throw new Error('أبعاد الشرائح غير صالحة.');
  const theme = { ...defaults };
  if (zip.has('ppt/theme/theme1.xml')) {
    const scheme = first(await zip.xml('ppt/theme/theme1.xml', signal), 'clrScheme');
    if (scheme) for (const item of scheme.children) theme[item.localName] = color(item, theme, '#000000');
    theme.tx1 = theme.dk1 ?? defaults.dk1 ?? '#000000';
    theme.bg1 = theme.lt1 ?? defaults.lt1 ?? '#ffffff';
  }
  const nativeSummary = await parsePptxWithRust(new Uint8Array(buffer));
  signal?.throwIfAborted();
  return { zip, slides, width: width / 12700, height: height / 12700, theme, ...(nativeSummary ? { nativeSummary } : {}) };
}

export async function readSlide(deck: Deck, page: number, signal?: AbortSignal): Promise<Slide> {
  const source = deck.slides[page - 1];
  if (!source) throw new Error('رقم الشريحة غير صالح.');
  const doc = await cachedXml(deck, source, signal);
  const refs = await cachedRelations(deck, source, signal);
  const layoutRef = [...refs.values()].find(rel => rel.type.endsWith('/slideLayout'));
  const layout = layoutRef ? await cachedXml(deck, layoutRef.target, signal) : undefined;
  const layoutRefs = layoutRef ? await cachedRelations(deck, layoutRef.target, signal) : new Map<string, Relation>();
  const masterRef = [...layoutRefs.values()].find(rel => rel.type.endsWith('/slideMaster'));
  const master = masterRef ? await cachedXml(deck, masterRef.target, signal) : undefined;
  const masterRefs = masterRef ? await cachedRelations(deck, masterRef.target, signal) : new Map<string, Relation>();
  const theme = { ...deck.theme };
  const themeRef = [...masterRefs.values()].find(rel => rel.type.endsWith('/theme'));
  if (themeRef) {
    Object.assign(theme, await cachedThemeScheme(deck, themeRef.target, signal));
  }
  for (const attr of first(master, 'clrMap')?.attributes ?? []) {
    const mapped = theme[attr.value];
    if (mapped !== undefined) theme[attr.name] = mapped;
  }
  const elements: SlideElement[] = [];
  let limited = false;
  let imageBytes = 0;
  let textCount = 0;
  const parse = async (nodes: Element[], layerRefs: Map<string, Relation>, parentTransform = '', depth = 0, template = false) => {
    for (const node of nodes) {
    signal?.throwIfAborted();
    if (['nvGrpSpPr', 'grpSpPr'].includes(node.localName)) continue;
    if (node.localName === 'grpSp') {
      const transform = first(child(node, 'grpSpPr'), 'xfrm');
      const off = first(transform, 'off'), ext = first(transform, 'ext');
      const origin = first(transform, 'chOff'), childExt = first(transform, 'chExt');
      const w = num(ext, 'cx'), h = num(ext, 'cy');
      const sx = w / num(childExt, 'cx'), sy = h / num(childExt, 'cy');
      if (!transform || depth >= 8 || w <= 0 || h <= 0 || !Number.isFinite(sx) || !Number.isFinite(sy) || sx <= 0 || sy <= 0 || sx > 1000 || sy > 1000) { limited = true; continue; }
      const group = `translate(${num(off, 'x') / 12700} ${num(off, 'y') / 12700}) rotate(${num(transform, 'rot') / 60000} ${w / 25400} ${h / 25400}) scale(${sx} ${sy}) translate(${-num(origin, 'x') / 12700} ${-num(origin, 'y') / 12700})`;
      if (transform.getAttribute('flipH') === '1' || transform.getAttribute('flipV') === '1') limited = true;
      await parse([...node.children], layerRefs, `${parentTransform} ${group}`, depth + 1, template);
      continue;
    }
    if (!['sp', 'pic', 'cxnSp'].includes(node.localName)) { limited = true; continue; }
    if (template && first(node, 'ph')) continue;
    if (elements.length >= 500) throw new Error('الشريحة تحتوي عناصر أكثر من حد المعاينة.');
    const placeholder = first(node, 'ph');
    const inherited = placeholderShape(layout, placeholder);
    const masterShape = placeholderShape(master, placeholder);
    const transform = first(child(node, 'spPr'), 'xfrm') ?? first(inherited, 'xfrm') ?? first(masterShape, 'xfrm');
    if (!transform) { limited = true; continue; }
    const off = first(transform, 'off'), ext = first(transform, 'ext');
    const width = num(ext, 'cx'), height = num(ext, 'cy');
    if (width <= 0 || height < 0) { limited = true; continue; }
    const props = child(node, 'spPr');
    const fillNode = child(props, 'solidFill') ?? (child(props, 'noFill') ? undefined : child(child(inherited, 'spPr'), 'solidFill'));
    const line = child(props, 'ln');
    const body = child(node, 'txBody');
    const bodyPr = child(body, 'bodyPr') ?? first(inherited, 'bodyPr');
    const geometry = first(props, 'custGeom') ? 'unsupported' : first(props, 'prstGeom')?.getAttribute('prst') ?? (node.localName === 'cxnSp' ? 'line' : 'rect');
    if (!geometries.has(geometry) || first(props, 'gradFill') || first(node, 'srcRect') || first(props, 'gd')) limited = true;
    if (transform.getAttribute('flipH') === '1' || transform.getAttribute('flipV') === '1') limited = true;
    const element: SlideElement = { x: num(off, 'x') / 12700, y: num(off, 'y') / 12700, width: width / 12700, height: Math.max(height, 12700) / 12700, rotation: num(transform, 'rot') / 60000,
      geometry, parentTransform, insets: [num(bodyPr, 'tIns', 45720), num(bodyPr, 'rIns', 91440), num(bodyPr, 'bIns', 45720), num(bodyPr, 'lIns', 91440)].map(value => Math.max(0, Math.min(value / 12700, 100))),
      anchor: bodyPr?.getAttribute('anchor') ?? 't', strokeWidth: num(line, 'w', 12700) / 12700,
      fill: color(fillNode, theme, 'none'), stroke: child(line, 'noFill') ? 'none' : color(line, theme, 'none'), paragraphs: [] };
    if (body) for (const paragraph of [...body.children].filter(item => item.localName === 'p')) {
      const ppr = first(paragraph, 'pPr');
      const runs: SlideRun[] = [];
      const styleName = ['title', 'ctrTitle'].includes(placeholder?.getAttribute('type') ?? '') ? 'titleStyle' : 'bodyStyle';
      const inheritedRpr = first(inherited, 'defRPr') ?? first(masterShape, 'defRPr') ?? first(first(master, styleName), 'defRPr');
      const paragraphRpr = first(paragraph, 'defRPr') ?? inheritedRpr;
      const bullet = first(ppr, 'buChar')?.getAttribute('char');
      for (const run of [...paragraph.children]) {
        if (!['r', 'fld', 'br'].includes(run.localName)) continue;
        const text = run.localName === 'br' ? '\n' : first(run, 't')?.textContent ?? '';
        textCount += text.length;
        if (textCount > 100_000) throw new Error('نص الشريحة أكبر من حد المعاينة.');
        const rpr = first(run, 'rPr') ?? paragraphRpr;
        runs.push({ text: `${!runs.length && bullet ? `${bullet} ` : ''}${text}`, size: Math.max(600, Math.min(10000, num(rpr, 'sz', num(paragraphRpr, 'sz', 2400)))) / 100,
          color: color(first(rpr, 'solidFill') ?? first(paragraphRpr, 'solidFill'), theme, theme.tx1 ?? '#000000'), bold: (rpr?.getAttribute('b') ?? paragraphRpr?.getAttribute('b')) === '1', italic: (rpr?.getAttribute('i') ?? paragraphRpr?.getAttribute('i')) === '1' });
      }
      element.paragraphs.push({ align: ppr?.getAttribute('algn') ?? 'l', rtl: ppr?.getAttribute('rtl') === '1', runs });
    }
    if (node.localName === 'pic') {
      const blip = first(node, 'blip');
      const relation = blip && layerRefs.get(rid(blip, 'embed'));
      const extension = relation?.target.split('.').pop()?.toLowerCase();
      const mime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
      if (relation?.type.endsWith('/image') && extension && mime[extension]) {
        const image = await deck.zip.read(relation.target, 16 * 1024 ** 2, signal);
        imageBytes += image.length;
        if (imageBytes > 32 * 1024 ** 2) throw new Error('صور الشريحة أكبر من حد المعاينة.');
        element.image = new Blob([image.slice().buffer as ArrayBuffer], { type: mime[extension] });
      } else { limited = true; continue; }
    }
    elements.push(element);
  }
  };
  for (const [layer, layerRefs] of [[master, masterRefs], [layout, layoutRefs]] as const) {
    if (!layer || doc.documentElement.getAttribute('showMasterSp') === '0') continue;
    const tree = first(layer, 'spTree');
    await parse(tree ? [...tree.children] : [], layerRefs, '', 0, true);
  }
  const tree = first(doc, 'spTree');
  await parse(tree ? [...tree.children] : [], refs);
  if (all(doc, 'timing').length || all(doc, 'videoFile').length) limited = true;
  const background = color(first(doc, 'bg') ?? (layout && first(layout, 'bg')) ?? (master && first(master, 'bg')), theme, '#ffffff');
  return { background, elements, limited };
}
