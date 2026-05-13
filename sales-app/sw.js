const CACHE_VERSION = 'v2';
const CACHE_NAME = `sales-app-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './dashboard.html',
  './manifest.json',
  './css/app.css',
  './js/config.js',
  './js/db.js',
  './js/sync.js',
  './js/app.js',
  './js/scanner.js',
  './js/dashboard.js',
  './icon.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // GAS API: Network First
  if (url.hostname === 'script.google.com') {
    event.respondWith(
      fetch(event.request).catch(() => new Response('{"status":"error","message":"offline"}', {
        headers: { 'Content-Type': 'application/json' },
      }))
    );
    return;
  }

  // App Shell: Cache First
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
