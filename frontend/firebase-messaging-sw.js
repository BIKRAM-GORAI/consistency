const CACHE_NAME = 'consistency-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // A dummy fetch handler is required for a PWA to be installable.
  // We're just passing requests through for now.
  event.respondWith(fetch(event.request).catch(() => new Response('Offline mode not fully supported yet.')));
});

// Import Firebase libraries for background messaging
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

// We can just rely on the standard push event listener instead of the full SDK here if we want,
// but firebase.messaging() will handle it if we have the right sender ID.
// I will setup a manual push event listener which works with VAPID keys / FCM seamlessly.
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
  const options = {
    body: data.notification?.body || 'Check your daily streak!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: data.fcmOptions?.link || data.data?.link || data.notification?.click_action || '/'
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const urlToOpen = event.notification.data || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
