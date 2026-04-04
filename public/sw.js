const CACHE_NAME = 'eonet-globe-tiles-v1';

const TILE_URL_PATTERNS = [
  /\.mapbox\.com/,
  /api\.maptiler\.com/,
  /basemaps\.cartocdn\.com/,
  /tile\.openstreetmap\.org/,
  /demotiles\.maplibre\.org/,
  /server\.arcgisonline\.com/
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  const isTile = TILE_URL_PATTERNS.some((pattern) => pattern.test(url));

  if (!isTile) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        });
      })
    )
  );
});
