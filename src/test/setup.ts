import 'fake-indexeddb/auto';
import { beforeEach, vi } from 'vitest';

const values = new Map<string, string>();

const localStorageMock: Storage = {
  get length() {
    return values.size;
  },
  clear: () => values.clear(),
  getItem: (key: string) => values.get(key) ?? null,
  key: (index: number) => [...values.keys()][index] ?? null,
  removeItem: (key: string) => {
    values.delete(key);
  },
  setItem: (key: string, value: string) => {
    values.set(key, String(value));
  }
};

vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('window', {
  indexedDB: globalThis.indexedDB,
  localStorage: localStorageMock,
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis)
});

beforeEach(() => {
  values.clear();
});
