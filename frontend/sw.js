const CACHE_NAME = 'consistency-cache-v3';
const STATIC_ASSETS = [
  './',
  './index.html',
  './landing.html',
  './script.js',
  './style.css',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/lucide-static@0.400.0/font/lucide.css',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=Space+Grotesk:wght@300;400;500;700&display=swap'
];

// 1. INSTALL: Pre-cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting(); // Force the waiting service worker to become the active service worker
});

// 2. ACTIVATE: Cleanup old caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim(); // Immediately take control of all open clients
});

// 3. FETCH: Smart Caching Strategies
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip API calls and non-GET requests
  if (url.pathname.includes('/api/') || event.request.method !== 'GET') return;

  // For navigation requests, try network first, then cache index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('./index.html') || caches.match('./landing.html') || caches.match('./');
      })
    );
    return;
  }

  // Strategy: Cache-First, then Network
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      
      return fetch(event.request).then((networkResponse) => {
        // Cache external assets or core files on the fly
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback for failed fetches
        return new Response('Offline resource not found.', { status: 404 });
      });
    })
  );
});
