/* ============ SkyDash-Manager ============ */
(() => {
  'use strict';

  // ---------- Credenciales por defecto ----------
  const DEFAULT_USERS = [
    { user: 'admin', pass: 'skydash123' },
    { user: 'user',  pass: 'user123' },
  ];

  // ---------- State ----------
  const state = {
    map: null,
    marker: null,
    current: null,
    favorites: [],
    forcedOffline: false, // toggle manual online/offline
  };

  const LS_FAVS = 'skydash.favorites';
  const LS_SESSION = 'skydash.session';
  const LS_MODE = 'skydash.mode'; // 'online' | 'offline'

  // ---------- DOM helpers ----------
  const $ = (id) => document.getElementById(id);
  const on = (el, ev, fn) => el.addEventListener(ev, fn);

  // ---------- Weather code -> emoji ----------
  function weatherEmoji(code) {
    if (code == null) return '❓';
    if (code === 0) return '☀️';
    if ([1, 2].includes(code)) return '🌤️';
    if (code === 3) return '☁️';
    if ([45, 48].includes(code)) return '🌫️';
    if ([51, 53, 55, 56, 57].includes(code)) return '🌦️';
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '🌧️';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄️';
    if ([95, 96, 99].includes(code)) return '⛈️';
    return '☁️';
  }

  function dayName(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
  }

  // ---------- Session ----------
  function isLoggedIn() {
    try { return sessionStorage.getItem(LS_SESSION) === '1'; } catch { return false; }
  }
  function setSession(v) {
    try { v ? sessionStorage.setItem(LS_SESSION, '1') : sessionStorage.removeItem(LS_SESSION); } catch {}
  }

  function showView(id) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('view--active'));
    $(id).classList.add('view--active');
  }

  // ---------- Login (con validación real) ----------
  function validateCredentials(user, pass) {
    return DEFAULT_USERS.some((u) => u.user === user && u.pass === pass);
  }

  function initLogin() {
    on($('login-form'), 'submit', async (e) => {
      e.preventDefault();
      const btn = $('login-btn');
      const spinner = $('login-spinner');
      const err = $('login-error');
      const user = $('login-user').value.trim();
      const pass = $('login-pass').value;

      err.hidden = true;

      if (!user || !pass) {
        err.textContent = 'Ingresa usuario y contraseña.';
        err.hidden = false;
        return;
      }

      btn.disabled = true;
      spinner.classList.remove('spinner--hidden');
      await new Promise((r) => setTimeout(r, 600));
      spinner.classList.add('spinner--hidden');
      btn.disabled = false;

      if (!validateCredentials(user, pass)) {
        err.textContent = 'Usuario o contraseña incorrectos.';
        err.hidden = false;
        $('login-pass').value = '';
        return;
      }

      setSession(true);
      enterDashboard();
    });
  }

  function initLogout() {
    on($('logout-btn'), 'click', () => {
      setSession(false);
      showView('login-view');
    });
  }

  // ---------- Theme ----------
  function initTheme() {
    const saved = localStorage.getItem('skydash.theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    on($('theme-toggle'), 'click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('skydash.theme', next);
    });
  }

  // ---------- Modo Online / Offline (manual) ----------
  function isOffline() {
    return state.forcedOffline || !navigator.onLine;
  }

  function renderModeButton() {
    const btn = $('mode-toggle');
    const label = $('mode-label');
    if (!btn) return;
    const offline = isOffline();
    label.textContent = offline ? 'Offline' : 'Online';
    btn.classList.toggle('btn--mode-offline', offline);
    btn.classList.toggle('btn--mode-online', !offline);
    btn.setAttribute('aria-pressed', String(offline));

    const net = $('net-status');
    if (offline) net.classList.remove('net-status--hidden');
    else net.classList.add('net-status--hidden');
  }

  function initModeToggle() {
    const saved = localStorage.getItem(LS_MODE);
    state.forcedOffline = saved === 'offline';
    on($('mode-toggle'), 'click', () => {
      state.forcedOffline = !state.forcedOffline;
      localStorage.setItem(LS_MODE, state.forcedOffline ? 'offline' : 'online');
      renderModeButton();
    });
    window.addEventListener('online', renderModeButton);
    window.addEventListener('offline', renderModeButton);
    renderModeButton();
  }

  // ---------- Favorites ----------
  function loadFavorites() {
    try { state.favorites = JSON.parse(localStorage.getItem(LS_FAVS) || '[]'); }
    catch { state.favorites = []; }
  }
  function saveFavorites() {
    localStorage.setItem(LS_FAVS, JSON.stringify(state.favorites));
  }
  function renderFavorites() {
    const list = $('fav-list');
    list.innerHTML = '';
    state.favorites.forEach((f, idx) => {
      const li = document.createElement('li');
      li.className = 'fav-list__item';
      const name = document.createElement('span');
      name.className = 'fav-list__name';
      name.textContent = f.name;
      const remove = document.createElement('button');
      remove.className = 'fav-list__remove';
      remove.type = 'button';
      remove.textContent = '×';
      remove.title = 'Eliminar';
      on(remove, 'click', (e) => {
        e.stopPropagation();
        state.favorites.splice(idx, 1);
        saveFavorites();
        renderFavorites();
      });
      on(li, 'click', () => loadLocation(f.lat, f.lon, f.name));
      li.appendChild(name);
      li.appendChild(remove);
      list.appendChild(li);
    });
  }

  function initSaveFav() {
    on($('save-fav-btn'), 'click', () => {
      if (!state.current) return;
      const { lat, lon, name } = state.current;
      const exists = state.favorites.some((f) => Math.abs(f.lat - lat) < 0.01 && Math.abs(f.lon - lon) < 0.01);
      if (exists) return;
      state.favorites.push({ lat, lon, name });
      saveFavorites();
      renderFavorites();
    });
  }

  // ---------- Map ----------
  function initMap() {
    if (state.map) return;
    state.map = L.map('map', { zoomControl: true }).setView([40.4168, -3.7038], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(state.map);
    on(state.map, 'click', async (e) => {
      const { lat, lng } = e.latlng;
      const name = await reverseGeocode(lat, lng);
      loadLocation(lat, lng, name, true);
    });
    setTimeout(() => state.map.invalidateSize(), 200);
  }

  function setMarker(lat, lon, code) {
    const icon = L.divIcon({
      className: 'weather-marker',
      html: weatherEmoji(code),
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });
    if (state.marker) state.map.removeLayer(state.marker);
    state.marker = L.marker([lat, lon], { icon }).addTo(state.map);
  }

  // ---------- APIs ----------
  function guardOnline() {
    if (isOffline()) throw new Error('offline');
  }

  async function geocode(query) {
    guardOnline();
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=es&format=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Geocoding failed');
    const data = await res.json();
    if (!data.results || !data.results.length) return null;
    const r = data.results[0];
    return { lat: r.latitude, lon: r.longitude, name: `${r.name}${r.country ? ', ' + r.country : ''}` };
  }

  async function reverseGeocode(lat, lon) {
    if (isOffline()) return `Lat ${lat.toFixed(2)}, Lon ${lon.toFixed(2)}`;
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&accept-language=es`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const a = data.address || {};
      const city = a.city || a.town || a.village || a.state || data.name || 'Ubicación';
      return `${city}${a.country ? ', ' + a.country : ''}`;
    } catch {
      return `Lat ${lat.toFixed(2)}, Lon ${lon.toFixed(2)}`;
    }
  }

  async function fetchWeather(lat, lon) {
    guardOnline();
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Weather failed');
    return res.json();
  }

  // ---------- Render ----------
  function renderCurrent(name, data) {
    const c = data.current || {};
    $('current-location').textContent = name;
    $('current-icon').textContent = weatherEmoji(c.weather_code);
    $('current-temp').textContent = c.temperature_2m != null ? `${Math.round(c.temperature_2m)}°` : '--°';
    $('current-humidity').textContent = c.relative_humidity_2m != null ? `${c.relative_humidity_2m}%` : '--%';
    $('current-wind').textContent = c.wind_speed_10m != null ? `${Math.round(c.wind_speed_10m)} km/h` : '-- km/h';
    $('current-feels').textContent = c.apparent_temperature != null ? `${Math.round(c.apparent_temperature)}°` : '--°';
    $('save-fav-btn').disabled = false;
  }

  function renderForecast(data) {
    const list = $('forecast-list');
    list.innerHTML = '';
    const d = data.daily;
    if (!d || !d.time) return;
    d.time.forEach((t, i) => {
      const li = document.createElement('li');
      li.className = 'forecast__item';
      const day = document.createElement('span'); day.className = 'forecast__day'; day.textContent = dayName(t);
      const ic = document.createElement('span'); ic.className = 'forecast__icon'; ic.textContent = weatherEmoji(d.weather_code[i]);
      const mn = document.createElement('span'); mn.className = 'forecast__min'; mn.textContent = `${Math.round(d.temperature_2m_min[i])}°`;
      const mx = document.createElement('span'); mx.className = 'forecast__max'; mx.textContent = `${Math.round(d.temperature_2m_max[i])}°`;
      li.append(day, ic, mn, mx);
      list.appendChild(li);
    });
  }

  // ---------- Flow ----------
  async function loadLocation(lat, lon, name, preserveZoom = false) {
    const overlay = $('loading-overlay');
    overlay.classList.remove('overlay--hidden');
    try {
      const zoom = preserveZoom ? state.map.getZoom() : 9;
      state.map.flyTo([lat, lon], zoom, { duration: 1.2 });
      const data = await fetchWeather(lat, lon);
      state.current = { lat, lon, name };
      setMarker(lat, lon, data.current && data.current.weather_code);
      renderCurrent(name, data);
      renderForecast(data);
    } catch (err) {
      console.error(err);
      if (err && err.message === 'offline') {
        $('current-location').textContent = 'Sin conexión (modo offline)';
        alert('Estás en modo offline. Activa el modo Online para cargar datos.');
      } else {
        $('current-location').textContent = 'Error al cargar datos';
      }
    } finally {
      overlay.classList.add('overlay--hidden');
    }
  }

  function initSearch() {
    on($('search-form'), 'submit', async (e) => {
      e.preventDefault();
      const q = $('search-input').value.trim();
      if (!q) return;
      if (isOffline()) {
        alert('Estás en modo offline. Activa el modo Online para buscar ciudades.');
        return;
      }
      const overlay = $('loading-overlay');
      overlay.classList.remove('overlay--hidden');
      try {
        const r = await geocode(q);
        if (!r) { alert('Ciudad no encontrada'); return; }
        await loadLocation(r.lat, r.lon, r.name);
      } catch (err) {
        console.error(err);
        alert('Error al buscar ciudad');
      } finally {
        overlay.classList.add('overlay--hidden');
      }
    });
  }

  // ---------- Service Worker (inline) ----------
  function initServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const swCode = `
      const CACHE = 'skydash-v1';
      const ASSETS = ['./', './index.html', './styles.css', './script.js',
        'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
        'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'];
      self.addEventListener('install', (e) => {
        e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})));
        self.skipWaiting();
      });
      self.addEventListener('activate', (e) => {
        e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
        self.clients.claim();
      });
      self.addEventListener('fetch', (e) => {
        const req = e.request;
        if (req.method !== 'GET') return;
        e.respondWith(
          caches.match(req).then(cached => {
            const fetchPromise = fetch(req).then(res => {
              if (res && res.status === 200 && (req.url.startsWith(self.location.origin) || req.url.includes('unpkg.com'))) {
                const clone = res.clone();
                caches.open(CACHE).then(c => c.put(req, clone));
              }
              return res;
            }).catch(() => cached);
            return cached || fetchPromise;
          })
        );
      });
    `;
    try {
      const blob = new Blob([swCode], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      navigator.serviceWorker.register(url).catch((e) => console.warn('SW register failed', e));
    } catch (e) { console.warn(e); }
  }

  // ---------- Dashboard init ----------
  function enterDashboard() {
    showView('dashboard-view');
    initMap();
    loadFavorites();
    renderFavorites();
    renderModeButton();
    setTimeout(() => state.map && state.map.invalidateSize(), 300);
  }

  // ---------- Boot ----------
  function boot() {
    initTheme();
    initLogin();
    initLogout();
    initSearch();
    initSaveFav();
    initModeToggle();
    initServiceWorker();
    if (isLoggedIn()) enterDashboard();
    else showView('login-view');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
