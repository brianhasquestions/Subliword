/**
 * Subliword Service Worker
 * Provides offline support and installability (PWA).
 *
 * Strategy:
 *  - App shell (same-origin core files): precached on install, cache-first.
 *  - Navigations: network-first, falling back to the cached shell when offline.
 *  - CDN libraries and their runtime assets (PDF.js worker, Tesseract engine +
 *    language data, JSZip): cached at runtime on first use so that features keep
 *    working offline after they have been used once online.
 *
 * Note: the first OCR of a scanned PDF still needs a network connection because
 * Tesseract downloads its engine and language data on demand; once fetched they
 * are cached and subsequent scanned-PDF reads work offline.
 */
const VERSION = 'v8';
const APP_CACHE = `subliword-app-${VERSION}`;
const RUNTIME_CACHE = `subliword-runtime-${VERSION}`;

const APP_SHELL = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/i18n.js',
  '/js/rsvp.js',
  '/js/clientParser.js',
  '/js/main.js',
  '/manifest.json',
  '/favicon.svg',
  '/about.html',
  '/privacy.html',
  '/404.html',
  '/apple-touch-icon.png',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      // addAll is atomic — one 404 fails everything. Add individually instead.
      .then((cache) => Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== APP_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Cache-first: serve from cache, otherwise fetch and cache. For cross-origin
// CDN assets that rarely change (library bytes are pinned by SRI/version).
function cacheFirst(req, cacheName) {
  return caches.match(req).then((cached) => cached || fetch(req).then((res) => {
    if (res && (res.status === 200 || res.type === 'opaque')) {
      const copy = res.clone();
      caches.open(cacheName).then((cache) => cache.put(req, copy));
    }
    return res;
  }).catch(() => cached));
}

// Stale-while-revalidate: serve cache immediately (fast) while refreshing it in
// the background. Every same-origin request in a given page load comes from the
// same cache generation, so HTML and its CSS/JS never mismatch across a deploy.
function staleWhileRevalidate(req, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Cross-origin CDN assets (libraries, Tesseract engine + data): cache-first.
  if (url.origin !== self.location.origin) {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));
    return;
  }

  // Same-origin app shell (HTML, CSS, JS, icons): stale-while-revalidate so the
  // page and its assets stay in sync, with an offline fallback for navigations.
  event.respondWith(
    staleWhileRevalidate(req, APP_CACHE).then((res) =>
      res || (req.mode === 'navigate' ? caches.match('/index.html') : res)
    )
  );
});
