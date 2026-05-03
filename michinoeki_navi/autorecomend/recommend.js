import { Utils, UI } from '../js/shared.js';

document.addEventListener('DOMContentLoaded', () => {
    // グローバルアクションの初期化 (Theme + SNS + Nav)
    UI.initGlobalActions();

    const loader = document.getElementById('loader');
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

    // 初期化
    startAutoSearch();

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
                const data = await Utils.fetchStationsData('../data/');
                etc2Cache = data.etc2;
                geoCache = data.geojson;
            }

            const stations = findNearestStations(lat, lon, geoCache.features, 4);
            updateUI(stations, lat, lon);
        } catch (error) {
            console.error('Fetch Error in fetchDataAndRecommend:', error);
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

        // 地図の更新
        if (map) {
            setTimeout(() => {
                if (map) {
                    map.invalidateSize();
                    map.setView([userLat, userLon], 10);
                }
            }, 100);
            markerLayer.clearLayers();

            // 自己位置 (カスタムドット)
            L.marker([userLat, userLon], {
                icon: L.divIcon({
                    className: 'self-location-marker-container',
                    html: '<div class="self-location-dot"></div><div class="self-location-pulse"></div>',
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                }),
                zIndexOffset: 1000
            }).addTo(markerLayer);

            // トップ施設 (青ピン + ラベル)
            const mainMarker = L.marker([props.P35_001, props.P35_002], {
                icon: L.divIcon({
                    className: 'unified-marker',
                    html: `<div class="marker-label">${props.P35_006}</div><img class="marker-pin-img" src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png">`,
                    iconSize: [25, 41],
                    iconAnchor: [12, 41]
                })
            }).addTo(markerLayer);

            mainMarker.bindPopup(`
                <div class="map-popup">
                    <strong>${props.P35_006}</strong><br>
                    <a href="../detail/index.html?stationid=${encodeURIComponent(props.P35_006)}">詳細を見る</a>
                </div>
            `);

            // 他3施設 (グレーピン + ラベル)
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

                marker.bindPopup(`
                    <div class="map-popup">
                        <strong>${sProps.P35_006}</strong><br>
                        <a href="../detail/index.html?stationid=${encodeURIComponent(sProps.P35_006)}">詳細を見る</a>
                    </div>
                `);
            });
        }

        // メイン情報
        stationNameEl.textContent = props.P35_006;
        stationPrefEl.textContent = props.P35_003;
        stationCityEl.textContent = props.P35_004;

        if (googleMapsBtn) {
            googleMapsBtn.href = `https://www.google.com/maps/search/?api=1&query=${props.P35_001},${props.P35_002}`;
            googleMapsBtn.classList.remove('hidden');
        }

        stationDistanceEl.textContent = station.distance.toFixed(1);
        document.getElementById('distance-container').style.display = 'block';

        // アメニティ
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
            img.src = `../icon/${config.icon}`;

            // 公式サイトのリンク設定
            if (config.key === 'web') {
                if (isActive) {
                    el.onclick = () => window.open(props.P35_009 || props.P35_007, '_blank');
                } else {
                    el.onclick = null;
                }
            }
        });

        currentAddressEl.textContent = `${props.P35_003} ${props.P35_004} 付近`;
        renderNearbyStations(nearbyStations);

        mainContent.classList.remove('hidden');
        if (map) map.invalidateSize();
        footerBar.classList.remove('hidden');
        if (document.getElementById('search-control-bar')) {
            document.getElementById('search-control-bar').classList.remove('hidden');
        }
    }

    function renderNearbyStations(stations) {
        const nearbyContainer = document.getElementById('nearby-stations');
        const nearbyList = document.getElementById('nearby-list');
        nearbyList.innerHTML = '';

        if (stations.length > 0) {
            if (nearbyContainer) nearbyContainer.classList.remove('hidden');
            stations.forEach(station => {
                const card = UI.createStationCard(station, etc2Cache, '../');
                nearbyList.appendChild(card);
            });
        }
    }
});
