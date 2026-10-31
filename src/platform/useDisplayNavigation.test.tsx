// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { nextRemoteTarget, useDisplayNavigation } from './useDisplayNavigation';
import { saveDeviceUsage } from './deviceUsage';
const box = (x: number, y: number) => {
  const element = document.createElement('button');
  element.getBoundingClientRect = () => ({ x, y, left: x, top: y, right: x + 50, bottom: y + 50, width: 50, height: 50, toJSON() {} });
  element.getClientRects = () => [element.getBoundingClientRect()] as unknown as DOMRectList;
  return element;
};
it('moves by physical direction, independent of the interface language', () => {
  const center = box(100, 100), right = box(200, 100), left = box(0, 100), below = box(100, 200);
  const elements = [center, right, left, below];
  expect(nextRemoteTarget(elements, center, 'ArrowRight')).toBe(right);
  expect(nextRemoteTarget(elements, center, 'ArrowLeft')).toBe(left);
  expect(nextRemoteTarget(elements, center, 'ArrowDown')).toBe(below);
  expect(nextRemoteTarget(elements, null, 'ArrowRight')).toBe(center);
});
it('keeps D-pad focus inside a modal and suppresses duplicate Enter presses', async () => {
  saveDeviceUsage('display');
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const outside = box(0, 0), first = box(100, 100), second = box(200, 100);
  const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
  dialog.getClientRects = () => [first.getBoundingClientRect()] as unknown as DOMRectList;
  dialog.append(first, second); host.append(outside, dialog);
  let clicks = 0; second.onclick = () => { clicks++; };
  function Bindings() { useDisplayNavigation(); return null; }
  try {
    await act(async () => root.render(<Bindings />));
    // React's root owns its children, so add the controls after mounting it.
    host.append(outside, dialog);
    outside.focus();
    first.scrollIntoView = () => {}; second.scrollIntoView = () => {};
    outside.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(first);
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(second);
    second.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    second.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true }));
    expect(clicks).toBe(1);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
