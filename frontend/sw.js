const CACHE_NAME = 'consistency-cache-v27';
const STATIC_ASSETS = [
  '/',
  'index.html',
  'landing.html',
  'script.js',
  'style.css',
  'manifest.json',
  'checklist.png',
  'icon-192.png',
  'icon-512.png',
  'js/libs/lucide/lucide.min.js',
  'libs/dexie.js',
  'libs/gsap.min.js',
  'libs/ScrollTrigger.min.js',
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
  
  // Skip Jitsi Meet - let the browser handle its own CSP and network
  if (url.hostname.includes('jitsi.belnet.be')) return;

  // Check if it's a core asset or a common static file extension
  const isCoreAsset = STATIC_ASSETS.includes(url.pathname) || 
                     url.pathname === '/' || 
                     url.pathname.endsWith('.js') || 
                     url.pathname.endsWith('.css') || 
                     url.pathname.endsWith('.png') || 
                     url.pathname.endsWith('.jpg') || 
                     url.pathname.endsWith('.jpeg') || 
                     url.pathname.endsWith('.svg') || 
                     url.pathname.endsWith('.woff2') || 
                     url.pathname.endsWith('.ttf') || 
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
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            if (event.request.mode === 'navigate') {
              return caches.match('landing.html').then((fallback) => {
                if (fallback) return fallback;
                return caches.match('/');
              });
            }
          });
        })
    );
  } else {
    // Cache-First for other assets
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
