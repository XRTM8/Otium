import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
const source = readFileSync(new URL('../../../public/sw.js', import.meta.url), 'utf8');
function worker() {
  const handlers = new Map<string, (event: any) => void>();
  const cache = { addAll: vi.fn(async () => {}), match: vi.fn(async (_key: any) => null as Response | null), put: vi.fn(async () => {}) };
  const current = source.match(/const CACHE_NAME = '([^']+)'/)![1];
  const caches = { open: vi.fn(async () => cache), keys: vi.fn(async () => [current, 'otium-offline-old', 'another-app-cache']), delete: vi.fn(async () => true) };
  const fetch = vi.fn().mockRejectedValue(new Error('offline'));
  runInNewContext(source, { self: { registration: { scope: 'https://xrtm8.github.io/Otium/' }, location: { origin: 'https://xrtm8.github.io' }, addEventListener: (type: string, handler: (event: any) => void) => handlers.set(type, handler), skipWaiting() {}, clients: { claim: async () => {} } }, caches, fetch, URL, Response });
  return { handlers, cache, caches };
}
it('precaches the deployed application path instead of the GitHub Pages origin root', async () => {
  const app = worker(); let done!: Promise<unknown>;
  app.handlers.get('install')!({ waitUntil: (value: Promise<unknown>) => { done = value; } }); await done;
  expect(app.cache.addAll).toHaveBeenCalledWith(['https://xrtm8.github.io/Otium/', 'https://xrtm8.github.io/Otium/index.html', 'https://xrtm8.github.io/Otium/manifest.webmanifest']);
});
it('removes old Otium caches without deleting another application cache', async () => {
  const app = worker(); let done!: Promise<unknown>;
  app.handlers.get('activate')!({ waitUntil: (value: Promise<unknown>) => { done = value; } }); await done;
  expect(app.caches.delete).toHaveBeenCalledOnce(); expect(app.caches.delete).toHaveBeenCalledWith('otium-offline-old');
});
it('returns the cached application shell when navigating offline under /Otium/', async () => {
  const app = worker(); app.cache.match.mockImplementation(async key => key === 'https://xrtm8.github.io/Otium/index.html' ? new Response('saved application') : null);
  let response!: Promise<Response>;
  app.handlers.get('fetch')!({ request: { method: 'GET', url: 'https://xrtm8.github.io/Otium/', mode: 'navigate' }, respondWith: (value: Promise<Response>) => { response = value; } });
  expect(await (await response).text()).toBe('saved application');
});
