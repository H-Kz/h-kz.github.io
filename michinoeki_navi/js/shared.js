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
        if (key === 'etc2') {
            const name = props.P35_006;
            return etc2Data && etc2Data.stations && etc2Data.stations.includes(name);
        }
        if (key === 'google_maps') return true;
        if (key === 'web') return !!(props.P35_007 || props.P35_009);

        // 1.0 = あり, 2.0 = なし (GeoJSONの仕様)
        return props[key] === 1.0;
    },
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
            { key: 'P35_013', icon: 'food.png' },
            { key: 'P35_014', icon: 'shop.png' },
            { key: 'P35_026', icon: 'ev_charger.png' },
            { key: 'etc2', icon: 'etc2.png' },
            { key: 'web', icon: 'web.png' },
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
            } else if (config.key === 'web') {
                if (isActive) {
                    box = document.createElement('a');
                    box.href = props.P35_009 || props.P35_007 || '#';
                    box.target = '_blank';
                } else {
                    box = document.createElement('div');
                }
                box.addEventListener('click', e => e.stopPropagation());
            } else {
                box = document.createElement('div');
            }

            box.className = `amenity-box ${isActive ? 'active' : 'inactive'}`;
            if (['etc2', 'google_maps', 'web'].includes(config.key)) box.classList.add(config.key);
            
            const img = document.createElement('img');
            img.src = `${basePath}icon/${config.icon}`;
            box.appendChild(img);
            amenitiesDiv.appendChild(box);
        });

        card.appendChild(infoDiv);
        card.appendChild(amenitiesDiv);
        return card;
    },

    /**
     * ダークモードの初期化
     */
    initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        return savedTheme;
    },

    /**
     * テーマの切り替え
     */
    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        return next;
    },

    /**
     * 統合グローバルアクションの初期化 (SNSシェア + テーマ切り替え + ナビ)
     */
    initGlobalActions() {
        this.initTheme();

        // パスの解決 (URLの階層を数えてベースパスを決定)
        const path = window.location.pathname;
        const isSubPage = path.includes('/autorecomend/') || path.includes('/list/') || path.includes('/detail/');
        const basePath = isSubPage ? '../' : './';

        const container = document.createElement('div');
        container.className = 'global-actions';

        // 1. メインボタン（SNSシェア）- 一番右
        const shareBtn = document.createElement('div');
        shareBtn.className = 'share-main-btn';
        shareBtn.innerHTML = `<img src="${basePath}icon/share.png" alt="Share">`;
        
        const menu = document.createElement('div');
        menu.className = 'share-menu';
        
        const networks = [
            { id: 'x', name: 'X', icon: 'X_logo-black.png' },
            { id: 'line', name: 'LINE', icon: 'line.png' },
            { id: 'copy', name: 'URLをコピー', icon: 'copy.png' }
        ];

        networks.forEach(net => {
            const item = document.createElement('div');
            item.className = 'share-item';
            item.innerHTML = `
                <div class="share-icon-wrap"><img src="${basePath}icon/${net.icon}" alt="${net.name}"></div>
                <span>${net.name}</span>
            `;
            item.onclick = () => {
                const url = encodeURIComponent(window.location.href);
                const text = encodeURIComponent(document.title);
                if (net.id === 'x') {
                    window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`);
                } else if (net.id === 'line') {
                    window.open(`https://line.me/R/msg/text/?${text}%20${url}`);
                } else if (net.id === 'copy') {
                    navigator.clipboard.writeText(window.location.href);
                    alert('URLをコピーしました');
                }
                menu.classList.remove('active');
            };
            menu.appendChild(item);
        });

        shareBtn.onclick = (e) => {
            e.stopPropagation();
            menu.classList.toggle('active');
        };

        // 2. テーマ切り替えボタン
        const themeBtn = document.createElement('div');
        themeBtn.className = 'share-main-btn theme-toggle';
        themeBtn.innerHTML = `<img src="${basePath}icon/light.png" alt="Theme">`;
        themeBtn.onclick = () => {
            this.toggleTheme();
        };

        container.appendChild(shareBtn);
        container.appendChild(themeBtn);

        // 並び順: [Home] [Back] [Theme] [SNS] (右から順)
        if (isSubPage) {
            const backBtn = document.createElement('div');
            backBtn.className = 'share-main-btn';
            backBtn.innerHTML = `<img src="${basePath}icon/back.png" alt="Back">`;
            backBtn.onclick = () => history.back();
            container.appendChild(backBtn);

            const homeBtn = document.createElement('a');
            homeBtn.className = 'share-main-btn';
            homeBtn.href = `${basePath}index.html`;
            homeBtn.innerHTML = `<img src="${basePath}icon/home.png" alt="Home">`;
            container.appendChild(homeBtn);
        }

        container.appendChild(menu);

        document.addEventListener('click', () => menu.classList.remove('active'));
        document.body.appendChild(container);
    }
};
