import { describe, expect, it } from 'vitest';
import { readBoard, writeBoard, type BoardSnapshot } from './boardStorage';
const stroke = { id: 'line', tool: 'pen' as const, color: '#e11d48', width: 4, points: [{ x: 250, y: 320 }, { x: 680, y: 320 }] };
describe('saved teaching boards', () => {
  it('restores pages, erasure undo history and clips under the document identity', async () => {
    const snapshot: BoardSnapshot = { pages: [
      { id: 'first', strokes: [stroke], redoStack: [], undoStack: [[]], background: 'grid' },
      { id: 'second', strokes: [], redoStack: [], undoStack: [[stroke]], background: 'dark' }
    ], currentPage: 1, snippets: [{ id: 'quote', type: 'text', content: 'Lesson', x: 30, y: 50, width: 300, height: 100, pageNumber: 2, createdAt: 1 }] };
    await writeBoard('book-a', snapshot);
    expect(await readBoard('book-a')).toEqual(snapshot);
    expect(await readBoard('book-b')).toBeNull();
    await writeBoard('book-a', { ...snapshot, currentPage: 0 });
    expect((await readBoard('book-a'))?.pages[1].undoStack?.[0]).toEqual([stroke]);
  });
  it('does not present a damaged saved lesson as an empty editable board', async () => {
    await writeBoard('damaged', { pages: [], currentPage: 99, snippets: [] });
    await expect(readBoard('damaged')).rejects.toThrow('invalid');
  });
});
