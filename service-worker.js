const CACHE_NAME = 'astrostack-v3';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './worker.js',
  './manifest.json',
  './lib/fits.js',
  './lib/starDetect.js',
  './lib/align.js',
  './lib/calibration.js',
  './lib/stack.js',
  './lib/denoise.js',
  './lib/stretch.js',
  './lib/tiff.js',
  './lib/trailDetect.js',
  './lib/catalog.js',
  './lib/quality.js',
  './lib/gradient.js',
  './plateSolve.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
