import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Ink } from '../../src/media/Ink';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let svg: SVGSVGElement;
beforeEach(async () => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<StrictMode><Ink enabled color="#ff0000" width={1600} height={900} /></StrictMode>));
  svg = host.querySelector('svg')!;
  svg.setPointerCapture = vi.fn();
  svg.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 800, height: 450, right: 800, bottom: 450, toJSON() {} });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const pointer = async (type: string, clientX = 10, clientY = 10) => {
  await act(async () => svg.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true, button: 0, clientX, clientY })));
};
it('commits the completed stroke after releasing pointer state, without stretching its coordinates', async () => {
  await pointer('pointerdown');
  await pointer('pointermove', 100, 50);
  await pointer('pointerup', 100, 50);
  expect(svg.getAttribute('viewBox')).toBe('0 0 1600 900');
  expect(svg.querySelector('polyline')?.getAttribute('points')).toBe('20,20 200,100');
});
it('discards an interrupted gesture instead of leaving a stuck draft', async () => {
  await pointer('pointerdown');
  await pointer('pointermove', 100, 50);
  await pointer('pointercancel');
  await pointer('pointerup');
  expect(svg.querySelector('polyline')).toBeNull();
  expect(svg.querySelector('circle')).toBeNull();
});
it('cancels an unfinished stroke when returning to navigation', async () => {
  await pointer('pointerdown'); await pointer('pointermove', 100, 50);
  await act(async () => root.render(<StrictMode><Ink enabled={false} color="#ff0000" width={1600} height={900} /></StrictMode>));
  await pointer('pointerup');
  expect(svg.querySelector('polyline')).toBeNull();
});
