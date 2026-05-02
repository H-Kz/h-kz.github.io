import { Utils, UI } from '../js/shared.js';

document.addEventListener('DOMContentLoaded', async () => {
    // グローバルアクションの初期化
    UI.initGlobalActions();

    const listContainer = document.getElementById('station-list');
    const mapContainer = document.getElementById('list-map-container');
    const btnShowList = document.getElementById('btn-show-list');
    const btnShowMap = document.getElementById('btn-show-map');
    const mapStationInfo = document.getElementById('map-station-info');

    const locationPopup = document.createElement('div');
    locationPopup.id = 'location-popup';
    locationPopup.className = 'hidden';
    locationPopup.innerHTML = `
        <div class="popup-spinner"></div>
        <div class="popup-text">現在地を確認中...</div>
    `;
    document.body.appendChild(locationPopup);

    let map = null;
    let markers = [];
    let etc2Data = null;
    let allFeatures = [];
    let userPos = null;

    try {
        const data = await Utils.fetchStationsData('../data/');
        etc2Data = data.etc2;
        allFeatures = data.geojson.features;
        
        // 位置情報の取得を試みる
        if (navigator.geolocation) {
            locationPopup.classList.remove('hidden');
            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        timeout: 5000,
                        maximumAge: 600000
                    });
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

        renderRegionList(allFeatures, etc2Data);
    } catch (error) {
        console.error('Error:', error);
        listContainer.innerHTML = `<p class="error-msg">データの読み込み中にエラーが発生しました: ${error.message}</p>`;
        if (locationPopup) locationPopup.classList.add('hidden');
    }

    // 表示切り替え
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

        const center = userPos ? [userPos.lat, userPos.lon] : [35.6812, 139.7671]; // デフォルト東京
        map = L.map('list-map', {
            zoomControl: true,
            attributionControl: true
        }).setView(center, userPos ? 10 : 6);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

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

        // マーカーの追加
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
                showMapStationInfo(feature);
            });
            marker.addTo(map);
        });

        map.on('click', () => {
            mapStationInfo.classList.add('hidden');
        });
    }

    function showMapStationInfo(feature) {
        mapStationInfo.innerHTML = '';
        const card = UI.createStationCard(feature, etc2Data, '../');
        mapStationInfo.appendChild(card);
        mapStationInfo.classList.remove('hidden');
    }

    function renderRegionList(features, etc2Data) {
        listContainer.innerHTML = '';
        
        // 都道府県のリスト（標準的な並び順）
        const prefecturesOrder = [
            '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
            '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
            '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
            '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
            '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
            '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
            '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
        ];

        prefecturesOrder.forEach(pref => {
            const prefFeatures = features.filter(f => f.properties.P35_003 === pref);
            if (prefFeatures.length === 0) return;

            const prefDetails = document.createElement('details');
            prefDetails.className = 'pref-section';
            const prefSummary = document.createElement('summary');
            prefSummary.className = 'pref-header';
            prefSummary.innerHTML = `
                <span class="pref-name">${pref}</span>
                <span class="pref-count">${prefFeatures.length}駅</span>
                <span class="pref-icon">▼</span>
            `;
            prefDetails.appendChild(prefSummary);

            const stationContainer = document.createElement('div');
            stationContainer.className = 'pref-stations';
            
            // 各駅を生成
            prefFeatures.forEach(feature => {
                const card = UI.createStationCard(feature, etc2Data, '../');
                stationContainer.appendChild(card);
            });

            prefDetails.appendChild(stationContainer);
            listContainer.appendChild(prefDetails);
        });
    }
});
