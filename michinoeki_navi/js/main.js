import { Utils, UI } from './shared.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 0. グローバルアクションの初期化 (Theme + SNS + Nav)
    UI.initGlobalActions();

    const path = window.location.pathname;
    // サブディレクトリにいるかどうか判定
    const isSubPage = path.includes('/autorecomend/') || path.includes('/list/') || path.includes('/detail/');
    const basePath = isSubPage ? '../' : './';

    // ページごとの初期化
    if (path.includes('/autorecomend/')) {
        initRecommendPage(basePath);
    } else if (path.includes('/detail/')) {
        initDetailPage(basePath);
    } else if (path.includes('/list/')) {
        initListPage(basePath);
    } else {
        initLandingPage(basePath);
    }
});

/**
 * ランディングページ (index.html) の初期化
 */
async function initLandingPage(basePath) {
    // Service Worker の登録
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register(`${basePath}sw.js`).then(reg => {
                console.log('SW registered:', reg);
            }).catch(err => {
                console.error('SW registration failed:', err);
            });
        });
    }

    // PWA インストール機能
    let deferredPrompt;
    const installBtn = document.getElementById('pwa-install-btn');

    // GPSステータスの確認
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

    const isPWA = window.matchMedia('(display-mode: standalone)').matches;
    if (isPWA && installBtn) {
        installBtn.style.display = 'none';
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        if (isPWA) return;
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

    // 背景地図の初期化
    const mapEl = document.getElementById('bg-map');
    if (mapEl) {
        try {
            const response = await fetch(`${basePath}data/P35-18_Roadside_Station.geojson`);
            const data = await response.json();
            const stations = data.features;
            const randomStation = stations[Math.floor(Math.random() * stations.length)];
            const [lon, lat] = randomStation.geometry.coordinates;

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
}

/**
 * おすすめページ (autorecomend/index.html) の初期化
 */
function initRecommendPage(basePath) {
    const mainContent = document.getElementById('main-content');
    const footerBar = document.getElementById('footer-bar-location');
    const stationNameEl = document.getElementById('station-name');
    const stationDistanceEl = document.getElementById('station-distance');
    const stationPrefEl = document.getElementById('station-prefecture');
    const stationCityEl = document.getElementById('station-city');
    const currentAddressEl = document.getElementById('current-address');
    const locationPopup = document.getElementById('location-popup');
    const btnToggleAuto = document.getElementById('btn-toggle-auto');
    const autoStatusText = document.getElementById('auto-status-text');
    const googleMapsBtn = document.getElementById('icon-map-header');

    let watchId = null;
    let isAutoSearchActive = true;
    let etc2Cache = null;
    let geoCache = null;
    let map = null;
    let markerLayer = null;

    function initMap(lat, lon) {
        if (map) return;
        map = L.map('map', {
            zoomControl: false,
            attributionControl: false
        }).setView([lat, lon], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        markerLayer = L.layerGroup().addTo(map);
    }

    function startAutoSearch() {
        if (!navigator.geolocation) return;
        if (locationPopup) locationPopup.classList.remove('hidden');

        watchId = navigator.geolocation.watchPosition(
            position => {
                const { latitude, longitude } = position.coords;
                initMap(latitude, longitude);
                fetchDataAndRecommend(latitude, longitude);
                if (locationPopup) locationPopup.classList.add('hidden');
            },
            error => {
                console.error('Geolocation Error:', error);
                if (locationPopup) {
                    const spinner = locationPopup.querySelector('.popup-spinner');
                    const text = locationPopup.querySelector('.popup-text');
                    if (error.code === error.PERMISSION_DENIED) {
                        if (spinner) spinner.style.display = 'none';
                        if (text) text.innerHTML = `
                            <div style="color: #ef4444; margin-bottom: 12px;">位置情報が許可されていません</div>
                            <div style="font-size: 13px; font-weight: 400; line-height: 1.5;">
                                ブラウザの設定で位置情報を許可して<br>
                                再読み込みしてください。
                            </div>
                        `;
                    } else {
                        locationPopup.classList.add('hidden');
                    }
                }
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    }

    function stopAutoSearch() {
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }
    }

    if (btnToggleAuto) {
        btnToggleAuto.addEventListener('click', () => {
            isAutoSearchActive = !isAutoSearchActive;
            btnToggleAuto.classList.toggle('stopped', !isAutoSearchActive);
            autoStatusText.textContent = isAutoSearchActive ? '現在地付近の道の駅を自動検索中…' : '停止中';
            isAutoSearchActive ? startAutoSearch() : stopAutoSearch();
        });
    }

    async function fetchDataAndRecommend(lat, lon) {
        try {
            if (!etc2Cache || !geoCache) {
                const data = await Utils.fetchStationsData(basePath + 'data/');
                etc2Cache = data.etc2;
                geoCache = data.geojson;
            }
            const stations = findNearestStations(lat, lon, geoCache.features, 4);
            updateUI(stations, lat, lon);
        } catch (error) {
            console.error('Fetch Error:', error);
        }
    }

    function findNearestStations(userLat, userLon, stations, count) {
        return stations
            .map(station => ({
                ...station,
                distance: Utils.calculateDistance(userLat, userLon, station.properties.P35_001, station.properties.P35_002)
            }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, count);
    }

    function updateUI(stations, userLat, userLon) {
        const station = stations[0];
        const props = station.properties;
        const nearbyStations = stations.slice(1);

        if (map) {
            setTimeout(() => {
                if (map) {
                    map.invalidateSize();
                    map.setView([userLat, userLon], 10);
                }
            }, 100);
            markerLayer.clearLayers();
            L.marker([userLat, userLon], {
                icon: L.divIcon({
                    className: 'self-location-marker-container',
                    html: '<div class="self-location-dot"></div><div class="self-location-pulse"></div>',
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                }),
                zIndexOffset: 1000
            }).addTo(markerLayer);

            const mainMarker = L.marker([props.P35_001, props.P35_002], {
                icon: L.divIcon({
                    className: 'unified-marker',
                    html: `<div class="marker-label">${props.P35_006}</div><img class="marker-pin-img" src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png">`,
                    iconSize: [25, 41],
                    iconAnchor: [12, 41]
                })
            }).addTo(markerLayer);
            mainMarker.bindPopup(`<strong>${props.P35_006}</strong><br><a href="${basePath}detail/index.html?stationid=${encodeURIComponent(props.P35_006)}">詳細を見る</a>`);

            nearbyStations.forEach(s => {
                const sProps = s.properties;
                const marker = L.marker([sProps.P35_001, sProps.P35_002], {
                    icon: L.divIcon({
                        className: 'unified-marker marker-grey',
                        html: `<div class="marker-label">${sProps.P35_006}</div><img class="marker-pin-img" src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png">`,
                        iconSize: [25, 41],
                        iconAnchor: [12, 41]
                    })
                }).addTo(markerLayer);
                marker.bindPopup(`<strong>${sProps.P35_006}</strong><br><a href="${basePath}detail/index.html?stationid=${encodeURIComponent(sProps.P35_006)}">詳細を見る</a>`);
            });
        }

        stationNameEl.textContent = props.P35_006;
        stationPrefEl.textContent = props.P35_003;
        stationCityEl.textContent = props.P35_004;
        if (googleMapsBtn) {
            googleMapsBtn.href = `https://www.google.com/maps/search/?api=1&query=${props.P35_001},${props.P35_002}`;
            googleMapsBtn.classList.remove('hidden');
        }
        stationDistanceEl.textContent = station.distance.toFixed(1);
        document.getElementById('distance-container').style.display = 'block';

        const amenityConfigs = [
            { id: 'icon-toilet', key: 'P35_012', icon: 'toilet.png' },
            { id: 'icon-restaurant', key: 'P35_013', icon: 'restrant.png' },
            { id: 'icon-shop', key: 'P35_014', icon: 'shop.png' },
            { id: 'icon-ev', key: 'P35_026', icon: 'ev_charger.png' },
            { id: 'icon-etc2', key: 'etc2', icon: 'etc2.png' },
            { id: 'icon-web', key: 'web', icon: 'web.png' }
        ];

        amenityConfigs.forEach(config => {
            const el = document.getElementById(config.id);
            if (!el) return;
            const isActive = Utils.getAmenityStatus(props, etc2Cache, config.key);
            el.classList.toggle('active', isActive);
            el.classList.toggle('inactive', !isActive);
            const img = el.querySelector('img');
            img.src = `${basePath}icon/${config.icon}`;
            if (config.key === 'web') {
                el.onclick = isActive ? () => window.open(props.P35_009 || props.P35_007, '_blank') : null;
            }
        });

        currentAddressEl.textContent = `${props.P35_003} ${props.P35_004} 付近`;
        renderNearbyStations(nearbyStations, etc2Cache, basePath);

        mainContent.classList.remove('hidden');
        if (map) map.invalidateSize();
        footerBar.classList.remove('hidden');
        if (document.getElementById('search-control-bar')) {
            document.getElementById('search-control-bar').classList.remove('hidden');
        }
    }

    function renderNearbyStations(stations, etc2Data, basePath) {
        const nearbyContainer = document.getElementById('nearby-stations');
        const nearbyList = document.getElementById('nearby-list');
        if (!nearbyList) return;
        nearbyList.innerHTML = '';
        if (stations.length > 0) {
            if (nearbyContainer) nearbyContainer.classList.remove('hidden');
            stations.forEach(station => {
                const card = UI.createStationCard(station, etc2Data, basePath);
                nearbyList.appendChild(card);
            });
        }
    }

    startAutoSearch();
}

/**
 * 詳細ページ (detail/index.html) の初期化
 */
async function initDetailPage(basePath) {
    const stationNameEl = document.getElementById('station-name');
    const stationPrefEl = document.getElementById('station-prefecture');
    const stationCityEl = document.getElementById('station-city');
    const nearbyList = document.getElementById('nearby-list');
    const locationPopup = document.getElementById('location-popup');
    const googleMapsBtn = document.getElementById('icon-map-header');

    const urlParams = new URLSearchParams(window.location.search);
    const stationId = urlParams.get('stationid');

    if (!stationId) {
        alert('道の駅が指定されていません。');
        window.location.href = `${basePath}list/index.html`;
        return;
    }

    if (locationPopup) locationPopup.classList.remove('hidden');

    try {
        const { etc2, geojson } = await Utils.fetchStationsData(basePath + 'data/');
        const features = geojson.features;
        const target = features.find(f => f.properties.P35_006 === stationId);

        if (!target) {
            alert('指定された道の駅が見つかりませんでした。');
            window.location.href = `${basePath}list/index.html`;
            return;
        }

        renderDetail(target, features, etc2, basePath);
        if (locationPopup) locationPopup.classList.add('hidden');
    } catch (error) {
        console.error('Error:', error);
        alert('データの読み込みに失敗しました。');
    }

    function renderDetail(target, allStations, etc2Data, basePath) {
        const props = target.properties;
        const { P35_001: lat, P35_002: lon } = props;

        const map = L.map('map', { zoomControl: true, attributionControl: true }).setView([lat, lon], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
        const markerLayer = L.layerGroup().addTo(map);

        setTimeout(() => map.invalidateSize(), 100);

        stationNameEl.textContent = props.P35_006;
        stationPrefEl.textContent = props.P35_003;
        stationCityEl.textContent = props.P35_004;
        if (googleMapsBtn) {
            googleMapsBtn.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
            googleMapsBtn.classList.remove('hidden');
        }

        const amenityConfigs = [
            { id: 'icon-toilet', key: 'P35_012', icon: 'toilet.png' },
            { id: 'icon-restaurant', key: 'P35_013', icon: 'restrant.png' },
            { id: 'icon-shop', key: 'P35_014', icon: 'shop.png' },
            { id: 'icon-ev', key: 'P35_026', icon: 'ev_charger.png' },
            { id: 'icon-etc2', key: 'etc2', icon: 'etc2.png' },
            { id: 'icon-web', key: 'web', icon: 'web.png' }
        ];

        amenityConfigs.forEach(config => {
            const el = document.getElementById(config.id);
            if (!el) return;
            const isActive = Utils.getAmenityStatus(props, etc2Data, config.key);
            el.classList.toggle('active', isActive);
            el.classList.toggle('inactive', !isActive);
            const img = el.querySelector('img');
            img.src = `${basePath}icon/${config.icon}`;
            if (config.key === 'web') {
                el.onclick = isActive ? () => window.open(props.P35_009 || props.P35_007, '_blank') : null;
            }
        });

        const nearby = allStations
            .filter(f => f.properties.P35_006 !== props.P35_006)
            .map(f => ({
                ...f,
                distance: Utils.calculateDistance(lat, lon, f.properties.P35_001, f.properties.P35_002)
            }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 3);

        nearbyList.innerHTML = '';
        nearby.forEach(station => {
            const card = UI.createStationCard(station, etc2Data, basePath);
            nearbyList.appendChild(card);
            L.marker([station.properties.P35_001, station.properties.P35_002], {
                icon: L.divIcon({
                    className: 'unified-marker marker-grey',
                    html: `<div class="marker-label">${station.properties.P35_006}</div><img class="marker-pin-img" src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png">`,
                    iconSize: [25, 41],
                    iconAnchor: [12, 41]
                })
            }).addTo(markerLayer).bindPopup(`<strong>${station.properties.P35_006}</strong><br><a href="${basePath}detail/index.html?stationid=${encodeURIComponent(station.properties.P35_006)}">詳細を見る</a>`);
        });

        L.marker([lat, lon], {
            icon: L.divIcon({
                className: 'unified-marker',
                html: `<div class="marker-label">${props.P35_006}</div><img class="marker-pin-img" src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png">`,
                iconSize: [25, 41],
                iconAnchor: [12, 41]
            })
        }).addTo(markerLayer).bindPopup(`<strong>${props.P35_006}</strong><br><span>(現在の表示)</span>`);

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(position => {
                const { latitude, longitude } = position.coords;
                L.marker([latitude, longitude], {
                    icon: L.divIcon({
                        className: 'self-location-marker-container',
                        html: '<div class="self-location-dot"></div><div class="self-location-pulse"></div>',
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    }),
                    zIndexOffset: 1000
                }).addTo(markerLayer);
            });
        }
    }
}

/**
 * 一覧ページ (list/index.html) の初期化
 */
async function initListPage(basePath) {
    const listContainer = document.getElementById('station-list');
    const mapContainer = document.getElementById('list-map-container');
    const btnShowList = document.getElementById('btn-show-list');
    const btnShowMap = document.getElementById('btn-show-map');
    const mapStationInfo = document.getElementById('map-station-info');

    const locationPopup = document.createElement('div');
    locationPopup.id = 'location-popup';
    locationPopup.className = 'hidden';
    locationPopup.innerHTML = `<div class="popup-spinner"></div><div class="popup-text">現在地を確認中...</div>`;
    document.body.appendChild(locationPopup);

    let map = null;
    let etc2Data = null;
    let allFeatures = [];
    let userPos = null;

    try {
        const data = await Utils.fetchStationsData(basePath + 'data/');
        etc2Data = data.etc2;
        allFeatures = data.geojson.features;
        
        if (navigator.geolocation) {
            locationPopup.classList.remove('hidden');
            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 600000 });
                });
                userPos = { lat: position.coords.latitude, lon: position.coords.longitude };
                allFeatures.forEach(f => {
                    f.distance = Utils.calculateDistance(userPos.lat, userPos.lon, f.properties.P35_001, f.properties.P35_002);
                });
            } catch (err) {
                console.warn('Geolocation failed:', err);
            } finally {
                locationPopup.classList.add('hidden');
            }
        }
        renderRegionList(allFeatures, etc2Data, basePath);
    } catch (error) {
        console.error('Error:', error);
        listContainer.innerHTML = `<p class="error-msg">データの読み込み中にエラーが発生しました</p>`;
    }

    btnShowList.addEventListener('click', () => {
        btnShowList.classList.add('active');
        btnShowMap.classList.remove('active');
        listContainer.classList.remove('hidden');
        mapContainer.classList.add('hidden');
    });

    btnShowMap.addEventListener('click', () => {
        btnShowList.classList.remove('active');
        btnShowMap.classList.add('active');
        listContainer.classList.add('hidden');
        mapContainer.classList.remove('hidden');
        initListMap();
    });

    function initListMap() {
        if (map) {
            map.invalidateSize();
            return;
        }
        const center = userPos ? [userPos.lat, userPos.lon] : [35.6812, 139.7671];
        map = L.map('list-map', { zoomControl: true, attributionControl: true }).setView(center, userPos ? 10 : 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);

        if (userPos) {
            L.marker([userPos.lat, userPos.lon], {
                icon: L.divIcon({
                    className: 'self-location-marker-container',
                    html: '<div class="self-location-dot"></div><div class="self-location-pulse"></div>',
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                }),
                zIndexOffset: 1000
            }).addTo(map).bindPopup("現在地");
        }

        allFeatures.forEach(feature => {
            const marker = L.marker([feature.properties.P35_001, feature.properties.P35_002], {
                icon: L.divIcon({
                    className: 'unified-marker',
                    html: `<div class="marker-label">${feature.properties.P35_006}</div><img class="marker-pin-img" src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png">`,
                    iconSize: [25, 41],
                    iconAnchor: [12, 41]
                })
            });
            marker.on('click', () => {
                mapStationInfo.innerHTML = '';
                const card = UI.createStationCard(feature, etc2Data, basePath);
                mapStationInfo.appendChild(card);
                mapStationInfo.classList.remove('hidden');
            });
            marker.addTo(map);
        });

        map.on('click', () => mapStationInfo.classList.add('hidden'));
    }

    function renderRegionList(features, etc2Data, basePath) {
        listContainer.innerHTML = '';
        const regions = [
            { name: '北海道', prefs: ['北海道'] },
            { name: '東北', prefs: ['青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県'] },
            { name: '関東', prefs: ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県'] },
            { name: '中部', prefs: ['新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県'] },
            { name: '近畿', prefs: ['三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'] },
            { name: '中国', prefs: ['鳥取県', '島根県', '岡山県', '広島県', '山口県'] },
            { name: '四国', prefs: ['徳島県', '香川県', '愛媛県', '高知県'] },
            { name: '九州・沖縄', prefs: ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'] },
        ];

        const prefToRegion = {};
        const prefecturesOrder = [];
        regions.forEach(region => {
            region.prefs.forEach((pref, i) => {
                prefecturesOrder.push(pref);
                prefToRegion[pref] = { name: region.name, isFirst: i === 0 };
            });
        });

        prefecturesOrder.forEach(pref => {
            const prefFeatures = features.filter(f => f.properties.P35_003 === pref);
            if (prefFeatures.length === 0) return;

            if (prefToRegion[pref].isFirst) {
                const regionTitle = document.createElement('h2');
                regionTitle.className = 'section-title';
                regionTitle.textContent = prefToRegion[pref].name;
                listContainer.appendChild(regionTitle);
            }

            const prefDetails = document.createElement('details');
            prefDetails.className = 'pref-section';
            prefDetails.innerHTML = `
                <summary class="pref-header">
                    <span class="pref-name">${pref}</span>
                    <span class="pref-count">${prefFeatures.length}駅</span>
                    <span class="pref-icon">▼</span>
                </summary>
                <div class="pref-stations"></div>
            `;
            const stationContainer = prefDetails.querySelector('.pref-stations');
            prefFeatures.forEach(feature => {
                const card = UI.createStationCard(feature, etc2Data, basePath);
                stationContainer.appendChild(card);
            });
            listContainer.appendChild(prefDetails);
        });
    }
}
