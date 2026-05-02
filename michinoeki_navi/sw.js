const CACHE_NAME = 'michinoeki-navi-v1';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './landing.css',
    './app.js',
    './js/shared.js',
    './autorecomend/index.html',
    './autorecomend/recommend.js',
    './list/index.html',
    './list/list.js',
    './detail/index.html',
    './detail/detail.js',
    './icon/icon.png',
    './icon/Google_Maps.png',
    './icon/X_logo-black.png',
    './icon/line.png',
    './icon/copy.png',
    './icon/home.png',
    './icon/back.png',
    './icon/share.png',
    './icon/light.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
