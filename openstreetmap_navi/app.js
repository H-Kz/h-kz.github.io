// Aura Drive - Core Application Logic

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    // --- Configuration ---
    const CONFIG = {
        styles: {
            night: 'https://tiles.basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
            day: 'https://tiles.basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
            satellite: {
                version: 8,
                sources: {
                    satellite: {
                        type: 'raster',
                        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
                        tileSize: 256, attribution: '© ESRI'
                    }
                },
                layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }]
            },
            gsi: {
                version: 8,
                sources: {
                    gsi: {
                        type: 'raster',
                        tiles: ['https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png'],
                        tileSize: 256, attribution: '© <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a>',
                        maxzoom: 18
                    }
                },
                layers: [{ id: 'gsi', type: 'raster', source: 'gsi' }]
            }
        },
        overlays: {
            railway: { tiles: ['https://a.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png'], opacity: 0.85 },
            rain: { tiles: ['https://tilecache.rainviewer.com/v2/radar/nowcast/{z}/{x}/{y}/2/1_1.png'], opacity: 0.6 },
            topo: { tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'], opacity: 0.75 },
            cycling: { tiles: ['https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png'], opacity: 0.8 }
        },
        defaultCenter: [139.767, 35.681],
        defaultZoom: 15,
        osrmBase: 'https://router.project-osrm.org/route/v1/driving',
        nominatimBase: 'https://nominatim.openstreetmap.org/search'
    };

    // --- State ---
    const state = {
        is3D: false,
        isNorthUp: true,
        isTilted: false,
        isLhd: false,
        isFollowing: true,
        userLocation: null,
        destItem: null,
        isNavigatingStartPending: false,
        lastHeading: 0,
        currentSpeed: 0,
        map: null,
        userMarker: null,
        destMarker: null,
        currentStyle: 'night',
        activeOverlays: new Set(),
        route: null,
        routeSteps: [],
        currentStepIdx: 0,
        isNavigating: false,
        totalRemaining: 0,
        etaTime: null,
        lastSpokenStep: -1,
        searchTimeout: null
    };

    // --- Map Init ---
    const initMap = () => {
        state.map = new maplibregl.Map({
            container: 'map',
            style: CONFIG.styles.night,
            center: CONFIG.defaultCenter,
            zoom: CONFIG.defaultZoom,
            pitch: 0,
            bearing: 0,
            antialias: true
        });

        state.map.on('load', () => {
            setupRouteLayer();
            startTracking();
            state.map.addControl(new maplibregl.ScaleControl({ maxWidth: 80, unit: 'metric' }), 'bottom-left');

            // Re-apply overlays and route after style change
            state.map.on('styledata', () => {
                setTimeout(() => {
                    state.activeOverlays.forEach(k => {
                        if (k === 'highway') addHighwayLayer(true);
                        else addRasterOverlay(k, true);
                    });
                    if (state.route) {
                        setupRouteLayer();
                        redrawRoute();
                    }
                }, 300);
            });

            restoreState();
        });

        // Stop following on manual drag
        state.map.on('dragstart', () => {
            if (state.isFollowing) { state.isFollowing = false; updateLocateBtn(); }
        });
    };

    // --- Route Layer ---
    const setupRouteLayer = () => {
        if (state.map.getSource('route')) return;
        state.map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        state.map.addLayer({
            id: 'route-casing', type: 'line', source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#00d2ff', 'line-width': 12, 'line-opacity': 0.3, 'line-blur': 4 }
        });
        state.map.addLayer({
            id: 'route-line', type: 'line', source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#00d2ff', 'line-width': 6, 'line-opacity': 0.8 }
        });
    };

    const redrawRoute = () => {
        if (!state.route || !state.map.getSource('route')) return;
        state.map.getSource('route').setData({ type: 'FeatureCollection', features: [state.route] });
    };

    // --- Highway Highlight (Vector layer from base style) ---
    const addHighwayLayer = (silent = false) => {
        if (state.map.getLayer('highway-highlight')) return;
        try {
            // Works with CARTO OpenMapTiles-based styles (dark-matter, voyager)
            // source-layer: 'transportation', class: motorway / trunk
            state.map.addLayer({
                id: 'highway-highlight',
                type: 'line',
                source: 'carto',
                'source-layer': 'transportation',
                filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#FFD700',
                    'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 8],
                    'line-opacity': 0.85,
                    'line-blur': 0.5
                }
            });
            if (!silent) state.activeOverlays.add('highway');
        } catch (e) {
            console.warn('高速道路強調: このスタイルでは利用できません', e);
            // Fallback: cannot display in satellite mode
            if (!silent) alert('衛星写真モードでは高速道路強調は利用できません。Dayモードまたはナイトモードに切り替えてください。');
        }
    };

    const removeHighwayLayer = () => {
        if (state.map.getLayer('highway-highlight')) state.map.removeLayer('highway-highlight');
        state.activeOverlays.delete('highway');
    };

    // --- Raster Overlays ---
    const addRasterOverlay = (key, silent = false) => {
        if (!CONFIG.overlays[key] || state.map.getLayer(key)) return;
        state.map.addSource(key, { type: 'raster', tiles: CONFIG.overlays[key].tiles, tileSize: 256 });
        state.map.addLayer({
            id: key, type: 'raster', source: key,
            paint: { 'raster-opacity': CONFIG.overlays[key].opacity }
        });
        if (!silent) state.activeOverlays.add(key);
    };

    const removeRasterOverlay = (key) => {
        if (state.map.getLayer(key)) state.map.removeLayer(key);
        if (state.map.getSource(key)) state.map.removeSource(key);
        state.activeOverlays.delete(key);
    };

    // --- Geolocation ---
    const startTracking = () => {
        if (!('geolocation' in navigator)) return;
        navigator.geolocation.watchPosition(pos => {
            const { longitude, latitude, speed, heading } = pos.coords;
            const firstLock = !state.userLocation;
            state.userLocation = [longitude, latitude];
            state.currentSpeed = speed ? Math.round(speed * 3.6) : 0;
            if (heading != null) state.lastHeading = heading;

            updateUI();
            updateUserMarker(heading);

            if (state.isFollowing) {
                state.map.easeTo({
                    center: state.userLocation,
                    bearing: state.isNorthUp ? 0 : (heading || 0),
                    zoom: state.map.getZoom() < 15 ? 17 : state.map.getZoom(),
                    pitch: state.isTilted ? 45 : 0,
                    duration: 1000
                });
            }

            if (firstLock && state.destItem && !state.route) {
                selectDestination(state.destItem);
            }

            // Step tracking during navigation
            if (state.isNavigating) advanceNavStep();
        }, err => console.error('Geolocation Error:', err), { enableHighAccuracy: true });
    };

    const updateUserMarker = (heading) => {
        if (!state.userLocation) return;
        if (!state.userMarker) {
            const el = document.createElement('div');
            el.className = 'user-marker-container';
            el.innerHTML = `<div class="user-marker-nav"></div><div class="user-marker-pulse"></div>`;
            state.userMarker = new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' })
                .setLngLat(state.userLocation).addTo(state.map);
        } else {
            state.userMarker.setLngLat(state.userLocation);
        }
        if (heading != null) state.userMarker.setRotation(heading);
    };

    // --- Search & Geocoding ---
    const searchInput = document.getElementById('dest-search');
    const searchResults = document.getElementById('search-results');
    const clearBtn = document.getElementById('btn-clear-search');

    const showResults = (items) => {
        searchResults.innerHTML = '';
        if (!items.length) {
            searchResults.innerHTML = '<div class="search-item no-result">候補が見つかりませんでした</div>';
        } else {
            items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'search-item';
                const parts = item.display_name.split(',');
                div.innerHTML = `
                    <i data-lucide="map-pin" class="result-icon"></i>
                    <div class="result-text">
                        <span class="result-name">${parts[0]}</span>
                        <span class="result-addr">${parts.slice(1, 3).join(',').trim()}</span>
                    </div>`;
                div.addEventListener('click', () => selectDestination(item));
                searchResults.appendChild(div);
            });
        }
        lucide.createIcons();
        searchResults.classList.remove('hidden');
    };

    searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim();
        clearBtn.classList.toggle('hidden', q.length === 0);
        clearTimeout(state.searchTimeout);
        if (q.length < 2) { searchResults.classList.add('hidden'); return; }
        state.searchTimeout = setTimeout(async () => {
            try {
                const url = `${CONFIG.nominatimBase}?q=${encodeURIComponent(q)}&format=json&limit=5&accept-language=ja&countrycodes=jp`;
                const res = await fetch(url, { headers: { 'Accept-Language': 'ja' } });
                showResults(await res.json());
            } catch (e) { console.error('Geocode error:', e); }
        }, 400);
    });

    searchInput.addEventListener('keydown', e => {
        if (e.key === 'Escape') { searchResults.classList.add('hidden'); searchInput.blur(); }
    });

    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.classList.add('hidden');
        searchResults.classList.add('hidden');
        searchInput.focus();
    });

    document.addEventListener('click', e => {
        if (!e.target.closest('#search-results') && !e.target.closest('.top-bar')) {
            searchResults.classList.add('hidden');
        }
    });

    // --- Destination & Routing ---
    const selectDestination = async (item) => {
        state.destItem = item;
        saveState();
        searchResults.classList.add('hidden');
        searchInput.value = item.display_name.split(',')[0];
        clearBtn.classList.remove('hidden');

        const destLng = parseFloat(item.lon);
        const destLat = parseFloat(item.lat);
        const destLngLat = [destLng, destLat];

        if (state.destMarker) state.destMarker.remove();
        const el = document.createElement('div');
        el.className = 'dest-marker';
        el.innerHTML = `<div class="dest-marker-pin"></div><div class="dest-marker-label">${item.display_name.split(',')[0]}</div>`;
        state.destMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat(destLngLat).addTo(state.map);

        document.getElementById('route-dest-name').textContent = item.display_name.split(',')[0];
        document.getElementById('nav-info-dest-name').textContent = item.display_name.split(',')[0];
        document.getElementById('route-summary').textContent = 'ルートを計算中...';
        document.getElementById('route-banner').classList.remove('hidden');
        hideHistoryCard();

        addToSearchHistory(item);

        await fetchRoute(state.userLocation || CONFIG.defaultCenter, destLngLat);

        if (state.isNavigatingStartPending) {
            state.isNavigatingStartPending = false;
            startNavigation();
        }
    };

    const fetchRoute = async (origin, dest) => {
        try {
            const url = `${CONFIG.osrmBase}/${origin[0]},${origin[1]};${dest[0]},${dest[1]}?overview=full&geometries=geojson&steps=true`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.code !== 'Ok' || !data.routes.length) {
                document.getElementById('route-summary').textContent = 'ルートが見つかりませんでした';
                return;
            }
            const route = data.routes[0];
            const distKm = (route.distance / 1000).toFixed(1);
            const durMin = Math.round(route.duration / 60);
            const eta = new Date(Date.now() + route.duration * 1000);
            const etaStr = `${String(eta.getHours()).padStart(2, '0')}:${String(eta.getMinutes()).padStart(2, '0')}`;

            // Store steps for turn-by-turn
            state.routeSteps = route.legs.flatMap(l => l.steps);
            state.currentStepIdx = 0;
            state.lastSpokenStep = -1;
            state.totalRemaining = route.distance;
            state.etaTime = eta;

            document.getElementById('route-summary').textContent = `${distKm} km · 約 ${durMin} 分`;

            state.route = { type: 'Feature', geometry: route.geometry };
            if (!state.map.getSource('route')) setupRouteLayer();
            state.map.getSource('route').setData({ type: 'FeatureCollection', features: [state.route] });

            const coords = route.geometry.coordinates;
            const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
            state.map.fitBounds(bounds, { padding: { top: 120, bottom: 140, left: 80, right: 100 }, duration: 1200 });
            state.isFollowing = false;
            updateLocateBtn();

            // Show start button
            document.getElementById('btn-start-nav').classList.remove('hidden');
        } catch (e) {
            console.error('Routing error:', e);
            document.getElementById('route-summary').textContent = 'ルートの取得に失敗しました';
        }
    };

    // --- Navigation Helpers ---
    const haversine = (a, b) => {
        const R = 6371000, toRad = d => d * Math.PI / 180;
        const dLat = toRad(b[1] - a[1]), dLon = toRad(b[0] - a[0]);
        const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    };

    const maneuverIcon = (step) => {
        const type = step.maneuver.type;
        const mod = step.maneuver.modifier || '';
        if (type === 'arrive') return 'map-pin';
        if (type === 'depart') return 'arrow-up';
        if (type === 'roundabout' || type === 'rotary') return 'rotate-cw';
        if (mod.includes('left')) return mod.includes('sharp') ? 'corner-up-left' : mod.includes('slight') ? 'arrow-up-left' : 'corner-up-left';
        if (mod.includes('right')) return mod.includes('sharp') ? 'corner-up-right' : mod.includes('slight') ? 'arrow-up-right' : 'corner-up-right';
        if (mod === 'uturn') return 'rotate-ccw';
        return 'arrow-up';
    };

    const formatDist = m => m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;

    const speak = (text) => {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ja-JP'; u.rate = 1.05;
        window.speechSynthesis.speak(u);
    };

    const startNavigation = () => {
        if (!state.routeSteps.length) return;
        state.isNavigating = true;
        state.isFollowing = true;
        state.isNorthUp = false;
        state.isTilted = true;
        document.getElementById('view-heading-up').classList.add('active');
        document.getElementById('view-north-up').classList.remove('active');
        document.getElementById('view-tilt').classList.add('active');
        document.getElementById('view-flat').classList.remove('active');
        document.getElementById('btn-3d').classList.add('active');
        document.getElementById('route-banner').classList.add('hidden');
        document.getElementById('nav-info-popup').classList.remove('hidden');
        hideHistoryCard();
        updateLocateBtn();
        updateNavPanel();
        saveState();
        speak('案内を開始します');
    };

    const stopNavigation = () => {
        state.isNavigating = false;
        saveState();
        document.getElementById('nav-info-popup').classList.add('hidden');
        if (state.route) document.getElementById('route-banner').classList.remove('hidden');
        speak('案内を終了します');
    };

    const updateNavPanel = () => {
        if (!state.isNavigating || !state.routeSteps.length) return;
        const step = state.routeSteps[state.currentStepIdx];
        const icon = maneuverIcon(step);
        // Update icon via innerHTML swap
        const box = document.getElementById('nav-turn-icon');
        box.setAttribute('data-lucide', icon);
        lucide.createIcons({ nodes: [box.parentElement] });
        document.getElementById('nav-step-dist').textContent = formatDist(step.distance);
        document.getElementById('nav-step-road').textContent = step.name || (step.maneuver.type === 'arrive' ? '目的地に到着' : '直進');
        const remaining = formatDist(state.totalRemaining);
        document.getElementById('nav-remaining').textContent = remaining;
        if (state.etaTime) {
            const h = String(state.etaTime.getHours()).padStart(2, '0');
            const m = String(state.etaTime.getMinutes()).padStart(2, '0');
            document.getElementById('nav-eta-panel').textContent = `${h}:${m} 着`;
        }
    };

    const advanceNavStep = () => {
        if (!state.isNavigating || !state.userLocation) return;
        const steps = state.routeSteps;
        if (state.currentStepIdx >= steps.length - 1) {
            // Arrived
            speak('目的地に到着しました');
            stopNavigation();
            cancelRoute();
            return;
        }
        const nextStep = steps[state.currentStepIdx + 1];
        const nextCoord = nextStep.maneuver.location; // [lng, lat]
        const dist = haversine(state.userLocation, nextCoord);
        // Advance when within 30m of next step's start
        if (dist < 30) {
            state.currentStepIdx++;
            // Voice guidance for upcoming step
            if (state.currentStepIdx !== state.lastSpokenStep) {
                state.lastSpokenStep = state.currentStepIdx;
                const s = steps[state.currentStepIdx];
                const mod = s.maneuver.modifier || '';
                const road = s.name ? `${s.name}へ` : '';
                if (s.maneuver.type === 'arrive') speak('目的地に到着です');
                else if (mod.includes('left')) speak(`${road}左折です`);
                else if (mod.includes('right')) speak(`${road}右折です`);
                else if (mod === 'uturn') speak('Uターンです');
                else speak(`${road}直進です`);
            }
        } else {
            // Approaching warning (200m)
            const curStep = steps[state.currentStepIdx];
            const curCoord = nextStep.maneuver.location;
            const approaching = haversine(state.userLocation, curCoord);
            if (approaching < 200 && state.currentStepIdx !== state.lastSpokenStep) {
                state.lastSpokenStep = state.currentStepIdx;
                const mod = nextStep.maneuver.modifier || '';
                const road = nextStep.name ? `${nextStep.name}へ` : '';
                if (mod.includes('left')) speak(`まもなく${road}左折です`);
                else if (mod.includes('right')) speak(`まもなく${road}右折です`);
            }
        }
        // Update remaining distance (approximate)
        let rem = 0;
        for (let i = state.currentStepIdx; i < steps.length; i++) rem += steps[i].distance;
        state.totalRemaining = rem;
        // Update ETA
        let remDur = 0;
        for (let i = state.currentStepIdx; i < steps.length; i++) remDur += steps[i].duration;
        state.etaTime = new Date(Date.now() + remDur * 1000);
        updateNavPanel();
    };

    const cancelRoute = () => {
        if (state.isNavigating) stopNavigation();
        if (state.destMarker) { state.destMarker.remove(); state.destMarker = null; }
        if (state.map.getSource('route')) {
            state.map.getSource('route').setData({ type: 'FeatureCollection', features: [] });
        }
        state.route = null;
        state.routeSteps = [];
        state.currentStepIdx = 0;
        state.destItem = null;
        saveState();
        searchInput.value = '';
        clearBtn.classList.add('hidden');
        document.getElementById('route-banner').classList.add('hidden');
        document.getElementById('btn-start-nav').classList.add('hidden');
        document.getElementById('nav-info-popup').classList.add('hidden');
        document.getElementById('nav-info-dest-name').textContent = '---';
        showHistoryCard();
    };

    document.getElementById('btn-cancel-route').addEventListener('click', cancelRoute);
    document.getElementById('btn-start-nav').addEventListener('click', startNavigation);
    document.getElementById('btn-stop-nav').addEventListener('click', stopNavigation);

    // --- localStorage Persistence ---
    const STORAGE_KEY = 'aura_drive_state';
    const HISTORY_KEY = 'aura_drive_history';

    // Search history helpers
    const getSearchHistory = () => {
        try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
        catch (e) { return []; }
    };
    const addToSearchHistory = (item) => {
        const history = getSearchHistory();
        const name = item.display_name.split(',')[0];
        const filtered = history.filter(h => h.display_name !== item.display_name);
        filtered.unshift({ display_name: item.display_name, lat: item.lat, lon: item.lon });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered.slice(0, 8)));
        renderHistoryCard();
    };
    const clearSearchHistory = () => {
        localStorage.removeItem(HISTORY_KEY);
        renderHistoryCard();
    };
    const renderHistoryCard = () => {
        const list = document.getElementById('history-list');
        const history = getSearchHistory();
        if (!history.length) {
            list.innerHTML = '<div class="history-empty">履歴なし</div>';
            return;
        }
        list.innerHTML = history.map((item, i) => `
            <div class="history-item" data-idx="${i}">
                <i data-lucide="clock"></i>
                <span class="history-item-name">${item.display_name.split(',')[0]}</span>
            </div>
        `).join('');
        lucide.createIcons({ nodes: [list] });
        list.querySelectorAll('.history-item').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.idx);
                selectDestination(history[idx]);
            });
        });
    };
    const showHistoryCard = () => {
        renderHistoryCard();
        document.getElementById('search-history-card').classList.remove('hidden');
    };
    const hideHistoryCard = () => {
        document.getElementById('search-history-card').classList.add('hidden');
    };

    document.getElementById('btn-clear-history').addEventListener('click', clearSearchHistory);

    const saveState = () => {
        try {
            const routeData = state.route ? {
                geometry: state.route.geometry,
                properties: state.route.properties
            } : null;
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                currentStyle: state.currentStyle,
                activeOverlays: Array.from(state.activeOverlays),
                isNorthUp: state.isNorthUp,
                isTilted: state.isTilted,
                isLhd: state.isLhd,
                destItem: state.destItem,
                isNavigating: state.isNavigating,
                routeData
            }));
        } catch (e) { console.warn('State save failed:', e); }
    };

    const restoreState = () => {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (!saved) {
                showHistoryCard();
                return;
            }

            // Restore map style
            if (saved.currentStyle && saved.currentStyle !== 'night') {
                state.currentStyle = saved.currentStyle;
                state.map.setStyle(CONFIG.styles[saved.currentStyle]);
                document.querySelectorAll('.layer-opt[data-style]').forEach(b => {
                    b.classList.toggle('active', b.dataset.style === saved.currentStyle);
                });
            }

            // Restore overlays (after style loads)
            if (saved.activeOverlays && saved.activeOverlays.length) {
                state.map.once('styledata', () => {
                    setTimeout(() => {
                        saved.activeOverlays.forEach(key => {
                            if (key === 'highway') addHighwayLayer(true);
                            else addRasterOverlay(key, true);
                            const btn = document.getElementById('toggle-' + key);
                            if (btn) btn.classList.add('active');
                        });
                    }, 400);
                });
            }

            // Restore view options
            if (saved.isNorthUp === false) {
                state.isNorthUp = false;
                document.getElementById('view-north-up').classList.remove('active');
                document.getElementById('view-heading-up').classList.add('active');
            }
            if (saved.isTilted === true) {
                state.isTilted = true;
                state.is3D = true;
                document.getElementById('view-flat').classList.remove('active');
                document.getElementById('view-tilt').classList.add('active');
                document.getElementById('btn-3d').classList.add('active');
            }
            if (saved.isLhd === true) {
                state.isLhd = true;
                document.getElementById('view-rhd').classList.remove('active');
                document.getElementById('view-lhd').classList.add('active');
                document.body.classList.add('lhd');
            }

            if (saved.destItem) {
                state.destItem = saved.destItem;
                // Restore route geometry if available
                if (saved.routeData && state.map.getSource('route')) {
                    state.route = saved.routeData;
                    redrawRoute();
                }
            }
            if (saved.isNavigating) {
                state.isNavigatingStartPending = true;
            }

            // Show history card if not navigating
            if (!saved.isNavigating) {
                showHistoryCard();
            }
        } catch (e) { console.warn('State restore failed:', e); showHistoryCard(); }
    };

    // --- UI Update ---
    const updateLocateBtn = () => {
        document.getElementById('btn-locate').classList.toggle('active', state.isFollowing);
    };

    const updateUI = () => {
        const el = document.getElementById('speed-val');
        if (el) el.textContent = state.currentSpeed;
        updateLocateBtn();
    };

    // --- View Controls ---
    // Bearing toggle (North-up / Heading-up)
    document.getElementById('view-north-up').addEventListener('click', () => {
        if (state.isNorthUp) return;
        state.isNorthUp = true;
        document.getElementById('view-north-up').classList.add('active');
        document.getElementById('view-heading-up').classList.remove('active');
        state.isTilted = false; state.is3D = false;
        document.getElementById('view-flat').classList.add('active');
        document.getElementById('view-tilt').classList.remove('active');
        document.getElementById('btn-3d').classList.remove('active');
        state.map.easeTo({ bearing: 0, pitch: 0, duration: 600 });
        saveState();
    });

    document.getElementById('view-heading-up').addEventListener('click', () => {
        if (!state.isNorthUp) return;
        state.isNorthUp = false;
        document.getElementById('view-heading-up').classList.add('active');
        document.getElementById('view-north-up').classList.remove('active');
        state.map.easeTo({ bearing: state.lastHeading, duration: 600 });
        saveState();
    });

    document.getElementById('view-flat').addEventListener('click', () => {
        if (!state.isTilted) return;
        state.isTilted = false; state.is3D = false;
        document.getElementById('view-flat').classList.add('active');
        document.getElementById('view-tilt').classList.remove('active');
        document.getElementById('btn-3d').classList.remove('active');
        state.map.easeTo({ pitch: 0, duration: 600 });
        saveState();
    });

    document.getElementById('view-tilt').addEventListener('click', () => {
        if (state.isTilted) return;
        state.isTilted = true; state.is3D = true;

        if (state.isNorthUp) {
            state.isNorthUp = false;
            document.getElementById('view-heading-up').classList.add('active');
            document.getElementById('view-north-up').classList.remove('active');
        }

        document.getElementById('view-tilt').classList.add('active');
        document.getElementById('view-flat').classList.remove('active');
        document.getElementById('btn-3d').classList.add('active');
        state.map.easeTo({ pitch: 45, bearing: state.lastHeading, duration: 600 });
        saveState();
    });

    // LHD/RHD toggle
    document.getElementById('view-rhd').addEventListener('click', () => {
        if (!state.isLhd) return;
        state.isLhd = false;
        document.getElementById('view-rhd').classList.add('active');
        document.getElementById('view-lhd').classList.remove('active');
        document.body.classList.remove('lhd');
        saveState();
    });

    document.getElementById('view-lhd').addEventListener('click', () => {
        if (state.isLhd) return;
        state.isLhd = true;
        document.getElementById('view-lhd').classList.add('active');
        document.getElementById('view-rhd').classList.remove('active');
        document.body.classList.add('lhd');
        saveState();
    });

    // --- Control Buttons ---
    document.getElementById('btn-locate').addEventListener('click', () => {
        state.isFollowing = !state.isFollowing;
        updateLocateBtn();
        if (state.isFollowing && state.userLocation) {
            state.map.flyTo({ center: state.userLocation, zoom: 17, duration: 1500 });
        }
    });

    document.getElementById('btn-3d').addEventListener('click', () => {
        state.is3D = !state.is3D;
        state.isTilted = state.is3D;
        document.getElementById('btn-3d').classList.toggle('active', state.is3D);
        document.getElementById('view-flat').classList.toggle('active', !state.is3D);
        document.getElementById('view-tilt').classList.toggle('active', state.is3D);

        let targetBearing = state.map.getBearing();
        if (state.is3D && state.isNorthUp) {
            state.isNorthUp = false;
            document.getElementById('view-heading-up').classList.add('active');
            document.getElementById('view-north-up').classList.remove('active');
            targetBearing = state.lastHeading;
        }

        state.map.easeTo({ pitch: state.is3D ? 45 : 0, bearing: targetBearing, duration: 1000 });
        saveState();
    });

    document.getElementById('btn-zoom-in').addEventListener('click', () => state.map.zoomIn());
    document.getElementById('btn-zoom-out').addEventListener('click', () => state.map.zoomOut());

    // --- Layer Menu ---
    document.getElementById('btn-layers').addEventListener('click', () => {
        document.getElementById('layer-menu').classList.toggle('hidden');
    });
    document.getElementById('close-layers').addEventListener('click', () => {
        document.getElementById('layer-menu').classList.add('hidden');
    });

    // Base style switcher
    document.querySelectorAll('.layer-opt[data-style]').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.style;
            if (state.currentStyle === key) return;
            document.querySelectorAll('.layer-opt[data-style]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentStyle = key;
            state.map.setStyle(CONFIG.styles[key]);
            saveState();
        });
    });

    // Overlay toggles (unified handler)
    document.querySelectorAll('.overlay-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.overlay;
            if (key === 'highway') {
                if (state.activeOverlays.has('highway')) {
                    removeHighwayLayer(); btn.classList.remove('active');
                } else {
                    addHighwayLayer();
                    if (state.activeOverlays.has('highway')) btn.classList.add('active');
                }
            } else {
                if (state.activeOverlays.has(key)) {
                    removeRasterOverlay(key); btn.classList.remove('active');
                } else {
                    addRasterOverlay(key); btn.classList.add('active');
                }
            }
            saveState();
        });
    });

    initMap();
});

// --- Injected Marker Styles ---
const markerStyle = document.createElement('style');
markerStyle.textContent = `
    .user-marker-container {
        width: 100px; height: 100px;
        display: flex; align-items: center; justify-content: center;
        position: relative; pointer-events: none;
    }
    .user-marker-nav {
        position: absolute; width: 70px; height: 70px;
        border-radius: 50%;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        background-image: url('icons/nav-arrow.svg');
        background-size: contain; background-repeat: no-repeat; background-position: center;
        box-shadow: 0 0 20px rgba(0, 150, 255, 0.6), 0 0 40px rgba(0, 210, 255, 0.3);
        z-index: 5;
    }
    .user-marker-pulse {
        position: absolute; width: 80px; height: 80px;
        background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
        border-radius: 50%; z-index: 1;
        animation: marker-pulse 2s infinite cubic-bezier(0.23, 1, 0.32, 1);
    }
    @keyframes marker-pulse {
        0% { transform: scale(0.6); opacity: 1; }
        100% { transform: scale(2.2); opacity: 0; }
    }
    .dest-marker {
        display: flex; flex-direction: column; align-items: center;
        pointer-events: none;
    }
    .dest-marker-pin {
        width: 20px; height: 20px;
        background: var(--danger);
        border: 3px solid white;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 0 20px rgba(255,77,77,0.7);
    }
    .dest-marker-label {
        margin-top: 6px;
        background: var(--glass-bg);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255,77,77,0.4);
        color: #fff;
        font-family: var(--font-main);
        font-size: 0.75rem; font-weight: 600;
        padding: 3px 10px; border-radius: 20px;
        white-space: nowrap; max-width: 160px;
        overflow: hidden; text-overflow: ellipsis;
    }
`;
document.head.appendChild(markerStyle);
