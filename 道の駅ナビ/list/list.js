import { Utils, UI } from '../js/shared.js';

const REGION_CONFIG = {
    '北海道': ['北海道'],
    '東北': ['青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県'],
    '関東': ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県'],
    '中部': ['新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県'],
    '近畿': ['三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'],
    '中国': ['鳥取県', '島根県', '岡山県', '広島県', '山口県'],
    '四国': ['徳島県', '香川県', '愛媛県', '高知県'],
    '九州・沖縄': ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県']
};

document.addEventListener('DOMContentLoaded', async () => {
    const listContainer = document.getElementById('station-list');

    try {
        const { etc2, geojson } = await Utils.fetchStationsData('../data/');
        renderRegionList(geojson.features, etc2);
    } catch (error) {
        console.error('Error:', error);
        listContainer.innerHTML = `<p class="error-msg">データの読み込み中にエラーが発生しました: ${error.message}</p>`;
    }

    function renderRegionList(features, etc2Data) {
        listContainer.innerHTML = '';

        for (const regionName in REGION_CONFIG) {
            const prefNames = REGION_CONFIG[regionName];
            
            const regionHeader = document.createElement('h2');
            regionHeader.className = 'region-header';
            regionHeader.textContent = regionName;
            listContainer.appendChild(regionHeader);

            const regionWrapper = document.createElement('div');
            regionWrapper.className = 'region-wrapper';

            prefNames.forEach(prefName => {
                const stations = features.filter(f => f.properties.P35_003 === prefName);
                if (stations.length === 0) return;

                const details = document.createElement('details');
                details.className = 'pref-section';
                
                const summary = document.createElement('summary');
                summary.className = 'pref-header';
                summary.innerHTML = `
                    <span class="pref-name">${prefName}</span>
                    <span class="pref-count">${stations.length} 施設</span>
                    <span class="pref-icon">▾</span>
                `;
                
                const stationsContainer = document.createElement('div');
                stationsContainer.className = 'pref-stations';

                stations.forEach(feature => {
                    const card = UI.createStationCard(feature, etc2Data, '../');
                    stationsContainer.appendChild(card);
                });

                details.appendChild(summary);
                details.appendChild(stationsContainer);
                regionWrapper.appendChild(details);
            });

            listContainer.appendChild(regionWrapper);
        }
    }

    const autoRecommendBtn = document.getElementById('btn-auto-recommend');
    if (autoRecommendBtn) {
        autoRecommendBtn.addEventListener('click', () => {
            window.location.href = '../autorecomend/index.html';
        });
    }
});
