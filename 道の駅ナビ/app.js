document.addEventListener('DOMContentLoaded', () => {
    const listContainer = document.getElementById('station-list');

    const locationPopup = document.getElementById('location-popup');

    // 位置情報の取得とデータ読み込みの開始
    if (navigator.geolocation) {
        // ポップアップを表示
        if (locationPopup) locationPopup.classList.remove('hidden');

        navigator.geolocation.getCurrentPosition(
            position => {
                const userLat = position.coords.latitude;
                const userLon = position.coords.longitude;
                loadData(userLat, userLon);
                // 位置情報取得成功時にポップアップを消す
                if (locationPopup) locationPopup.classList.add('hidden');
            },
            error => {
                console.error('Geolocation Error:', error);
                // 位置情報が取得できなくてもリストは表示する（距離なし）
                loadData(null, null);
                // エラー時もポップアップを消す
                if (locationPopup) locationPopup.classList.add('hidden');
            }
        );
    } else {
        loadData(null, null);
    }

    let etc2Stations = [];

    function loadData(userLat, userLon) {
        // etc2.json と geojson を並列で読み込む
        Promise.all([
            fetch('data/etc2.json').then(res => res.json()).catch(() => []),
            fetch('data/P35-18_Roadside_Station.geojson').then(res => {
                if (!res.ok) throw new Error('データの読み込みに失敗しました');
                return res.json();
            })
        ])
        .then(([etc2Data, geoData]) => {
            etc2Stations = etc2Data;
            let features = geoData.features;

            // 距離の計算とソート
            if (userLat !== null && userLon !== null) {
                features.forEach(feature => {
                    const sLat = feature.properties.P35_001;
                    const sLon = feature.properties.P35_002;
                    feature.distance = calculateDistance(userLat, userLon, sLat, sLon);
                });

                // 近い順にソート
                features.sort((a, b) => a.distance - b.distance);
            }

            renderStationList(features);
        })
        .catch(error => {
            console.error('Error:', error);
            listContainer.innerHTML = `<p class="error-msg">データの読み込み中にエラーが発生しました: ${error.message}</p>`;
        });
    }

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // 地球の半径 (km)
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    function renderStationList(features) {
        listContainer.innerHTML = '';

        features.forEach(feature => {
            const props = feature.properties;
            
            // 詳細ページへのリンクに変更
            const card = document.createElement('a');
            card.className = 'station-card';
            card.href = `detail/index.html?stationid=${encodeURIComponent(props.P35_006)}`;

            // 情報セクション
            const infoDiv = document.createElement('div');
            infoDiv.className = 'station-info';
            
            const nameH2 = document.createElement('h2');
            nameH2.className = 'station-name';
            nameH2.textContent = props.P35_006 || '名称不明';
            
            const municipalityP = document.createElement('p');
            municipalityP.className = 'municipality-name';
            municipalityP.textContent = `${props.P35_003 || ''} ${props.P35_004 || ''}`;
            
            infoDiv.appendChild(nameH2);
            infoDiv.appendChild(municipalityP);

            // 距離表示（位置情報がある場合）
            if (feature.distance !== undefined) {
                const distSpan = document.createElement('span');
                distSpan.className = 'list-distance';
                distSpan.innerHTML = `現在地から <strong>${feature.distance.toFixed(1)}</strong> km`;
                infoDiv.appendChild(distSpan);
            }

            // アメニティセクション
            const amenitiesDiv = document.createElement('div');
            amenitiesDiv.className = 'amenities';

            const amenityConfigs = [
                { key: 'P35_012', icon: 'toilet.png', title: 'トイレ' },
                { key: 'P35_013', icon: 'restrant.png', title: 'レストラン' },
                { key: 'P35_014', icon: 'shop.png', title: 'ショップ' },
                { key: 'P35_026', icon: 'ev_charger.png', title: 'EV充電' },
                { key: 'etc2', icon: 'etc2.png', title: '賢い料金制度' },
                { key: 'google_maps', icon: 'Google_Maps.png', title: 'Google Maps' }
            ];

            amenityConfigs.forEach(config => {
                let box;
                let isActive = false;

                if (config.key === 'google_maps') {
                    // Google Mapsは緯度経度がある場合のみアクティブ
                    const lat = props.P35_001;
                    const lon = props.P35_002;
                    
                    if (lat && lon && !isNaN(lat) && !isNaN(lon)) {
                        box = document.createElement('a');
                        box.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
                        box.target = '_blank';
                        box.rel = 'noopener noreferrer';
                        isActive = true;
                    } else {
                        box = document.createElement('div');
                        isActive = false;
                    }
                    
                    // カード全体のリンクイベントを阻止
                    box.addEventListener('click', (e) => {
                        e.stopPropagation();
                    });
                } else {
                    box = document.createElement('div');
                    if (config.key === 'etc2') {
                        isActive = etc2Stations.some(name => props.P35_006.includes(name));
                    } else {
                        isActive = props[config.key] === 1.0;
                    }
                }

                box.className = `amenity-box ${isActive ? 'active' : 'inactive'}`;
                if (config.key === 'etc2' || config.key === 'google_maps') {
                    box.classList.add(config.key);
                }
                box.title = config.title;

                const img = document.createElement('img');
                if (config.key === 'etc2' && !isActive) {
                    img.src = `icon/etc2_no.png`;
                } else {
                    img.src = `icon/${config.icon}`;
                }
                
                // 全てのアメニティに状態に応じたaltテキストを設定
                if (config.key === 'etc2') {
                    img.alt = isActive ? '賢い料金制度の対象です' : '賢い料金制度の対象外です';
                } else if (config.key === 'google_maps') {
                    img.alt = 'Google Mapsで開く';
                } else {
                    img.alt = isActive ? `${config.title}有り` : `${config.title}なし`;
                }

                box.appendChild(img);
                amenitiesDiv.appendChild(box);
            });

            card.appendChild(infoDiv);
            card.appendChild(amenitiesDiv);
            listContainer.appendChild(card);
        });
    }

    const autoRecommendBtn = document.getElementById('btn-auto-recommend');
    if (autoRecommendBtn) {
        autoRecommendBtn.addEventListener('click', () => {
            window.location.href = 'autorecomend/';
        });
    }
});
