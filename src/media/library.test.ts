import { beforeEach, describe, expect, it } from 'vitest';
import { listMedia, loadMedia, loadDrawing, saveDrawing, newMediaItem, removeMedia, storeMedia, updateMedia } from './library';
import type { MediaDrawing } from './drawing';
import { writeFavorites } from '../library/model';

beforeEach(() => removeMedia());
describe('local media library', () => {
  it('persists separate slide ink and deletes it together with the file', async () => {
    const file = new File(['slides'], 'lesson.pptx'), item = newMediaItem(file);
    await storeMedia(file, item);
    const drawing: MediaDrawing = { 1: [{ color: '#e11d48', opacity: 1, width: 0.003, points: [{ x: 0.1, y: 0.2 }] }], 2: [] };
    await saveDrawing(item.id, drawing);
    expect(await loadDrawing(item.id)).toEqual(drawing);
    await saveDrawing(item.id, { ...drawing, 1: [] });
    expect((await loadDrawing(item.id))[1]).toEqual([]);
    await removeMedia(item.id);
    expect(await loadDrawing(item.id)).toEqual({});
    await expect(saveDrawing(item.id, drawing)).rejects.toThrow();
  });
  it('rejects invalid drawing data without overwriting saved ink', async () => {
    const file = new File(['image'], 'lesson.png'), item = newMediaItem(file);
    await storeMedia(file, item);
    await saveDrawing(item.id, { 1: [] });
    await expect(saveDrawing(item.id, { 1: [{ points: [{ x: Infinity, y: 0 }] }] } as unknown as MediaDrawing)).rejects.toThrow();
    expect(await loadDrawing(item.id)).toEqual({ 1: [] });
  });
  it('keeps files with identical names separate and restores their contents', async () => {
    const first = new File(['first'], 'lesson.txt', { type: 'text/plain' });
    const second = new File(['second'], 'lesson.txt', { type: 'text/plain' });
    const a = newMediaItem(first), b = newMediaItem(second);
    await storeMedia(first, a); await storeMedia(second, b);
    expect(a.id).not.toBe(b.id);
    expect(await listMedia()).toHaveLength(2);
    expect(await (await loadMedia(a.id)).file.text()).toBe('first');
    expect(await (await loadMedia(b.id)).file.text()).toBe('second');
  });
  it('saves progress and removes both metadata and file', async () => {
    const file = new File(['slides'], 'lesson.pptx'), item = newMediaItem(file);
    await storeMedia(file, item);
    await updateMedia(item.id, { lastPage: 3, totalPages: 5, position: 12 });
    expect((await loadMedia(item.id)).item).toMatchObject({ lastPage: 3, totalPages: 5, position: 12 });
    await removeMedia(item.id);
    expect(await listMedia()).toEqual([]);
    await expect(loadMedia(item.id)).rejects.toThrow();
  });
  it('evicts the oldest entry at the history limit', async () => {
    let first = '';
    for (let index = 0; index < 13; index++) {
      const file = new File(['video'], `lesson-${index}.mp4`), item = newMediaItem(file);
      item.lastOpened = index + 1;
      if (!index) first = item.id;
      await storeMedia(file, item);
    }
    expect(await listMedia()).toHaveLength(12);
    await expect(loadMedia(first)).rejects.toThrow();
  });
  it('protects annotated files from automatic cache eviction', async () => {
    const file = new File(['image'], 'annotated.png'), item = newMediaItem(file);
    item.lastOpened = 0;
    await storeMedia(file, item); await saveDrawing(item.id, { 1: [] });
    for (let index = 0; index < 13; index++) {
      const next = new File(['clip'], `clip-${index}.mp4`);
      await storeMedia(next, newMediaItem(next));
    }
    expect((await loadMedia(item.id)).file.name).toBe('annotated.png');
    expect(await listMedia()).toHaveLength(12);
  });
  it('keeps favorite media cached until the user removes its favorite status', async () => {
    const file = new File(['clip'], 'favorite.mp4'), item = newMediaItem(file); item.lastOpened = 0;
    await storeMedia(file, item); writeFavorites([item.id]);
    for (let index = 0; index < 13; index++) { const next = new File(['clip'], `clip-${index}.mp4`); await storeMedia(next, newMediaItem(next)); }
    expect((await loadMedia(item.id)).file.name).toBe('favorite.mp4');
    writeFavorites([]);
    const next = new File(['clip'], 'last.mp4'); await storeMedia(next, newMediaItem(next));
    await expect(loadMedia(item.id)).rejects.toThrow();
  });
});
