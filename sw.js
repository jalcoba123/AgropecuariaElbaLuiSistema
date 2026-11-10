const CACHE_NAME = 'ganadocontrol-elbalui-v1';

// Archivos esenciales de la interfaz para abrir sin internet desde cero
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './js/hato.js',
  './manifest.json',
  './logo.jpg'
];

// 1. Instalación del Service Worker y almacenamiento en caché de la app
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Caché de Agropecuaria ElbaLui abierta exitosamente.');
        return cache.addAll(urlsToCache);
      })
      .catch(err => console.error('❌ Error al almacenar en caché:', err))
  );
  self.skipWaiting();
});

// 2. Activación y limpieza de versiones antiguas de caché
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🧹 Limpiando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Interceptar peticiones para servir la app sin internet
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Si el archivo está en caché, se entrega de inmediato (Funciona 100% offline)
        if (response) {
          return response;
        }
        // Si no está en caché (ej. llamadas a Firebase), se intenta buscar en la red
        return fetch(event.request).catch(() => {
          // Si es una petición de navegación sin internet y falla la red, se puede retornar el index
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
