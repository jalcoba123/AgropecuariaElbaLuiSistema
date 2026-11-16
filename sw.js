const CACHE_NAME = 'ganadocontrol-vercel-v6';

const ARCHIVOS = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/logo.jpg',
  '/js/hato.js?v=123',
  'https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js'
];

async function limpiarRedireccion(response) {
  if (!response.redirected) return response;
  const body = await response.blob();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of ARCHIVOS) {
        try {
          const resp = await fetch(url, { cache: 'reload' });
          if (resp.ok) {
            const limpia = await limpiarRedireccion(resp);
            await cache.put(url, limpia);
          }
        } catch (e) {
          console.warn('Omitido en caché:', url);
        }
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    event.respondWith(new Response('', { headers: { 'Content-Type': 'text/css' } }));
    return;
  }

  if (url.includes('firestore.googleapis.com') || url.includes('identitytoolkit.googleapis.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then(async (networkResp) => {
          if (networkResp && networkResp.status === 200 && event.request.method === 'GET') {
            const limpia = await limpiarRedireccion(networkResp.clone());
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, limpia));
          }
          return networkResp;
        })
        .catch(async () => {
          if (event.request.mode === 'navigate') {
            return (await caches.match('/')) || (await caches.match('/index.html'));
          }
        });
    })
  );
});
