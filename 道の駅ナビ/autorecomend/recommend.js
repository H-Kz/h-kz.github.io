import { Utils, UI } from '../js/shared.js';

document.addEventListener('DOMContentLoaded', () => {
    const loader = document.getElementById('loader');
    const mainContent = document.getElementById('main-content');
    const footerBar = document.getElementById('footer-bar-location');
    const stationNameEl = document.getElementById('station-name');
    const stationDistanceEl = document.getElementById('station-distance');
    const stationPrefEl = document.getElementById('station-prefecture');
    const stationCityEl = document.getElementById('station-city');
    const currentAddressEl = document.getElementById('current-address');
    const stationImageEl = document.getElementById('station-image');
    const locationPopup = document.getElementById('location-popup');
    const btnToggleAuto = document.getElementById('btn-toggle-auto');
    const autoStatusText = document.getElementById('auto-status-text');

    let watchId = null;
    let isAutoSearchActive = true;
    let etc2Cache = null;
    let geoCache = null;

    // 初期化
    startAutoSearch();

    function startAutoSearch() {
        if (!navigator.geolocation) return;
        if (locationPopup) locationPopup.classList.remove('hidden');

        watchId = navigator.geolocation.watchPosition(
            position => {
                const { latitude, longitude } = position.coords;
                fetchDataAndRecommend(latitude, longitude);
                if (locationPopup) locationPopup.classList.add('hidden');
            },
            error => {
                console.error('Geolocation Error:', error);
                if (locationPopup) locationPopup.classList.add('hidden');
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

        // メイン情報
        const metaContainer = document.querySelector('.station-meta');
        metaContainer.innerHTML = '';
        const infoLink = document.createElement('a');
        infoLink.href = `../detail/index.html?stationid=${encodeURIComponent(props.P35_006)}`;
        infoLink.className = 'station-info-link';
        infoLink.innerHTML = `
            <h1 class="station-name">${props.P35_006}</h1>
            <div class="location-badges">
                <span>${props.P35_003}</span>
                <span>${props.P35_004}</span>
            </div>
        `;
        metaContainer.appendChild(infoLink);

        stationDistanceEl.textContent = station.distance.toFixed(1);
        document.getElementById('distance-container').style.display = 'block';

        // アメニティ
        const amenityConfigs = [
            { id: 'icon-toilet', key: 'P35_012', label: 'トイレ' },
            { id: 'icon-restaurant', key: 'P35_013', label: 'レストラン' },
            { id: 'icon-shop', key: 'P35_014', label: 'ショップ' },
            { id: 'icon-ev', key: 'P35_026', label: 'EV充電' },
            { id: 'icon-etc2', key: 'etc2', label: '賢い料金制度' },
            { id: 'icon-map', key: 'google_maps', label: 'Google Maps' }
        ];

        amenityConfigs.forEach(config => {
            const el = document.getElementById(config.id);
            if (!el) return;
            const isActive = Utils.getAmenityStatus(props, etc2Cache, config.key);
            
            el.classList.toggle('active', isActive);
            el.classList.toggle('inactive', !isActive);
            if (config.key === 'google_maps' && isActive) {
                el.href = `https://www.google.com/maps/search/?api=1&query=${props.P35_001},${props.P35_002}`;
            }
            const img = el.querySelector('img');
            img.src = (config.key === 'etc2' && !isActive) ? '../icon/etc2_no.png' : `../icon/${el.id.includes('etc2') ? 'etc2.png' : el.id.replace('icon-', '') + '.png'}`;
            // Special cases for manual icon mapping if names don't match exactly
            if (config.id === 'icon-restaurant') img.src = isActive ? '../icon/restrant.png' : '../icon/restrant.png';
            if (config.id === 'icon-map') img.src = '../icon/Google_Maps.png';
        });

        currentAddressEl.textContent = `${props.P35_003} ${props.P35_004} 付近`;
        renderNearbyStations(nearbyStations);

        loader.classList.add('hidden');
        mainContent.classList.remove('hidden');
        footerBar.classList.remove('hidden');
        if (document.getElementById('floating-control-bar')) {
            document.getElementById('floating-control-bar').classList.remove('hidden');
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
