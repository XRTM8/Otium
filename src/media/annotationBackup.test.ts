import { expect, it } from 'vitest';
import { inkSvg, parseInkBackup, serializeInkBackup, type InkSource } from './annotationBackup';
import type { MediaDrawing } from './drawing';
const source: InkSource = { name:'درس.pptx',size:123,kind:'presentation' };
const drawing: MediaDrawing = { 1:[{ color:'#ff0000',width:.003,opacity:1,points:[{x:.123456789,y:.8}] }],2:[] };
it('roundtrips a restorable backup without dropping empty pages or exceeding coordinate bounds', () => {
 const restored=parseInkBackup(serializeInkBackup(source,drawing),source);
 expect(restored[1][0].points[0].x).toBeCloseTo(.123456789,6); expect(restored[2]).toEqual([]);
});
it('rejects a backup from a different source and invalid page or color content', () => {
 const backup=serializeInkBackup(source,drawing);
 expect(()=>parseInkBackup(backup,{...source,size:124})).toThrow();
 const hostile=JSON.parse(backup); hostile.pages[1][0].color='url(https://invalid)';
 expect(()=>parseInkBackup(JSON.stringify(hostile),source)).toThrow();
 hostile.version=2; expect(()=>parseInkBackup(JSON.stringify(hostile),source)).toThrow();
});
it('exports only self-contained transparent vector ink without document or executable content', () => {
 const svg=inkSvg(drawing,1,1600,900);
 expect(svg).toContain('viewBox="0 0 1600 900"'); expect(svg).toContain('<circle');
 expect(svg).not.toMatch(/script|foreignObject|href|onload|<image/);
 expect(()=>inkSvg(drawing,1,Infinity,900)).toThrow();
});
