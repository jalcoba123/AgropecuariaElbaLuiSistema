const CACHE_NAME = 'ganadocontrol-erp-v3';
const ASSETS = [
  './',
  './index.html',
  './js/hato.js',
  './js/modulos-erp.js',
  './js/online-sync.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (
    e.request.method !== 'GET' ||
    e.request.url.includes('firestore.googleapis.com') ||
    e.request.url.includes('identitytoolkit.googleapis.com') ||
    e.request.url.includes('securetoken.googleapis.com')
  ) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copia));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
