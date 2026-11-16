const CACHE_NAME = 'ganadocontrol-erp-v3';

const ARCHIVOS_ESENCIALES = [
    './',
    './index.html',
    './style.css',
    './manifest.json',
    './logo.jpg',
    './js/hato.js',
    'https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js',
    'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js',
    'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js',
    'https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js'
];

// 1. Instalación: guarda la app y Firebase en la memoria interna del dispositivo
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ARCHIVOS_ESENCIALES))
            .then(() => self.skipWaiting())
    );
});

// 2. Activación: borra versiones viejas y avisa a la app que ya funciona offline
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        }).then(() => self.clients.claim())
          .then(async () => {
              const clientes = await self.clients.matchAll({ includeUncontrolled: true });
              clientes.forEach((client) => {
                  client.postMessage({ type: 'OFFLINE_LISTO' });
              });
          })
    );
});

// 3. Interceptar peticiones: abre al instante desde memoria local y actualiza en segundo plano
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = event.request.url;

    // Dejar que Firebase Firestore/Auth maneje su propia base de datos offline (IndexedDB)
    if (
        url.includes('firestore.googleapis.com') ||
        url.includes('identitytoolkit.googleapis.com') ||
        url.includes('securetoken.googleapis.com') ||
        url.includes('firebasestorage.googleapis.com')
    ) {
        return;
    }

    event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then((respuestaEnCache) => {
            const peticionRed = fetch(event.request).then((respuestaRed) => {
                if (respuestaRed && (respuestaRed.status === 200 || respuestaRed.type === 'opaque')) {
                    const copia = respuestaRed.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
                }
                return respuestaRed;
            }).catch(() => {
                // Si no hay internet y es una navegación de página, devolver index.html desde caché
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html', { ignoreSearch: true });
                }
            });

            // Devuelve lo guardado en el teléfono/PC al instante; si no existe aún, espera la red
            return respuestaEnCache || peticionRed;
        })
    );
});
