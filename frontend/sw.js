// ── FIREBASE CLOUD MESSAGING (must be at the TOP of the service worker) ──
// Firebase compat scripts must be importScripts'd before any event listeners,
// as required by the Service Worker spec and enforced by mobile browsers.
importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBRQcI00guB6LhRKqUrx_4NbmTFi30r96Y",
  authDomain: "consistency-daily.firebaseapp.com",
  projectId: "consistency-daily",
  databaseURL: "https://consistency-daily-default-rtdb.asia-southeast1.firebasedatabase.app",
  storageBucket: "consistency-daily.firebasestorage.app",
  messagingSenderId: "760797805516",
  appId: "1:760797805516:web:ab7a76cd4f3b2d2232bb69",
  measurementId: "G-GQCYL05KBH"
});

// Initialize Firebase Messaging
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);
});

const CACHE_NAME = 'consistency-cache-v47';
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
  'https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700;800;900&display=swap'
];

// 1. INSTALL: Pre-cache essential assets (resilient - a single 404 won't abort install)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use individual adds so one missing file can't kill the entire install
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err => {
            console.warn('[SW] Failed to cache asset:', url, err.message);
          })
        )
      );
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

  // Skip cross-origin requests immediately (let the browser handle all external calls directly)
  if (url.origin !== self.location.origin) return;

  // Skip non-GET, API calls, and version JSON requests (let them go to network un-cached)
  if (event.request.method !== 'GET' || url.pathname.includes('/api/') || url.pathname === '/app-version.json') return;

  // Only core code assets (HTML, main JS, CSS) should run in Network-First to ensure instant updates
  const isCoreCodeAsset = url.pathname === '/' || 
                          url.pathname === '/index.html' || 
                          url.pathname === '/landing.html' || 
                          url.pathname === '/auth.html' || 
                          url.pathname === '/script.js' || 
                          url.pathname === '/style.css';

  if (isCoreCodeAsset) {
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

// ── CUSTOM PUSH & DEEP-LINK EVENT LISTENERS ──
self.addEventListener('push', function(event) {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: event.data.text() };
    }
  }

  const title = data.notification?.title || 'Consistency Tracker';
  const groupId = data.data?.groupId || '';
  const options = {
    body: data.notification?.body || 'Check your daily streak!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: {
      url: data.fcmOptions?.link || data.data?.link || data.notification?.click_action || '/',
      groupId: groupId
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const clickData = event.notification.data || {};
  let urlToOpen = typeof clickData === 'string' ? clickData : (clickData.url || '/');
  const groupId = clickData.groupId;

  if (groupId) {
    urlToOpen = `/?openChat=${encodeURIComponent(groupId)}&t=${Date.now()}`;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if ('focus' in client) {
          if (groupId) {
            client.navigate(`/?openChat=${encodeURIComponent(groupId)}&t=${Date.now()}`);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});


