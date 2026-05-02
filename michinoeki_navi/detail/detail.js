import { Utils, UI } from '../js/shared.js';

document.addEventListener('DOMContentLoaded', async () => {
    // グローバルアクションの初期化
    UI.initGlobalActions();

    const stationNameEl = document.getElementById('station-name');
    const stationPrefEl = document.getElementById('station-prefecture');
    const stationCityEl = document.getElementById('station-city');
    const nearbyList = document.getElementById('nearby-list');
    const locationPopup = document.getElementById('location-popup');
    const googleMapsBtn = document.getElementById('icon-map-header');

    const urlParams = new URLSearchParams(window.location.search);
    const stationId = urlParams.get('stationid');

    let map = null;
    let markerLayer = null;

    if (!stationId) {
        alert('道の駅が指定されていません。');
        window.location.href = '../list/index.html';
        return;
    }

    if (locationPopup) locationPopup.classList.remove('hidden');

    try {
        const { etc2, geojson } = await Utils.fetchStationsData('../data/');
        const features = geojson.features;
        const target = features.find(f => f.properties.P35_006 === stationId);

        if (!target) {
            alert('指定された道の駅が見つかりませんでした。');
            window.location.href = '../list/index.html';
            return;
        }

        renderDetail(target, features, etc2);
        if (locationPopup) locationPopup.classList.add('hidden');
    } catch (error) {
        console.error('Error:', error);
        alert('データの読み込みに失敗しました。');
    }

    function initMap(lat, lon) {
        if (map) return;
        map = L.map('map', {
            zoomControl: true,
            attributionControl: true
        }).setView([lat, lon], 12);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap'
        }).addTo(map);
        markerLayer = L.layerGroup().addTo(map);
    }

    function renderDetail(target, allStations, etc2Data) {
        const props = target.properties;
        const { P35_001: lat, P35_002: lon } = props;

        // 地図の初期化と更新
        initMap(lat, lon);
        setTimeout(() => {
            if (map) {
                map.invalidateSize();
                map.setView([lat, lon], 12);
            }
        }, 100);
        markerLayer.clearLayers();

        // メイン情報
        stationNameEl.textContent = props.P35_006;
        stationPrefEl.textContent = props.P35_003;
        stationCityEl.textContent = props.P35_004;

        if (googleMapsBtn) {
            googleMapsBtn.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
            googleMapsBtn.classList.remove('hidden');
        }

        // アメニティ
        const amenityConfigs = [
            { id: 'icon-toilet', key: 'P35_012', icon: 'toilet.png' },
            { id: 'icon-restaurant', key: 'P35_013', icon: 'food.png' },
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

        // 周辺の道の駅
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
            const card = UI.createStationCard(station, etc2Data, '../');
            nearbyList.appendChild(card);

            // 地図に周辺施設をプロット (グレーピン + ラベル)
            const marker = L.marker([station.properties.P35_001, station.properties.P35_002], {
                icon: L.divIcon({
                    className: 'unified-marker marker-grey',
                    html: `<div class="marker-label">${station.properties.P35_006}</div><img class="marker-pin-img" src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png">`,
                    iconSize: [25, 41],
                    iconAnchor: [12, 41]
                })
            }).addTo(markerLayer);

            marker.bindPopup(`
                <div class="map-popup">
                    <strong>${station.properties.P35_006}</strong><br>
                    <a href="../detail/index.html?stationid=${encodeURIComponent(station.properties.P35_006)}">詳細を見る</a>
                </div>
            `);
        });

        // メイン施設をプロット (青ピン + ラベル)
        const mainMarker = L.marker([lat, lon], {
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
                <span>(現在の表示)</span>
            </div>
        `);

        // 自己位置の取得と表示を試みる (Detailページでも任意で表示)
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
});
