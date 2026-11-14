// Resolve storage when used so the legacy stores work in both WebViews and tests.
function browserStorage(getStorage: () => Storage): Storage {
  return {
    get length() { return getStorage().length; },
    key: index => getStorage().key(index),
    getItem: key => getStorage().getItem(key),
    setItem: (key, value) => getStorage().setItem(key, value),
    removeItem: key => getStorage().removeItem(key),
    clear: () => getStorage().clear(),
  };
}

export const localStorage = browserStorage(() => globalThis.localStorage);
export const sessionStorage = browserStorage(() => globalThis.sessionStorage);
export const appIndexedDB = {
  open: (name: string, version?: number) => globalThis.indexedDB.open(name, version),
  deleteDatabase: (name: string) => globalThis.indexedDB.deleteDatabase(name),
};
