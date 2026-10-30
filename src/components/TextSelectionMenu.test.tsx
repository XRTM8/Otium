// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const publishSelection = vi.hoisted(() => vi.fn());
vi.mock('./DocumentInk', () => ({ useDocumentInteraction: () => ({ mode: 'select', publishSelection }) }));
import { TextSelectionMenu } from './TextSelectionMenu';

let root: Root, host: HTMLDivElement, page: HTMLDivElement, text: HTMLSpanElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue([new DOMRect(20, 100, 160, 20)] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 600));
  page = document.createElement('div'); page.dataset.pageNumber = '1'; page.dataset.pdfPage = '1';
  text = document.createElement('span'); text.textContent = 'A carefully selected sentence'; page.appendChild(text); document.body.appendChild(page);
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); page.remove(); window.getSelection()?.removeAllRanges();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});
async function select() {
  const range = document.createRange(); range.selectNodeContents(text);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  await act(async () => { document.dispatchEvent(new Event('selectionchange')); vi.advanceTimersByTime(110); });
}
it('keeps mobile selection actions compact and reveals secondary actions on request', async () => {
  await act(async () => root.render(<TextSelectionMenu mobile lang="en" onAddAnnotation={vi.fn()} onSearchSelectedText={vi.fn()} />));
  await select();
  expect(host.querySelector('button[title="Copy"]')).not.toBeNull();
  expect(host.querySelector('button[title="Search"]')).toBeNull();
  expect(host.textContent).not.toContain('Selected text');
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="More selection tools"]')!.click());
  expect(host.querySelector('button[title="Search"]')).not.toBeNull();
  expect(window.getSelection()!.toString()).toBe(text.textContent);
});
it('preserves native selection during dragging and scroll, then saves the highlight on demand', async () => {
  const add = vi.fn();
  await act(async () => root.render(<TextSelectionMenu lang="en" onAddAnnotation={add} />));
  await select();
  await act(async () => {
    text.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, pointerType: 'mouse', bubbles: true }));
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(150);
  });
  expect(window.getSelection()!.toString()).toBe(text.textContent);
  expect(host.querySelector('button[title="Copy"]')).not.toBeNull();
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label^="Highlight "]')!.click());
  expect(add).toHaveBeenCalledOnce();
  expect(add.mock.calls[0][0]).toMatchObject({ pageNumber: 1, text: text.textContent, type: 'highlight' });
  expect(host.textContent).toBe('');
});
