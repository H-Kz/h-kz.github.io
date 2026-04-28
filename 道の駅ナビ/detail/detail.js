import { Utils, UI } from '../js/shared.js';

document.addEventListener('DOMContentLoaded', async () => {
    const stationNameEl = document.getElementById('station-name');
    const stationPrefEl = document.getElementById('station-prefecture');
    const stationCityEl = document.getElementById('station-city');
    const nearbyList = document.getElementById('nearby-list');
    const locationPopup = document.getElementById('location-popup');

    const urlParams = new URLSearchParams(window.location.search);
    const stationId = urlParams.get('stationid');

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

    function renderDetail(target, allStations, etc2Data) {
        const props = target.properties;
        const { P35_001: lat, P35_002: lon } = props;

        stationNameEl.textContent = props.P35_006;
        stationPrefEl.textContent = props.P35_003;
        stationCityEl.textContent = props.P35_004;

        // アメニティ
        const amenityConfigs = [
            { id: 'icon-toilet', key: 'P35_012' },
            { id: 'icon-restaurant', key: 'P35_013' },
            { id: 'icon-shop', key: 'P35_014' },
            { id: 'icon-ev', key: 'P35_026' },
            { id: 'icon-etc2', key: 'etc2' },
            { id: 'icon-map', key: 'google_maps' }
        ];

        amenityConfigs.forEach(config => {
            const el = document.getElementById(config.id);
            if (!el) return;
            const isActive = Utils.getAmenityStatus(props, etc2Data, config.key);
            
            el.classList.toggle('active', isActive);
            el.classList.toggle('inactive', !isActive);
            
            if (config.key === 'google_maps' && isActive) {
                el.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
            }

            if (config.key === 'etc2') {
                el.querySelector('img').src = isActive ? '../icon/etc2.png' : '../icon/etc2_no.png';
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
        });
    }
});
