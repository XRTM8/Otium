import 'fake-indexeddb/auto';
import { beforeEach } from 'vitest';

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

(globalThis as any).localStorage = localStorageMock;
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    indexedDB: globalThis.indexedDB,
    localStorage: localStorageMock,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis)
  };
} else {
  (globalThis as any).window.localStorage = localStorageMock;
  (globalThis as any).window.indexedDB = globalThis.indexedDB;
}

beforeEach(() => {
  values.clear();
});
