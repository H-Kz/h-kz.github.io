import { UI } from './js/shared.js';

document.addEventListener('DOMContentLoaded', () => {
    // 0. グローバルアクションの初期化
    UI.initGlobalActions();

    // 0.5 Service Worker の登録
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').then(reg => {
                console.log('SW registered:', reg);
            }).catch(err => {
                console.error('SW registration failed:', err);
            });
        });
    }

    // 1. PWA インストール機能
    let deferredPrompt;
    const installBtn = document.getElementById('pwa-install-btn');

    // 1.5 GPSステータスの確認
    const gpsIndicator = document.getElementById('gps-indicator');
    const gpsText = document.getElementById('gps-text');
    const recommendBtn = document.querySelector('.btn-recommend');

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(() => {
            if (gpsIndicator) gpsIndicator.classList.add('active');
            if (gpsText) gpsText.textContent = 'GPS取得可能';
        }, () => {
            if (gpsText) gpsText.textContent = 'GPS利用不可';
            if (recommendBtn) recommendBtn.classList.add('gps-disabled');
        });
    }

    // 1.6 PWA起動時の判定
    const isPWA = window.matchMedia('(display-mode: standalone)').matches;
    if (isPWA && installBtn) {
        installBtn.style.display = 'none';
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        if (isPWA) return; // PWA起動時はプロンプトを表示しない
        e.preventDefault();
        deferredPrompt = e;
        if (installBtn) installBtn.classList.remove('hidden');
    });

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    installBtn.classList.add('hidden');
                }
                deferredPrompt = null;
            }
        });
    }

    // 2. 背景地図の初期化
    initBackgroundMap();

    async function initBackgroundMap() {
        const mapEl = document.getElementById('bg-map');
        if (!mapEl) return;

        try {
            const response = await fetch('./data/P35-18_Roadside_Station.geojson');
            const data = await response.json();
            
            // ランダムな道の駅を選択
            const stations = data.features;
            const randomStation = stations[Math.floor(Math.random() * stations.length)];
            const [lon, lat] = randomStation.geometry.coordinates;

            // 地図の初期化 (操作無効)
            const map = L.map('bg-map', {
                zoomControl: false,
                dragging: false,
                scrollWheelZoom: false,
                doubleClickZoom: false,
                touchZoom: false,
                boxZoom: false,
                keyboard: false
            }).setView([lat, lon], 12);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap'
            }).addTo(map);

        } catch (error) {
            console.error('Background map error:', error);
        }
    }
});
