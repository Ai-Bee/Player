// Basic service worker implementing Cache First for media assets and Network First for JSON APIs.
const MEDIA_CACHE = 'media-v1';
const API_CACHE = 'api-v1';
const STATIC_CACHE = 'static-v1';

const MEDIA_PATTERN = /\/media\//;
const API_PATTERN = /\/api\//;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(STATIC_CACHE));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => ![MEDIA_CACHE, API_CACHE, STATIC_CACHE].includes(k)).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (MEDIA_PATTERN.test(url.pathname)) {
    event.respondWith(cacheFirst(req, MEDIA_CACHE));
    return;
  }
  if (API_PATTERN.test(url.pathname) && req.method === 'GET') {
    event.respondWith(networkFirst(req, API_CACHE));
    return;
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return cached || new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}
