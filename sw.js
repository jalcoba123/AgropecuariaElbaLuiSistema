const CACHE_NAME = 'ganadocontrol-erp-v7';

const LOCAL_ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './logo.jpg',
  './js/hato.js',
  './js/lecheria.js',
  './js/modulos-erp.js',
  './js/online-sync.js'
];

const FIREBASE_SDK_ASSETS = [
  'https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        LOCAL_ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn('[SW] No se pudo cachear:', url, err))
        )
      );
      await Promise.allSettled(
        FIREBASE_SDK_ASSETS.map((url) =>
          cache.add(new Request(url, { mode: 'cors' })).catch((err) =>
            console.warn('[SW] No se pudo cachear SDK:', url, err)
          )
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'OFFLINE_LISTO' }));
      })
  );
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  if (
    e.request.method !== 'GET' ||
    url.includes('firestore.googleapis.com') ||
    url.includes('identitytoolkit.googleapis.com') ||
    url.includes('securetoken.googleapis.com') ||
    url.includes('firebasestorage.googleapis.com')
  ) {
    return;
  }

  if (e.request.mode === 'navigate') {
    const networkFetch = fetch(e.request)
      .then((res) => {
        if (res && res.status === 200) {
          const copia = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('./index.html', copia));
        }
        return res;
      })
      .catch(() => null);

    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve(null), 3000);
    });

    e.respondWith(
      Promise.race([networkFetch, timeoutPromise]).then(async (res) => {
        if (res) return res;
        const cached = await caches.match('./index.html');
        if (cached) return cached;
        return networkFetch.then((r) => r || new Response('Sin conexión', { status: 503, statusText: 'Offline' }));
      })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cached) => {
      const fetchAndCache = fetch(e.request)
        .then((res) => {
          if (res && (res.status === 200 || res.type === 'opaque')) {
            const copia = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copia));
          }
          return res;
        })
        .catch(() => cached || new Response('', { status: 503, statusText: 'Offline' }));

      return cached || fetchAndCache;
    })
  );
});
