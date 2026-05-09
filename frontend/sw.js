const CACHE_NAME = 'consistency-cache-v21';
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
  'about1.png',
  'about2.png',
  'about3.jpg',
  'about4.png',
  'about5.png',
  'about6.jpg',
  'about7.jpg',
  'about8.jpg',
  'about9.png',
  'about10.png',
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

// 4. FETCH: Network-First Strategy for core assets, Cache-First for others
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and API calls (let them go to network)
  if (event.request.method !== 'GET' || url.pathname.includes('/api/')) return;

  const isCoreAsset = STATIC_ASSETS.includes(url.pathname) || 
                     url.pathname === '/' || 
                     url.pathname.endsWith('.js') || 
                     url.pathname.endsWith('.css') || 
                     url.pathname.endsWith('.png') || 
                     url.pathname.endsWith('.jpg') || 
                     url.pathname.endsWith('.html');

  if (isCoreAsset) {
    // Network-First for core application files
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const resClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, resClone);
            });
          }
          return response;
        })
        .catch(() => caches.match(event.request)) // Fallback to cache if offline
    );
  } else {
    // Cache-First for other assets (images, fonts, etc.)
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.status === 200) {
            const resClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, resClone);
            });
          }
          return response;
        });
      })
    );
  }
});
