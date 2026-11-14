import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { Pptx } from '../../src/media/SlideView';
import { readSlide } from '../../src/media/pptx';
import type { Deck, Slide } from '../../src/media/pptx';
vi.mock('../../src/media/pptx', () => ({ readSlide: vi.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const deck = {} as Deck;
const slide = { background: '#fff', limited: false, elements: [{ x: 0, y: 0, width: 100, height: 100, rotation: 0,
  geometry: 'rect', fill: 'none', stroke: 'none', strokeWidth: 1, parentTransform: '', insets: [0, 0, 0, 0], anchor: 't',
  paragraphs: [], image: new Blob(['image'], { type: 'image/png' }) }] } satisfies Slide;
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:slide-image');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it('releases image URLs when a slide is replaced and when the viewer closes', async () => {
  vi.mocked(readSlide).mockResolvedValue(slide);
  const onError = vi.fn();
  await act(async () => root.render(<Pptx deck={deck} page={1} onError={onError} />));
  expect(host.querySelector('image')).toBeTruthy();
  await act(async () => root.render(<Pptx deck={deck} page={2} onError={onError} />));
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  await act(async () => root.render(null));
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});
it('does not allocate image URLs for a late slide after the source has closed', async () => {
  let finish!: (slide: Slide) => void;
  vi.mocked(readSlide).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const onError = vi.fn();
  await act(async () => root.render(<Pptx deck={deck} page={1} onError={onError} />));
  await act(async () => root.render(null));
  await act(async () => finish(slide));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});
