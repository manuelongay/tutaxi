/* ============================================================
   tuTaxi — map.js
   Mapa Leaflet, geocodificación, rutas y autocomplete
   ============================================================ */

let map = null, markerO = null, markerD = null, routeLine = null;
let coordO = null, coordD = null, pinMode = null;
let ddTimers = {}, ddRes = { origen: [], destino: [] };
let marcadoresChoferes = {};
let tarifasCache = { porKm: 9, minima: 30, kmIncluidos: 3, nocturna: 1.3, horaInicio: 22, horaFin: 6, espera: 1, radioKm: 3 };

// Cargar tarifas desde Firebase al iniciar
function cargarTarifas() {
  DB.onTarifas(t => { tarifasCache = t; });
}

function calcularPrecio(km, minutos) {
  const hora    = new Date().getHours();
  const noche   = hora >= tarifasCache.horaInicio || hora < tarifasCache.horaFin;
  const mult    = noche ? tarifasCache.nocturna : 1;
  const kmExtra = Math.max(0, parseFloat(km) - (tarifasCache.kmIncluidos || 0));
  const espera  = tarifasCache.esperaActiva ? (minutos || 0) * tarifasCache.espera : 0;
  const diurno  = Math.max(tarifasCache.minima, tarifasCache.minima + kmExtra * tarifasCache.porKm + espera);
  const precio  = diurno * mult;
  return Math.round(precio / 5) * 5;
}

// ── INICIALIZACIÓN ────────────────────────────────
function initMapa() {
  if (map !== null) { map.invalidateSize(); return; }
  map = L.map('map', { zoom: 14, zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>', maxZoom: 19
  }).addTo(map);

  // Detectar cuando el usuario mueve o hace zoom manualmente
  map.on('zoomstart movestart', function(e) {
    // Solo marcar si el movimiento viene del usuario (no de fitBounds/setView programático)
    if (e.originalEvent) map._userMovedMap = true;
  });

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
  if (!coordO || !coordD || !map) return;
  if (routeLine) { map.removeLayer(routeLine); routeLine = null; }

  // Intentar OSRM primero, luego OSRM demo, finalmente línea recta
  const osrm1 = `https://router.project-osrm.org/route/v1/driving/${coordO.lng},${coordO.lat};${coordD.lng},${coordD.lat}?overview=full&geometries=geojson`;
  const osrm2 = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coordO.lng},${coordO.lat};${coordD.lng},${coordD.lat}?overview=full&geometries=geojson`;

  const intentarRuta = (url) => fetch(url, { signal: AbortSignal.timeout(6000) })
    .then(r => r.json())
    .then(data => {
      if (!data.routes?.length) throw new Error('sin ruta');
      return data;
    });

  intentarRuta(osrm1)
    .catch(() => intentarRuta(osrm2))
    .then(data => {
      if (!map) return;
      const r   = data.routes[0];
      const pts = r.geometry.coordinates.map(c => [c[1], c[0]]);
      routeLine = L.polyline(pts, { color: '#f5c518', weight: 5, opacity: .9 }).addTo(map);
      map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
      const km  = (r.distance / 1000).toFixed(1);
      const min = Math.round(r.duration / 60);
      const sug = calcularPrecio(km, min);
      document.getElementById('ri-dist').textContent = km + ' km';
      document.getElementById('ri-time').textContent = min + ' min';
      document.getElementById('ri-sug').textContent  = '$' + sug;
      document.getElementById('route-info').classList.add('on');
      pickPrice(sug);
    })
    .catch(() => rutaLinea());
}

function rutaLinea() {
  if (!map || !coordO || !coordD) return;
  if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  routeLine = L.polyline([[coordO.lat, coordO.lng], [coordD.lat, coordD.lng]], { color: '#f5c518', weight: 4, dashArray: '8 6' }).addTo(map);
  map.fitBounds([[coordO.lat, coordO.lng], [coordD.lat, coordD.lng]], { padding: [50, 50] });
  const d   = map.distance([coordO.lat, coordO.lng], [coordD.lat, coordD.lng]);
  const km  = (d / 1000).toFixed(1);
  document.getElementById('ri-dist').textContent = km + ' km';
  document.getElementById('ri-time').textContent = Math.round(d / 300) + ' min';
  document.getElementById('ri-sug').textContent  = '$' + calcularPrecio(km, 0);
  document.getElementById('route-info').classList.add('on');
}

// ── GPS ───────────────────────────────────────────
let _trackingPropio = null; // watchPosition para pasajero

function miUbicacion(silencioso = false) {
  if (!map) { if (!silencioso) toast('Mapa no listo', 'err'); return; }
  if (!navigator.geolocation) { if (!silencioso) toast('GPS no disponible', 'err'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: lat, longitude: lng } = pos.coords;
    map._userMovedMap = false; // el usuario pidió centrar → resetear flag
    map.setView([lat, lng], 15);
    // Guardar posición en Firebase para todos los roles
    if (me) DB.updateUser(me.id, { lastLat: lat, lastLng: lng, lastUpdate: Date.now() });
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

// Tracking continuo para pasajero (actualiza lastLat cada 5s)
function iniciarTrackingPasajero() {
  if (!navigator.geolocation || !me || me.rol === 'chofer') return;
  if (_trackingPropio) return; // ya activo
  _trackingPropio = setInterval(() => {
    navigator.geolocation.getCurrentPosition(pos => {
      if (!me) return;
      DB.updateUser(me.id, {
        lastLat: pos.coords.latitude,
        lastLng: pos.coords.longitude,
        lastUpdate: Date.now()
      });
      // Actualizar pin propio solo si NO hay viaje activo
      // (cuando hay viaje, markerO representa el origen del viaje, no la posición actual)
      if (markerO && map && !window._rideActivo) {
        markerO.setLatLng([pos.coords.latitude, pos.coords.longitude]);
      }
    }, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 });
  }, 5000);
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

// Limpia rutas del mapa después de un viaje (pasajero)
// Los pins origen/destino se conservan — son la ubicación del pasajero
function limpiarMapaViaje() {
  // Limpiar ruta trazada y marcadores de origen/destino
  if (routeLine) { map && map.removeLayer(routeLine); routeLine = null; }
  if (markerO)   { map && map.removeLayer(markerO);   markerO   = null; }
  if (markerD)   { map && map.removeLayer(markerD);   markerD   = null; }
  // Limpiar coordenadas en memoria
  coordO = null; coordD = null;
  // Limpiar campos de texto
  ['origen','destino'].forEach(c => {
    const inp = document.getElementById('inp-' + c);
    const cl  = document.getElementById('cl-'  + c);
    const dd  = document.getElementById('dd-'  + c);
    if (inp) inp.value = '';
    if (cl)  cl.style.display  = 'none';
    if (dd)  dd.style.display  = 'none';
  });
  // Ocultar barra de info de ruta
  const ri = document.getElementById('route-info');
  if (ri) ri.classList.remove('on');
}

// ── ICONOS CHOFERES EN MAPA ───────────────────────
async function actualizarIconosChoferes(rides) {
  if (!map) return;
  const users    = await DB.users();
  const choferes = users.filter(u => u.rol === 'chofer' && u.estatus === 'activo' && u.lastLat);
  choferes.forEach(chofer => {
    const tieneViaje = rides.some(r => r.chofId === chofer.id && ['en_camino','en_curso'].includes(r.est));
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

// ── TRACKING EN TIEMPO REAL DE CHOFERES ──────────
// Escucha cambios en users para actualizar posiciones en el mapa del pasajero
// ── DISTANCIA HAVERSINE (km entre dos coordenadas) ──
function distanciaKm(lat1, lng1, lat2, lng2) {
  const R  = 6371;
  const dL = (lat2 - lat1) * Math.PI / 180;
  const dG = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(dL/2) * Math.sin(dL/2) +
             Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
             Math.sin(dG/2) * Math.sin(dG/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function iniciarTrackingMapa() {
  // Cache de rides en tiempo real para usarlo en el listener de users
  let ridesCache = [];
  DB.onRides(rides => {
    ridesCache = rides;
    // Cuando cambia el estado de un viaje, actualizar iconos inmediatamente
    if (!map) return;
    Object.keys(marcadoresChoferes).forEach(chofId => {
      const tieneViaje = ridesCache.some(r => r.chofId === chofId && ['en_camino','en_curso'].includes(r.est));
      marcadoresChoferes[chofId].setIcon(iconoVehiculo(tieneViaje));
    });
  });

  DB.onUsers(async users => {
    if (!map) return;
    const radioKm = tarifasCache.radioKm || 3;
    const centro  = map.getCenter();

    const choferes = users.filter(u => {
      if (u.rol !== 'chofer' || u.estatus !== 'activo' || !u.lastLat) return false;
      return distanciaKm(centro.lat, centro.lng, u.lastLat, u.lastLng) <= radioKm;
    });

    // Eliminar marcadores fuera de radio
    Object.keys(marcadoresChoferes).forEach(id => {
      if (!choferes.find(c => c.id === id)) {
        map.removeLayer(marcadoresChoferes[id]);
        delete marcadoresChoferes[id];
      }
    });

    choferes.forEach(chofer => {
      const tieneViaje = ridesCache.some(r => r.chofId === chofer.id && ['en_camino','en_curso'].includes(r.est));
      const lat  = chofer.lastLat, lng = chofer.lastLng;
      const dist = distanciaKm(centro.lat, centro.lng, lat, lng).toFixed(1);

      if (marcadoresChoferes[chofer.id]) {
        marcadoresChoferes[chofer.id].setLatLng([lat, lng]);
        marcadoresChoferes[chofer.id].setIcon(iconoVehiculo(tieneViaje));
      } else {
        const m = L.marker([lat, lng], { icon: iconoVehiculo(tieneViaje), zIndexOffset: 100 }).addTo(map);
        m.bindTooltip(
          `🚗 ${chofer.nom} ${chofer.ape||''}<br>${chofer.veh||''} | ${chofer.pla||''}<br>📍 ${dist} km`,
          { permanent: false, direction: 'top' }
        );
        marcadoresChoferes[chofer.id] = m;
      }
    });
  });
}

// ── ACTUALIZAR ICONO DEL PROPIO CONDUCTOR ─────────
// Llamar cuando el conductor cambia de estado para que su icono se actualice
function actualizarIconoPropio(rides) {
  if (!me || me.rol !== 'chofer') return;
  const tieneViaje = rides.some(r => r.chofId === me.id && ['en_camino','en_curso'].includes(r.est));
  if (marcadoresChoferes[me.id]) {
    marcadoresChoferes[me.id].setIcon(iconoVehiculo(tieneViaje));
  }
}

// ── MARCADOR DEL CONDUCTOR EN MAPA EN CURSO ───────
let markerChoferEncurso = null;

function actualizarPosicionChoferEncurso(lat, lng) {
  if (!mapEncurso) return;
  const iconoChofer = L.divIcon({
    html: `<div style="position:relative;filter:drop-shadow(0 2px 8px rgba(34,197,94,.6));">
      <svg viewBox="0 0 64 64" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
        <rect x="8" y="28" width="48" height="20" rx="6" fill="#22c55e"/>
        <path d="M18 28 L22 14 L42 14 L46 28 Z" fill="#22c55e" opacity=".85"/>
        <path d="M23 27 L26 16 L38 16 L41 27 Z" fill="#cceeff" opacity=".7"/>
        <circle cx="18" cy="48" r="7" fill="#222"/><circle cx="18" cy="48" r="3.5" fill="#888"/>
        <circle cx="46" cy="48" r="7" fill="#222"/><circle cx="46" cy="48" r="3.5" fill="#888"/>
        <rect x="8" y="32" width="5" height="4" rx="1" fill="#fff9"/>
        <rect x="51" y="32" width="5" height="4" rx="1" fill="#ff09"/>
      </svg>
      <div style="position:absolute;top:-4px;right:-4px;width:12px;height:12px;border-radius:50%;background:#22c55e;border:2px solid #000;box-shadow:0 0 6px #22c55e;"></div>
    </div>`,
    className: '', iconSize: [40, 40], iconAnchor: [20, 40],
  });

  if (markerChoferEncurso) {
    markerChoferEncurso.setLatLng([lat, lng]);
  } else {
    markerChoferEncurso = L.marker([lat, lng], { icon: iconoChofer, zIndexOffset: 200 })
      .bindTooltip('📍 Tu posición', { permanent: false, direction: 'top' })
      .addTo(mapEncurso);
  }
}

// ── TRACKING CONDUCTOR ASIGNADO (usa mapa principal) ──
let trackingRideId       = null;
let trackingPasStop      = null;
let markerChoferAsignado = null;
let routeChoferAsignado  = null;  // ruta dinámica verde (tramo pendiente)
let routeOriginalViaje   = null;  // ruta original amarilla semitransparente
let _lastRecalcPos       = null;  // última posición donde se recalculó la ruta
let _lastRecalcTs        = 0;     // timestamp del último recálculo
const RECALC_MIN_DIST_KM = 0.05; // recalcular si conductor se movió >50m
const RECALC_MIN_MS      = 20000; // o cada 20s mínimo

// Icono del conductor asignado: gris=en_camino, verde=en_curso
function iconoChoferAsignado(estado) {
  const color  = estado === 'en_curso' ? '#22c55e' : '#9ca3af';
  const sombra = estado === 'en_curso' ? 'rgba(34,197,94,.5)' : 'rgba(100,100,100,.4)';
  return L.divIcon({
    html: `<div style="position:relative;width:40px;height:40px;filter:drop-shadow(0 2px 8px ${sombra});">
      <svg viewBox="0 0 64 64" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
        <rect x="8" y="28" width="48" height="20" rx="6" fill="${color}"/>
        <path d="M18 28 L22 14 L42 14 L46 28 Z" fill="${color}" opacity=".85"/>
        <path d="M23 27 L26 16 L38 16 L41 27 Z" fill="#cceeff" opacity=".7"/>
        <circle cx="18" cy="48" r="7" fill="#222"/><circle cx="18" cy="48" r="3.5" fill="#888"/>
        <circle cx="46" cy="48" r="7" fill="#222"/><circle cx="46" cy="48" r="3.5" fill="#888"/>
        <rect x="8" y="32" width="5" height="4" rx="1" fill="#fff9"/>
        <rect x="51" y="32" width="5" height="4" rx="1" fill="#ff09"/>
      </svg>
      <div style="position:absolute;top:-4px;right:-4px;width:13px;height:13px;border-radius:50%;background:${color};border:2px solid #000;animation:pulse-dot 1.5s infinite;"></div>
    </div>`,
    className: '', iconSize: [40, 40], iconAnchor: [20, 40],
  });
}

function iniciarTrackingChoferAsignado(ride) {
  if (!ride || !ride.chofId || !map) return;

  // No reiniciar si ya estamos trackeando el mismo viaje
  if (trackingRideId === ride.id && trackingPasStop) return;

  // Cancelar listener anterior
  if (trackingPasStop) { trackingPasStop(); trackingPasStop = null; }
  trackingRideId = ride.id;
  _lastRecalcPos = null;
  _lastRecalcTs  = 0;

  // Mostrar barra ETA
  const etaBar = document.getElementById('eta-chofer-bar');
  if (etaBar) etaBar.style.display = 'flex';

  // Trazar ruta ORIGINAL del viaje (amarilla semitransparente, referencia fija)
  _trazarRutaOriginal(ride);

  // Forzar render inmediato: obtener posición actual del conductor sin esperar GPS update
  DB.getUser(ride.chofId).then(chofer => {
    if (chofer && chofer.lastLat && map) {
      _procesarPosicionConductor(chofer, ride);
    }
  });

  trackingPasStop = DB.onUser(ride.chofId, async chofer => {
    if (!chofer || !chofer.lastLat || !map) return;
    if (me && chofer.id === me.id) return;
    await _procesarPosicionConductor(chofer, ride);
  });
}

// Procesa la posición del conductor y actualiza mapa + ETA
// Llamado tanto por el listener en tiempo real como por el fetch inicial
async function _procesarPosicionConductor(chofer, ride) {
    const lat = chofer.lastLat, lng = chofer.lastLng;
    if (!map) return;
    const etaBar = document.getElementById('eta-chofer-bar');

    // Verificar estado actual del viaje
    const rides = await DB.rides();
    const rideActual = rides.find(r => r.id === ride.id);
    if (!rideActual) return;
    const est = rideActual.est;

    // Actualizar/crear marcador del conductor asignado
    if (markerChoferAsignado) {
      markerChoferAsignado.setLatLng([lat, lng]);
      markerChoferAsignado.setIcon(iconoChoferAsignado(est));
    } else {
      markerChoferAsignado = L.marker([lat, lng], {
        icon: iconoChoferAsignado(est), zIndexOffset: 500
      }).bindTooltip(`🚗 ${chofer.nom} ${chofer.ape||''} · ${chofer.veh||''}`, {
        permanent: false, direction: 'top'
      }).addTo(map);
    }

    // Ocultar marcador genérico del chofer si existe
    if (marcadoresChoferes[ride.chofId]) {
      marcadoresChoferes[ride.chofId].setOpacity(0);
      marcadoresChoferes[ride.chofId].setZIndexOffset(-100);
    }

    // Ruta dinámica: recalcular solo si conductor se movió >50m o pasaron >20s
    const ahora      = Date.now();
    const seMovio    = !_lastRecalcPos ||
      distanciaKm(_lastRecalcPos.lat, _lastRecalcPos.lng, lat, lng) >= RECALC_MIN_DIST_KM;
    const pasoTiempo = (ahora - _lastRecalcTs) >= RECALC_MIN_MS;

    const destCoord = est === 'en_curso' ? ride.coordD : ride.coordO;

    if (destCoord && (seMovio || pasoTiempo)) {
      _lastRecalcPos = { lat, lng };
      _lastRecalcTs  = ahora;
      await _trazarRutaDinamica(lat, lng, destCoord, est);
    }

    // Ajustar vista solo si el usuario no ha interactuado manualmente con el mapa
    if (destCoord && !map._userMovedMap) {
      try { map.fitBounds([[lat, lng], [destCoord.lat, destCoord.lng]], { padding: [60, 60] }); }
      catch(e) {}
    }

    // Si acaba de iniciar en_curso, redibujar ruta original origen→destino
    if (est === 'en_curso' && !routeOriginalViaje) _trazarRutaOriginal(rideActual);

    // ETA y barra de estado
    if (!destCoord) return;
    const distKm   = distanciaKm(lat, lng, destCoord.lat, destCoord.lng);
    const etaMin   = Math.max(1, Math.round((distKm * 1000) / 300));
    const etaTxt   = document.getElementById('eta-chofer-txt');
    const etaLabel = document.getElementById('eta-chofer-label');
    const etaIcon  = document.getElementById('eta-chofer-icon');
    const llegoBadge = document.getElementById('eta-llegada-badge');

    if (est === 'en_camino') {
      if (etaLabel) etaLabel.textContent = 'Conductor en camino hacia ti';
      if (etaIcon)  etaIcon.textContent  = '🚗';
      if (distKm <= 0.1) {
        if (etaTxt)     etaTxt.textContent = '¡El conductor llegó a tu ubicación!';
        if (llegoBadge) llegoBadge.style.display = 'block';
        if (!map._llegadaNotificada) {
          map._llegadaNotificada = true;
          toast('🎉 ¡El conductor llegó! Ya puedes abordar', 'ok');
        }
      } else {
        if (etaTxt)     etaTxt.textContent = `~${etaMin} min · ${distKm < 1 ? Math.round(distKm*1000)+' m' : distKm.toFixed(1)+' km'}`;
        if (llegoBadge) llegoBadge.style.display = 'none';
        map._llegadaNotificada = false;
      }
    } else if (est === 'en_curso') {
      if (etaLabel) etaLabel.textContent = 'Viaje en curso · destino';
      if (etaIcon)  etaIcon.textContent  = '🛣️';
      if (etaBar)   etaBar.style.borderLeft = '3px solid #22c55e';
      if (etaTxt)   etaTxt.textContent   = `~${etaMin} min · ${distKm < 1 ? Math.round(distKm*1000)+' m' : distKm.toFixed(1)+' km'}`;
      if (llegoBadge) llegoBadge.style.display = 'none';
    }
}

// Ruta original del viaje: amarilla semitransparente, fija como referencia
async function _trazarRutaOriginal(ride) {
  if (!map || !ride.coordO || !ride.coordD) return;
  if (routeOriginalViaje) { map.removeLayer(routeOriginalViaje); routeOriginalViaje = null; }
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${ride.coordO.lng},${ride.coordO.lat};${ride.coordD.lng},${ride.coordD.lat}?overview=full&geometries=geojson`;
    const data = await (await fetch(url, { signal: AbortSignal.timeout(6000) })).json();
    if (data.routes?.length) {
      const pts = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
      routeOriginalViaje = L.polyline(pts, {
        color: '#f5c518', weight: 5, opacity: .3, dashArray: '6 5'
      }).addTo(map);
      routeOriginalViaje.bringToBack();
    }
  } catch(e) {}
}

// Ruta dinámica: verde desde posición actual del conductor hacia destino
async function _trazarRutaDinamica(fromLat, fromLng, destCoord, est) {
  if (!map) return;
  if (routeChoferAsignado) { map.removeLayer(routeChoferAsignado); routeChoferAsignado = null; }
  const color = est === 'en_curso' ? '#22c55e' : '#9ca3af';
  const dash  = est === 'en_camino' ? '8 5' : null;
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${destCoord.lng},${destCoord.lat}?overview=full&geometries=geojson`;
    const data = await (await fetch(url, { signal: AbortSignal.timeout(5000) })).json();
    if (data.routes?.length) {
      const pts = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
      routeChoferAsignado = L.polyline(pts, { color, weight: 5, opacity: .9, dashArray: dash }).addTo(map);
      routeChoferAsignado.bringToFront();
      if (routeOriginalViaje) routeOriginalViaje.bringToBack();
    }
  } catch(e) {}
}

function detenerTrackingChoferAsignado() {
  if (trackingPasStop)  { trackingPasStop(); trackingPasStop = null; }
  trackingRideId = null;

  // Ocultar barra ETA
  const etaBar = document.getElementById('eta-chofer-bar');
  if (etaBar) etaBar.style.display = 'none';

  // Eliminar marcador y rutas del conductor asignado del mapa principal
  if (map) {
    if (markerChoferAsignado) { map.removeLayer(markerChoferAsignado); markerChoferAsignado = null; }
    if (routeChoferAsignado)  { map.removeLayer(routeChoferAsignado);  routeChoferAsignado  = null; }
    if (routeOriginalViaje)   { map.removeLayer(routeOriginalViaje);   routeOriginalViaje   = null; }
  }
  _lastRecalcPos = null;
  _lastRecalcTs  = 0;

  // Limpiar también marcador del mapa en curso del conductor
  if (mapEncurso && markerChoferEncurso) {
    mapEncurso.removeLayer(markerChoferEncurso);
    markerChoferEncurso = null;
  }

  // Restaurar visibilidad de todos los marcadores genéricos
  if (map && marcadoresChoferes) {
    Object.values(marcadoresChoferes).forEach(m => { m.setOpacity(1); m.setZIndexOffset(100); });
  }

  map && (map._llegadaNotificada = false);

  // Restaurar pin 📍 del pasajero en su posición actual
  if (me && me.rol !== 'chofer' && map) {
    navigator.geolocation && navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (markerO) {
        markerO.setLatLng([lat, lng]);
      } else {
        const icnO = L.divIcon({
          html: `<div style="background:#f5c518;width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #000;box-shadow:0 3px 10px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);font-size:15px;">📍</span></div>`,
          className: '', iconSize: [36,36], iconAnchor: [18,36]
        });
        markerO = L.marker([lat, lng], { icon: icnO }).addTo(map);
      }
      map.setView([lat, lng], 14);
    }, () => {}, { enableHighAccuracy: true, maximumAge: 10000, timeout: 8000 });
  }
}

// Aliases para compatibilidad con calls en rides.js
function iniciarMapaPasajero(ride) { iniciarTrackingChoferAsignado(ride); }
function detenerMapaPasajero()     { detenerTrackingChoferAsignado(); }
