/**
 * 共有ユーティリティ関数
 */

export const Utils = {
    /**
     * 2点間の距離を計算 (km)
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return null;
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    /**
     * データをフェッチする
     * @param {string} basePath データのディレクトリへの相対パス
     */
    async fetchStationsData(basePath = '../data/') {
        const [etc2, geojson] = await Promise.all([
            fetch(`${basePath}etc2.json`).then(res => res.json()).catch(() => []),
            fetch(`${basePath}P35-18_Roadside_Station.geojson`).then(res => {
                if (!res.ok) throw new Error('データの読み込みに失敗しました');
                return res.json();
            })
        ]);
        return { etc2, geojson };
    },

    /**
     * アメニティの有効状態を判定
     */
    getAmenityStatus(props, etc2Data, key) {
        if (key === 'google_maps') {
            return !!(props.P35_001 && props.P35_002);
        }
        if (key === 'etc2') {
            return etc2Data.some(name => props.P35_006.includes(name));
        }
        return props[key] === 1.0;
    }
};

export const UI = {
    /**
     * 駅カードの作成
     */
    createStationCard(feature, etc2Data, basePath = '../') {
        const props = feature.properties;
        const card = document.createElement('a');
        card.className = 'station-card';
        card.href = `${basePath}detail/index.html?stationid=${encodeURIComponent(props.P35_006)}`;

        const infoDiv = document.createElement('div');
        infoDiv.className = 'station-info';
        
        const nameH2 = document.createElement('h2');
        nameH2.className = 'station-name';
        nameH2.textContent = props.P35_006;
        
        const munP = document.createElement('p');
        munP.className = 'municipality-name';
        munP.textContent = `${props.P35_003} ${props.P35_004}`;
        
        infoDiv.appendChild(nameH2);
        infoDiv.appendChild(munP);

        if (feature.distance !== undefined && feature.distance !== null) {
            const distSpan = document.createElement('span');
            distSpan.className = 'list-distance';
            const distLabel = basePath.includes('detail') ? 'この駅から' : '現在地から';
            distSpan.innerHTML = `${distLabel} <strong>${feature.distance.toFixed(1)}</strong> km`;
            infoDiv.appendChild(distSpan);
        }

        const amenitiesDiv = document.createElement('div');
        amenitiesDiv.className = 'amenities';
        
        const configs = [
            { key: 'P35_012', icon: 'toilet.png' },
            { key: 'P35_013', icon: 'restrant.png' },
            { key: 'P35_014', icon: 'shop.png' },
            { key: 'P35_026', icon: 'ev_charger.png' },
            { key: 'etc2', icon: 'etc2.png' },
            { key: 'google_maps', icon: 'Google_Maps.png' }
        ];

        configs.forEach(config => {
            let box;
            const isActive = Utils.getAmenityStatus(props, etc2Data, config.key);

            if (config.key === 'google_maps') {
                if (isActive) {
                    box = document.createElement('a');
                    box.href = `https://www.google.com/maps/search/?api=1&query=${props.P35_001},${props.P35_002}`;
                    box.target = '_blank';
                } else {
                    box = document.createElement('div');
                }
                box.addEventListener('click', e => e.stopPropagation());
            } else {
                box = document.createElement('div');
            }

            box.className = `amenity-box ${isActive ? 'active' : 'inactive'}`;
            if (config.key === 'etc2' || config.key === 'google_maps') box.classList.add(config.key);
            
            const img = document.createElement('img');
            img.src = (config.key === 'etc2' && !isActive) ? `${basePath}icon/etc2_no.png` : `${basePath}icon/${config.icon}`;
            box.appendChild(img);
            amenitiesDiv.appendChild(box);
        });

        card.appendChild(infoDiv);
        card.appendChild(amenitiesDiv);
        return card;
    }
};
