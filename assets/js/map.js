/* ============================================================
   tuTaxi — map.js
   Mapa Leaflet, geocodificación, rutas y autocomplete
   ============================================================ */

let map = null, markerO = null, markerD = null, routeLine = null;
let coordO = null, coordD = null, pinMode = null;
let ddTimers = {}, ddRes = { origen: [], destino: [] };
let marcadoresChoferes = {};

// ── INICIALIZACIÓN ────────────────────────────────
function initMapa() {
  if (map !== null) { map.invalidateSize(); return; }
  map = L.map('map', { zoom: 14, zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>', maxZoom: 19
  }).addTo(map);

  map.on('click', function (e) {
    if (!pinMode) return;
    geocReverso(e.latlng.lat, e.latlng.lng, nombre => {
      if (pinMode === 'origen') {
        coordO = { lat: e.latlng.lat, lng: e.latlng.lng };
        document.getElementById('inp-origen').value = nombre;
        document.getElementById('cl-origen').style.display = 'block';
        ponerPin('origen', e.latlng.lat, e.latlng.lng);
      } else {
        coordD = { lat: e.latlng.lat, lng: e.latlng.lng };
        document.getElementById('inp-destino').value = nombre;
        document.getElementById('cl-destino').style.display = 'block';
        ponerPin('destino', e.latlng.lat, e.latlng.lng);
      }
      desactivarPin();
      if (coordO && coordD) trazarRuta();
    });
  });
  miUbicacion(true);
}

// ── ICONOS ────────────────────────────────────────
function mkIcono(emoji, color) {
  return L.divIcon({
    html: `<div style="background:${color};width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #000;box-shadow:0 3px 10px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);font-size:15px;">${emoji}</span></div>`,
    className: '', iconSize: [36, 36], iconAnchor: [18, 36]
  });
}

function iconoVehiculo(conPasaje) {
  const color  = conPasaje ? '#ef4444' : '#cccccc';
  const sombra = conPasaje ? 'rgba(239,68,68,.5)' : 'rgba(150,150,150,.4)';
  return L.divIcon({
    html: `<div style="position:relative;width:36px;height:36px;filter:drop-shadow(0 2px 6px ${sombra});">
      <svg viewBox="0 0 64 64" width="36" height="36" xmlns="http://www.w3.org/2000/svg">
        <rect x="8" y="28" width="48" height="20" rx="6" fill="${color}"/>
        <path d="M18 28 L22 14 L42 14 L46 28 Z" fill="${color}" opacity=".85"/>
        <path d="M23 27 L26 16 L38 16 L41 27 Z" fill="#cceeff" opacity=".7"/>
        <circle cx="18" cy="48" r="7" fill="#222"/><circle cx="18" cy="48" r="3.5" fill="#888"/>
        <circle cx="46" cy="48" r="7" fill="#222"/><circle cx="46" cy="48" r="3.5" fill="#888"/>
        <rect x="8" y="32" width="5" height="4" rx="1" fill="#fff9"/>
        <rect x="51" y="32" width="5" height="4" rx="1" fill="#ff09"/>
      </svg>
      <div style="position:absolute;top:-4px;right:-4px;width:12px;height:12px;border-radius:50%;background:${conPasaje ? '#ef4444' : '#22c55e'};border:2px solid #000;"></div>
    </div>`,
    className: '', iconSize: [36, 36], iconAnchor: [18, 36],
  });
}

// ── MARCADORES ────────────────────────────────────
function ponerPin(tipo, lat, lng) {
  if (tipo === 'origen') {
    if (markerO) map.removeLayer(markerO);
    markerO = L.marker([lat, lng], { icon: mkIcono('📍', '#f5c518'), draggable: true }).addTo(map);
    markerO.on('dragend', e => {
      const p = e.target.getLatLng(); coordO = { lat: p.lat, lng: p.lng };
      geocReverso(p.lat, p.lng, n => { document.getElementById('inp-origen').value = n; if (coordD) trazarRuta(); });
    });
  } else {
    if (markerD) map.removeLayer(markerD);
    markerD = L.marker([lat, lng], { icon: mkIcono('🎯', '#ff6b35'), draggable: true }).addTo(map);
    markerD.on('dragend', e => {
      const p = e.target.getLatLng(); coordD = { lat: p.lat, lng: p.lng };
      geocReverso(p.lat, p.lng, n => { document.getElementById('inp-destino').value = n; if (coordO) trazarRuta(); });
    });
  }
}

// ── RUTA ──────────────────────────────────────────
function trazarRuta() {
  if (!coordO || !coordD) return;
  if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  const url = `https://router.project-osrm.org/route/v1/driving/${coordO.lng},${coordO.lat};${coordD.lng},${coordD.lat}?overview=full&geometries=geojson`;
  fetch(url).then(r => r.json()).then(data => {
    if (!data.routes?.length) { rutaLinea(); return; }
    const r = data.routes[0];
    const pts = r.geometry.coordinates.map(c => [c[1], c[0]]);
    routeLine = L.polyline(pts, { color: '#f5c518', weight: 5, opacity: .9 }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
    const km  = (r.distance / 1000).toFixed(1);
    const min = Math.round(r.duration / 60);
    const sug = Math.max(30, Math.round(parseFloat(km) * 9));
    document.getElementById('ri-dist').textContent = km + ' km';
    document.getElementById('ri-time').textContent = min + ' min';
    document.getElementById('ri-sug').textContent  = '$' + sug;
    document.getElementById('route-info').classList.add('on');
    pickPrice(sug);
  }).catch(() => rutaLinea());
}

function rutaLinea() {
  if (routeLine) map.removeLayer(routeLine);
  routeLine = L.polyline([[coordO.lat, coordO.lng], [coordD.lat, coordD.lng]], { color: '#f5c518', weight: 4, dashArray: '8 6' }).addTo(map);
  map.fitBounds([[coordO.lat, coordO.lng], [coordD.lat, coordD.lng]], { padding: [50, 50] });
  const d   = map.distance([coordO.lat, coordO.lng], [coordD.lat, coordD.lng]);
  const km  = (d / 1000).toFixed(1);
  document.getElementById('ri-dist').textContent = km + ' km';
  document.getElementById('ri-time').textContent = Math.round(d / 300) + ' min';
  document.getElementById('ri-sug').textContent  = '$' + Math.max(30, Math.round(parseFloat(km) * 9));
  document.getElementById('route-info').classList.add('on');
}

// ── GPS ───────────────────────────────────────────
function miUbicacion(silencioso = false) {
  if (!map) { if (!silencioso) toast('Mapa no listo', 'err'); return; }
  if (!navigator.geolocation) { if (!silencioso) toast('GPS no disponible', 'err'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: lat, longitude: lng } = pos.coords;
    map.setView([lat, lng], 15);
    if (!coordO) {
      geocReverso(lat, lng, nombre => {
        coordO = { lat, lng };
        document.getElementById('inp-origen').value = nombre;
        document.getElementById('cl-origen').style.display = 'block';
        ponerPin('origen', lat, lng);
        if (!silencioso) toast('Ubicación detectada 📍', 'ok');
      });
    } else {
      if (!silencioso) toast('Centrado en tu ubicación', 'ok');
    }
  }, () => { if (!silencioso) toast('No se pudo obtener GPS', 'err'); },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}

function activarPin(tipo) {
  pinMode = tipo;
  document.getElementById('btn-po').className = 'map-btn' + (tipo === 'origen' ? ' m-active' : '');
  document.getElementById('btn-pd').className = 'map-btn' + (tipo === 'destino' ? ' m-dest' : '');
  map.getContainer().style.cursor = 'crosshair';
  toast(tipo === 'origen' ? '📍 Toca el mapa para el origen' : '🎯 Toca el mapa para el destino');
}

function desactivarPin() {
  pinMode = null;
  document.getElementById('btn-po').className = 'map-btn';
  document.getElementById('btn-pd').className = 'map-btn';
  if (map) map.getContainer().style.cursor = '';
}

// ── GEOCODIFICACIÓN ───────────────────────────────
function geocReverso(lat, lng, cb) {
  fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
    .then(r => r.json())
    .then(d => cb(d.display_name?.split(',').slice(0, 3).join(', ') || `${lat.toFixed(5)},${lng.toFixed(5)}`))
    .catch(() => cb(`${lat.toFixed(5)},${lng.toFixed(5)}`));
}

function geocSearch(q, cb) {
  fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6`)
    .then(r => r.json()).then(cb).catch(() => cb([]));
}

// ── AUTOCOMPLETE ──────────────────────────────────
function buscar(campo, val) {
  document.getElementById('cl-' + campo).style.display = val ? 'block' : 'none';
  if (val.length < 3) { cerrarDD(campo); return; }
  clearTimeout(ddTimers[campo]);
  const dd = document.getElementById('dd-' + campo);
  dd.style.display = 'block';
  dd.innerHTML = '<div class="dd-info"><div class="spinner"></div> Buscando...</div>';
  ddTimers[campo] = setTimeout(() => {
    geocSearch(val, results => {
      ddRes[campo] = results;
      if (!results.length) { dd.innerHTML = '<div class="dd-info">Sin resultados</div>'; return; }
      dd.innerHTML = results.map((r, i) => `
        <div class="dd-item" onmousedown="elegir('${campo}',${i})">
          <span style="font-size:.9rem;flex-shrink:0;">${icoLugar(r)}</span>
          <div>
            <div class="dd-main">${(r.name || r.display_name.split(',')[0]).slice(0, 50)}</div>
            <div class="dd-sub">${r.display_name.split(',').slice(1, 4).join(', ')}</div>
          </div>
        </div>`).join('');
    });
  }, 450);
}

function icoLugar(r) {
  if (r.type === 'restaurant' || r.type === 'fast_food') return '🍽️';
  if (r.type === 'hospital') return '🏥';
  if (r.type === 'school' || r.type === 'university') return '🏫';
  if (r.class === 'highway') return '🛣️';
  return '📌';
}

function cerrarDD(campo) { setTimeout(() => { document.getElementById('dd-' + campo).style.display = 'none'; }, 150); }

function elegir(campo, idx) {
  const r    = ddRes[campo][idx];
  const nombre = r.display_name.split(',').slice(0, 3).join(', ');
  const lat  = parseFloat(r.lat), lng = parseFloat(r.lon);
  document.getElementById('inp-' + campo).value = nombre;
  document.getElementById('cl-'  + campo).style.display = 'block';
  document.getElementById('dd-'  + campo).style.display = 'none';
  if (campo === 'origen') { coordO = { lat, lng }; ponerPin('origen', lat, lng); }
  else                    { coordD = { lat, lng }; ponerPin('destino', lat, lng); }
  if (map) map.setView([lat, lng], 15);
  if (coordO && coordD) trazarRuta();
}

function limpiar(campo) {
  document.getElementById('inp-' + campo).value = '';
  document.getElementById('cl-'  + campo).style.display = 'none';
  document.getElementById('dd-'  + campo).style.display = 'none';
  if (campo === 'origen') { coordO = null; if (markerO) { map && map.removeLayer(markerO); markerO = null; } }
  else                    { coordD = null; if (markerD) { map && map.removeLayer(markerD); markerD = null; } }
  if (routeLine) { map && map.removeLayer(routeLine); routeLine = null; }
  document.getElementById('route-info').classList.remove('on');
}

// ── ICONOS CHOFERES EN MAPA ───────────────────────
async function actualizarIconosChoferes(rides) {
  if (!map) return;
  const users    = await DB.users();
  const choferes = users.filter(u => u.rol === 'chofer' && u.estatus === 'activo' && u.lastLat);
  choferes.forEach(chofer => {
    const tieneViaje = rides.some(r => r.chofId === chofer.id && r.est === 'aceptado');
    const lat = chofer.lastLat, lng = chofer.lastLng;
    if (marcadoresChoferes[chofer.id]) {
      marcadoresChoferes[chofer.id].setLatLng([lat, lng]);
      marcadoresChoferes[chofer.id].setIcon(iconoVehiculo(tieneViaje));
    } else {
      const m = L.marker([lat, lng], { icon: iconoVehiculo(tieneViaje), zIndexOffset: 100 }).addTo(map);
      m.bindTooltip(`🚗 ${chofer.nom} ${chofer.ape || ''}<br>${chofer.veh || ''} | ${chofer.pla || ''}`, { permanent: false, direction: 'top' });
      marcadoresChoferes[chofer.id] = m;
    }
  });
}
