// Otium offline cache is scoped to this application, including /Otium/ on Pages.
const CACHE_NAME = 'otium-offline-v1.9.15';
const APP_ROOT = self.registration.scope;
const PRECACHE_URLS = ['./', './index.html', './manifest.webmanifest'].map(path => new URL(path, APP_ROOT).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('otium-offline-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(APP_ROOT)) return;
  const remember = response => {
    if (response.ok) { const copy = response.clone(); void caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {}); }
    return response;
  };
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (event.request.mode === 'navigate') {
      try {
        const response = await fetch(event.request);
        if (response.ok) return remember(response);
        const cached = await cache.match(event.request) || await cache.match(new URL('./index.html', APP_ROOT).href);
        return cached || response;
      } catch {
        return await cache.match(event.request) || await cache.match(new URL('./index.html', APP_ROOT).href) || Response.error();
      }
    }
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try { return remember(await fetch(event.request)); } catch { return Response.error(); }
  })());
});
