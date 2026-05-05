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
  event.respondWith(
    fetch(event.request).catch(() => {
      if (event.request.mode === 'navigate') {
        return new Response('Offline mode not fully supported yet.');
      }
      return new Response('', { status: 404 });
    })
  );
});
