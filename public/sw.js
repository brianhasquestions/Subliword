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
const VERSION = 'v2';
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Navigations: prefer fresh network, fall back to cache / app shell offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(req).then((cached) => cached || caches.match('/index.html'))
      )
    );
    return;
  }

  // Cross-origin CDN assets: cache-first into the runtime cache.
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res && (res.status === 200 || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached))
    );
    return;
  }

  // Same-origin static assets: cache-first, then network (and cache the result).
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(APP_CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    }))
  );
});
