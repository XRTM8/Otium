// @vitest-environment happy-dom
import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useMediaDrawing } from './useMediaDrawing';
import { loadDrawing, saveDrawing } from './library';
import type { InkStroke } from './drawing';
vi.mock('./library', () => ({ loadDrawing: vi.fn(), saveDrawing: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement, current: ReturnType<typeof useMediaDrawing>;
function Probe({ page = 1 }: { page?: number }) {
  const value = useMediaDrawing('media:test', true, true, page);
  useLayoutEffect(() => { current = value; }, [value]);
  return null;
}
const stroke: InkStroke = { color: '#ff0000', width: 0.01, opacity: 1, points: [{ x: 0.1, y: 0.2 }] };
beforeEach(() => {
  vi.mocked(loadDrawing).mockResolvedValue({}); vi.mocked(saveDrawing).mockResolvedValue();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it('keeps ink and undo history separate between slides and saves the latest snapshot', async () => {
  await act(async () => root.render(<Probe />));
  await act(async () => current.change([stroke]));
  expect(current.status).toBe('saved');
  await act(async () => root.render(<Probe page={2} />));
  expect(current.strokes).toEqual([]);
  await act(async () => current.change([{ ...stroke, color: '#00ff00' }]));
  await act(async () => root.render(<Probe />));
  expect(current.strokes).toEqual([stroke]);
  await act(async () => current.undo()); expect(current.strokes).toEqual([]);
  await act(async () => current.redo()); expect(current.strokes).toEqual([stroke]);
  expect(saveDrawing).toHaveBeenLastCalledWith('media:test', { 1: [stroke], 2: [{ ...stroke, color: '#00ff00' }] });
});
it('restores saved ink and blocks edits if restoration fails', async () => {
  vi.mocked(loadDrawing).mockRejectedValue(new Error('blocked'));
  await act(async () => root.render(<Probe />));
  expect(current.ready).toBe(false);
  await act(async () => current.change([stroke]));
  expect(saveDrawing).not.toHaveBeenCalled();
  expect(current.status).toBe('error');
});
it('retains unsaved ink on a failed write and retries on the next edit', async () => {
  vi.mocked(loadDrawing).mockResolvedValue({ 1: [stroke] });
  await act(async () => root.render(<Probe />));
  expect(current.strokes).toEqual([stroke]);
  vi.mocked(saveDrawing).mockRejectedValueOnce(new Error('quota'));
  await act(async () => current.change([]));
  expect(current.status).toBe('error'); expect(current.ready).toBe(true);
  await act(async () => current.undo());
  expect(current.status).toBe('saved'); expect(current.strokes).toEqual([stroke]);
});
it('restores all backup pages and allows undo without exporting an old snapshot', async () => {
  vi.mocked(loadDrawing).mockResolvedValue({ 1: [stroke] });
  await act(async () => root.render(<Probe />));
  const replacement = { ...stroke, color: '#00ff00' };
  await act(async () => current.replaceDrawing({ 1: [replacement], 2: [stroke] }));
  expect(current.getDrawing()).toEqual({ 1: [replacement], 2: [stroke] });
  await act(async () => current.undo());
  expect(current.getDrawing()[1]).toEqual([stroke]);
  await act(async () => root.render(<Probe page={2} />));
  expect(current.strokes).toEqual([stroke]);
});
