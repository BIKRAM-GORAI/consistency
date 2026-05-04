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
  projectId: "consistency-daily",
  messagingSenderId: "567475143375", // This should be your sender ID, but if you don't have it, FCM might complain.
  // We actually need the config from auth.html
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
    data: data.fcmOptions?.link || '/'
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
