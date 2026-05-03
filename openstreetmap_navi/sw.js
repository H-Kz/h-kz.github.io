const CACHE_NAME = 'aura-drive-v1';
const CACHE_ASSETS = [
    '/',
    '/index.html',
    '/app.js',
    '/style.css',
    '/manifest.json',
    '/icons/nav-arrow.svg',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap',
    'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js',
    'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css',
    'https://unpkg.com/lucide@latest'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(CACHE_ASSETS).catch(err => {
                console.warn('SW cache partial failure:', err);
            });
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    if (!event.request.url.startsWith('http')) return;
    const url = new URL(event.request.url);

    // Don't cache map tiles or API calls — always fetch fresh
    const isMapData = url.hostname.includes('openstreetmap') ||
        url.hostname.includes('carto') ||
        url.hostname.includes('osrm') ||
        url.hostname.includes('nominatim') ||
        url.hostname.includes('openrailwaymap') ||
        url.hostname.includes('opentopomap') ||
        url.hostname.includes('rainviewer') ||
        url.hostname.includes('arcgisonline') ||
        url.hostname.includes('gsi.go.jp') ||
        url.hostname.includes('waymarkedtrails');

    if (isMapData) {
        event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
        return;
    }

    // Cache-first for app shell
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });
                return response;
            });
        })
    );
});
