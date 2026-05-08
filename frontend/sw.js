const CACHE_NAME = 'consistency-cache-v18';
const STATIC_ASSETS = [
  '/',
  'index.html',
  'landing.html',
  'script.js',
  'style.css',
  'manifest.json',
  'checklist.png',
  'libs/dexie.js',
  'libs/gsap.min.js',
  'libs/ScrollTrigger.min.js',
  'libs/lucide.min.js',
  'https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700;800;900&display=swap'
];

// 1. INSTALL: Pre-cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// 2. ACTIVATE: Cleanup old caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// 3. MESSAGE: Listen for skip waiting command
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 4. FETCH: Smart Caching Strategies
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and API calls
  if (event.request.method !== 'GET' || url.pathname.includes('/api/')) return;

  // SPECIAL CACHE RULE: Fonts and Cloudinary Images
  const isFont = event.request.destination === 'font' || url.hostname.includes('gstatic.com') || url.hostname.includes('googleapis.com');
  const isImage = event.request.destination === 'image' || url.hostname.includes('cloudinary.com');

  if (isFont || isImage) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        }).catch(() => {
          return new Response('Network error occurred', { status: 408 });
        });
      })
    );
    return;
  }

  // STANDARD CACHE RULE: Cache-First, then Network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Only cache successful static responses
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('index.html') || caches.match('/');
        return new Response('Offline resource not found.', { status: 404 });
      });
    })
  );
});
