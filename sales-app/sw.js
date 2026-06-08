const CACHE_VERSION = 'v2';
const CACHE_NAME = `sales-app-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/config.js',
  './js/db.js',
  './js/sync.js',
  './js/app.js',
  './js/scanner.js',
  './icon.svg',
];

// ダッシュボードはオフライン不要 → Network First で常に最新を取得
const NETWORK_FIRST_PATHS = ['/dashboard.html', '/dashboard.js'];

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

  // ダッシュボード関連: Network First（常に最新、オフライン時はキャッシュにフォールバック）
  if (NETWORK_FIRST_PATHS.some(p => url.pathname.endsWith(p))) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // App Shell (販売アプリ): Cache First（オフライン対応）
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
