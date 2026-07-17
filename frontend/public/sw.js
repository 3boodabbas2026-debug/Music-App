/*
 * Starhollow service worker.
 *
 * Strategy:
 *  - App shell (navigations): network-first, falling back to the cached shell
 *    so the app still opens offline.
 *  - Hashed static bundles under /_expo/ and /assets/, plus icons: cache-first
 *    (their names change when content changes).
 *  - Everything else (API calls, audio streams): straight to the network —
 *    never cached, range requests and auth must stay live.
 *  - Media explicitly saved for offline playback lives in a separate cache
 *    (see offlineMedia.ts) that this worker never touches or evicts.
 */
// Bump with brand/shell assets so installed PWAs do not keep the previous icon.
const CACHE = 'starhollow-shell-v4';
const OWNED_SHELL_PREFIX = 'starhollow-shell-';
const SHELL = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            // Only remove superseded shell caches. Explicit offline media is
            // user data and must survive a service-worker upgrade.
            .filter((key) => key.startsWith(OWNED_SHELL_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // API/media live on another origin

  // SPA navigations: try the network, fall back to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Immutable build artifacts + icons: cache-first.
  const isStatic =
    url.pathname.startsWith('/_expo/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/favicon.ico';
  if (!isStatic) return;

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
