import { describe, expect, it } from 'vitest';
import { clampPoint, EMPTY_INK, hitInk, inkHistory, mergeInk, readInk, writeInk, type InkMark } from './ink';

const mark: InkMark = { id: 'pen', page: 1, type: 'pen', color: '#e11d48', width: 0.004, points: [{ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.3 }] };

describe('page-relative document ink', () => {
  it('hits a line between its sampled points at different zoom levels', () => {
    expect(hitInk(mark, { x: 0.5, y: 0.3 }, 600, 800)).toBe(true);
    expect(hitInk(mark, { x: 0.5, y: 0.3 }, 1800, 2400)).toBe(true);
    expect(hitInk(mark, { x: 0.5, y: 0.8 }, 600, 800)).toBe(false);
    expect(clampPoint(-2, 5)).toEqual({ x: 0, y: 1 });
  });

  it('restores erased marks and invalidates redo after a new edit', () => {
    let state = inkHistory(EMPTY_INK, { type: 'change', marks: [mark] });
    state = inkHistory(state, { type: 'change', marks: [] });
    state = inkHistory(state, { type: 'undo' });
    expect(state.present).toEqual([mark]);
    state = inkHistory(state, { type: 'redo' });
    expect(state.present).toEqual([]);
    state = inkHistory(state, { type: 'undo' });
    state = inkHistory(state, { type: 'change', marks: [{ ...mark, id: 'new' }] });
    expect(state.future).toHaveLength(0);
  });

  it('keeps notes from the other device when undoing a local pen stroke', () => {
    const remote: InkMark = { ...mark, id: 'remote' };
    let state = inkHistory(EMPTY_INK, { type: 'change', marks: [mark] });
    state = inkHistory(state, { type: 'remote', upsert: [remote] });
    state = inkHistory(state, { type: 'undo' });
    expect(state.present).toEqual([remote]);
  });

  it('merges edits without duplicate IDs and ignores invalid peer data', () => {
    const edited = { ...mark, color: '#000000' };
    expect(mergeInk([mark], [edited, edited])).toEqual([edited]);
    expect(mergeInk([mark], [], ['pen'])).toEqual([]);
    expect(mergeInk([], [{ ...mark, points: [{ x: NaN, y: 0 }] }])).toEqual([]);
    expect(mergeInk([], [{ ...mark, points: [null as any] }])).toEqual([]);
  });

  it('persists marks by document identity and does not mix pages or books', async () => {
    await writeInk('book-a', [mark, { ...mark, id: 'page-2', page: 2 }]);
    await writeInk('book-b', []);
    expect(await readInk('book-a')).toHaveLength(2);
    expect(await readInk('book-b')).toEqual([]);
    await writeInk('book-a', []);
    expect(await readInk('book-a')).toEqual([]);
  });
});
