const CACHE_NAME = 'consistency-cache-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/landing.html',
  '/script.js',
  '/style.css',
  '/manifest.json',
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
  self.skipWaiting();
});

// 2. ACTIVATE: Cleanup old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 3. FETCH: Smart Caching Strategies
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip API calls (handled by script.js and IndexedDB)
  if (url.pathname.startsWith('/api/')) return;

  // Strategy: Network-First with Cache-Fallback for Navigation (HTML)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html') || caches.match('/landing.html');
      })
    );
    return;
  }

  // Strategy: Cache-First with Network-Fallback for Static Assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      
      return fetch(event.request).then((networkResponse) => {
        // Don't cache range requests or non-GETs
        if (!networkResponse || networkResponse.status !== 200 || event.request.method !== 'GET') {
          return networkResponse;
        }
        
        // Cache external assets (like Google Fonts or Lucide)
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        
        return networkResponse;
      });
    })
  );
});
