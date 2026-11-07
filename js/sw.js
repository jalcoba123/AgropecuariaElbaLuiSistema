// sw.js - Service Worker para GanadoControl ERP
const CACHE_NAME = 'elbalui-erp-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './js/hato.js',
    './logo.jpg'
];

// Instalar y guardar archivos esenciales en memoria del dispositivo
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('📦 Guardando aplicación en memoria local para uso Offline...');
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// Activar y limpiar cachés viejas
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                })
            );
        })
    );
    self.clients.claim();
});

// Responder desde la memoria si no hay internet
self.addEventListener('fetch', (e) => {
    // Si la petición es para Firebase API, dejamos que pase directo a la librería de Firestore
    if (e.request.url.includes('firestore.googleapis.com') || e.request.url.includes('firebase')) {
        return;
    }

    e.respondWith(
        caches.match(e.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(e.request).catch(() => {
                // Si falla la red y no está en caché, devuelve el index
                return caches.match('./index.html');
            });
        })
    );
});
