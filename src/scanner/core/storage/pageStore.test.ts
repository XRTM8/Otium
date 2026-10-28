import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearActiveSessionPages,
  clearScanSession,
  duplicateStoredPage,
  getActiveSessionPages,
  saveActiveSessionPages,
} from './pageStore';
import type { ScannedPage } from '../types';

describe('pageStore persistence and sessions', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearScanSession();
  });

  it('saves, retrieves, and clears active session pages', () => {
    expect(getActiveSessionPages()).toBeNull();

    const mockPages: ScannedPage[] = [
      {
        id: 'page_1',
        thumbnailDataUrl: 'data:image/jpeg;base64,111',
        quad: {
          topLeft: { x: 0, y: 0 },
          topRight: { x: 100, y: 0 },
          bottomRight: { x: 100, y: 140 },
          bottomLeft: { x: 0, y: 140 },
        },
        filter: 'magic',
        timestamp: 1000,
      },
      {
        id: 'page_2',
        thumbnailDataUrl: 'data:image/jpeg;base64,222',
        quad: {
          topLeft: { x: 0, y: 0 },
          topRight: { x: 100, y: 0 },
          bottomRight: { x: 100, y: 140 },
          bottomLeft: { x: 0, y: 140 },
        },
        filter: 'bw',
        timestamp: 2000,
      },
    ];

    saveActiveSessionPages(mockPages);
    const restored = getActiveSessionPages();
    expect(restored).not.toBeNull();
    expect(restored?.length).toBe(2);
    expect(restored?.[0].id).toBe('page_1');
    expect(restored?.[1].filter).toBe('bw');

    clearActiveSessionPages();
    expect(getActiveSessionPages()).toBeNull();
  });

  it('safely handles duplication of nonexistent page without crash', async () => {
    await expect(duplicateStoredPage('ghost_id', 'new_ghost_id')).resolves.toBeUndefined();
  });
});
