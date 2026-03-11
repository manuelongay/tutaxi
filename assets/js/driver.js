/* ============================================================
   tuTaxi — driver.js
   Disponibilidad, tracking GPS y mapa "En curso"
   ============================================================ */

let driverOn        = false;
let mapEncurso      = null;
let mapSolicitudes  = null;   // mini-mapa en pestaña Solicitudes
let markerYo        = null;   // marcador azul "tú" en mini-mapa
let marcadoresMini  = {};     // otros conductores en mini-mapa

// ── DISPONIBILIDAD ────────────────────────────────
function toggleChofer() {
  driverOn = document.getElementById('driver-sw').checked;
  document.getElementById('driver-sub').textContent = driverOn ? 'Estás disponible' : 'Desconectado';
  if (driverOn) {
    toast('¡En línea! 🚗', 'ok');
    iniciarTracking();
    DB.rides().then(rides => renderSolicitudes(rides));
  } else {
    document.getElementById('solicitudes-list').innerHTML =
      '<div class="empty"><div class="empty-icon">📡</div><div class="empty-title">Activa tu disponibilidad</div></div>';
  }
}

// ── MINI-MAPA SOLICITUDES ────────────────────────
function initMapaSolicitudes() {
  // Destruir instancia previa si existe (evita conflictos de re-init)
  if (mapSolicitudes) {
    mapSolicitudes.remove();
    mapSolicitudes = null;
    markerYo = null;
    marcadoresMini = {};
  }

  const el = document.getElementById('map-solicitudes');
  if (!el) return;

  // Crear mapa directamente — el contenedor ya es visible cuando el conductor inicia
  mapSolicitudes = L.map('map-solicitudes', {
    zoom: 14,
    zoomControl: false,
    dragging: true,
    tap: false
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19
  }).addTo(mapSolicitudes);

  // Posicionar en ubicación del conductor
  const posicionar = (lat, lng) => {
    mapSolicitudes.setView([lat, lng], 14);
    actualizarMarcadorYo(lat, lng);
    // Forzar re-render de tiles tras posicionar
    setTimeout(() => mapSolicitudes && mapSolicitudes.invalidateSize(), 200);
  };

  if (me && me.lastLat) {
    posicionar(me.lastLat, me.lastLng);
  } else if (navigator.geolocation) {
    // Vista inicial en Campeche mientras llega el GPS real
    mapSolicitudes.setView([19.8301, -90.5349], 13);
    navigator.geolocation.getCurrentPosition(
      pos => posicionar(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  } else {
    mapSolicitudes.setView([19.8301, -90.5349], 13);
  }
}

function actualizarMarcadorYo(lat, lng) {
  if (!mapSolicitudes) return;

  const icono = L.divIcon({
    html: `<div style="position:relative;filter:drop-shadow(0 2px 8px rgba(59,130,246,.7));">
      <svg viewBox="0 0 64 64" width="38" height="38" xmlns="http://www.w3.org/2000/svg">
        <rect x="8" y="28" width="48" height="20" rx="6" fill="#3b82f6"/>
        <path d="M18 28 L22 14 L42 14 L46 28 Z" fill="#3b82f6" opacity=".85"/>
        <path d="M23 27 L26 16 L38 16 L41 27 Z" fill="#cceeff" opacity=".7"/>
        <circle cx="18" cy="48" r="7" fill="#222"/><circle cx="18" cy="48" r="3.5" fill="#888"/>
        <circle cx="46" cy="48" r="7" fill="#222"/><circle cx="46" cy="48" r="3.5" fill="#888"/>
        <rect x="8" y="32" width="5" height="4" rx="1" fill="#fff9"/>
        <rect x="51" y="32" width="5" height="4" rx="1" fill="#ff09"/>
      </svg>
      <div style="position:absolute;top:-4px;right:-4px;width:12px;height:12px;border-radius:50%;background:#3b82f6;border:2px solid #000;animation:pulse-dot 1.5s infinite;"></div>
    </div>`,
    className: '', iconSize: [38, 38], iconAnchor: [19, 38]
  });

  if (markerYo) {
    markerYo.setLatLng([lat, lng]);
    markerYo.setIcon(icono);
  } else {
    markerYo = L.marker([lat, lng], { icon: icono, zIndexOffset: 500 })
      .bindTooltip('📍 Tú', { permanent: false, direction: 'top' })
      .addTo(mapSolicitudes);
  }
  mapSolicitudes.setView([lat, lng], mapSolicitudes.getZoom());
}

function actualizarOtrosChoferesMini(users, rides) {
  if (!mapSolicitudes) return;
  const choferes = users.filter(u =>
    u.rol === 'chofer' && u.estatus === 'activo' && u.lastLat && u.id !== (me && me.id)
  );

  // Limpiar marcadores que ya no existen
  Object.keys(marcadoresMini).forEach(id => {
    if (!choferes.find(c => c.id === id)) {
      mapSolicitudes.removeLayer(marcadoresMini[id]);
      delete marcadoresMini[id];
    }
  });

  choferes.forEach(c => {
    const ocupado = rides.some(r => r.chofId === c.id && ['en_camino','en_curso'].includes(r.est));
    const color   = ocupado ? '#ef4444' : '#9ca3af';
    const icono   = L.divIcon({
      html: `<div style="filter:drop-shadow(0 1px 4px rgba(0,0,0,.5));">
        <svg viewBox="0 0 64 64" width="28" height="28" xmlns="http://www.w3.org/2000/svg">
          <rect x="8" y="28" width="48" height="20" rx="6" fill="${color}"/>
          <path d="M18 28 L22 14 L42 14 L46 28 Z" fill="${color}" opacity=".85"/>
          <path d="M23 27 L26 16 L38 16 L41 27 Z" fill="#cceeff" opacity=".6"/>
          <circle cx="18" cy="48" r="7" fill="#222"/><circle cx="18" cy="48" r="3.5" fill="#888"/>
          <circle cx="46" cy="48" r="7" fill="#222"/><circle cx="46" cy="48" r="3.5" fill="#888"/>
        </svg>
      </div>`,
      className: '', iconSize: [28, 28], iconAnchor: [14, 28]
    });

    if (marcadoresMini[c.id]) {
      marcadoresMini[c.id].setLatLng([c.lastLat, c.lastLng]);
      marcadoresMini[c.id].setIcon(icono);
    } else {
      marcadoresMini[c.id] = L.marker([c.lastLat, c.lastLng], { icon: icono })
        .bindTooltip(`${c.nom} ${c.ape||''} · ${ocupado ? 'Ocupado' : 'Libre'}`, { direction: 'top' })
        .addTo(mapSolicitudes);
    }
  });
}

// ── TRACKING GPS ──────────────────────────────────
function iniciarTracking() {
  if (!navigator.geolocation) return;
  setInterval(() => {
    if (!me || me.rol !== 'chofer' || !driverOn) return;
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      DB.updateUser(me.id, {
        lastLat:    lat,
        lastLng:    lng,
        lastUpdate: Date.now()
      });
      // Actualizar posición en mapa En curso si está activo
      actualizarPosicionChoferEncurso(lat, lng);
      // Actualizar marcador propio en mini-mapa solicitudes
      actualizarMarcadorYo(lat, lng);
    }, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 });
  }, 5000);
}

// ── MAPA EN CURSO ─────────────────────────────────
function initMapaEncurso(ride) {
  // Si el mapa ya existe solo actualizamos
  if (mapEncurso !== null) {
    mapEncurso.invalidateSize();
    actualizarMapaEncurso(ride);
    return;
  }

  mapEncurso = L.map('map-encurso', { zoom: 14, zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>', maxZoom: 19
  }).addTo(mapEncurso);

  actualizarMapaEncurso(ride);
}

function actualizarMapaEncurso(ride) {
  if (!mapEncurso || !ride) return;

  // Limpiar capas previas excepto tile layer y marcador del conductor
  mapEncurso.eachLayer(layer => {
    if (layer instanceof L.TileLayer) return;
    if (layer === markerChoferEncurso) return; // no borrar posición del conductor
    mapEncurso.removeLayer(layer);
  });

  const iconOrigen = L.divIcon({
    html: `<div style="background:#f5c518;width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #000;box-shadow:0 3px 10px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);font-size:15px;">👤</span></div>`,
    className: '', iconSize: [36, 36], iconAnchor: [18, 36]
  });

  const iconDestino = L.divIcon({
    html: `<div style="background:#ff6b35;width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #000;box-shadow:0 3px 10px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);font-size:15px;">🎯</span></div>`,
    className: '', iconSize: [36, 36], iconAnchor: [18, 36]
  });

  const bounds = [];

  // Marcador origen (pasajero)
  if (ride.coordO) {
    L.marker([ride.coordO.lat, ride.coordO.lng], { icon: iconOrigen })
      .bindTooltip('👤 ' + ride.pasNom, { permanent: false })
      .addTo(mapEncurso);
    bounds.push([ride.coordO.lat, ride.coordO.lng]);
  }

  // Marcador destino
  if (ride.coordD) {
    L.marker([ride.coordD.lat, ride.coordD.lng], { icon: iconDestino })
      .bindTooltip('🎯 Destino', { permanent: false })
      .addTo(mapEncurso);
    bounds.push([ride.coordD.lat, ride.coordD.lng]);
  }

  // Trazar ruta dinámica: conductor → destino según estado
  trazarRutaEncurso(ride);
}

let routeEncurso = null; // ruta activa en el mapa En curso

async function trazarRutaEncurso(ride) {
  if (!mapEncurso || !ride) return;

  // Limpiar ruta previa
  if (routeEncurso) { mapEncurso.removeLayer(routeEncurso); routeEncurso = null; }

  // Determinar origen de la ruta: posición actual del conductor si disponible, si no: coordO
  let fromLat, fromLng;
  if (markerChoferEncurso) {
    const pos = markerChoferEncurso.getLatLng();
    fromLat = pos.lat; fromLng = pos.lng;
  } else if (me && me.lastLat) {
    fromLat = me.lastLat; fromLng = me.lastLng;
  }

  // Destino según estado del viaje
  const destCoord = ride.est === 'en_curso' ? ride.coordD : ride.coordO;
  const color     = ride.est === 'en_curso' ? '#22c55e' : '#9ca3af';
  const dash      = ride.est === 'en_camino' ? '8 5' : null;

  if (!destCoord) return;

  const bounds = [];
  if (fromLat) bounds.push([fromLat, fromLng]);
  if (destCoord) bounds.push([destCoord.lat, destCoord.lng]);

  // Trazar ruta OSRM
  if (fromLat && destCoord) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${destCoord.lng},${destCoord.lat}?overview=full&geometries=geojson`;
      const data = await (await fetch(url, { signal: AbortSignal.timeout(6000) })).json();
      if (data.routes?.length) {
        const pts = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        routeEncurso = L.polyline(pts, { color, weight: 5, opacity: .9, dashArray: dash }).addTo(mapEncurso);
        mapEncurso.fitBounds(routeEncurso.getBounds(), { padding: [50, 50] });
        return;
      }
    } catch(e) {}
  }

  // Fallback: línea recta o fitBounds de los puntos conocidos
  if (bounds.length === 2) {
    routeEncurso = L.polyline(bounds, { color, weight: 4, opacity: .7, dashArray: '8 6' }).addTo(mapEncurso);
    mapEncurso.fitBounds(bounds, { padding: [50, 50] });
  } else if (bounds.length === 1) {
    mapEncurso.setView(bounds[0], 15);
  }
}

// ── MOSTRAR / OCULTAR PESTAÑA EN CURSO ────────────
function mostrarPestanaEncurso(ride) {
  if (!me || me.rol !== 'chofer') return;
  const btn  = document.getElementById('tab-encurso-btn');
  const wrap = document.getElementById('encurso-wrap');
  const empty = document.getElementById('encurso-empty');
  const info  = document.getElementById('encurso-info');

  // Pestaña siempre visible para el chofer
  if (btn) btn.style.display = 'block';

  if (!ride) {
    if (wrap)  wrap.style.display  = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }

  // Info del viaje
  if (info) {
    const estadoLabels = {
      en_camino: '<span class="status-pill" style="background:rgba(99,179,237,.15);color:#63b3ed;">En camino 🚗</span>',
      en_curso:  '<span class="status-pill" style="background:rgba(0,200,100,.15);color:#00c864;">En curso 🛣️</span>',
    };
    const estadoPill = estadoLabels[ride.est] || '<span class="status-pill s-aceptado">Aceptado</span>';

    info.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.8rem;">
        <span class="sec-label" style="margin:0;">Viaje en curso</span>
        ${estadoPill}
      </div>
      <div class="avail-user" style="margin-bottom:.8rem;">
        <div class="avatar">${ride.pasNom[0]}</div>
        <div>
          <div style="font-weight:700;">${ride.pasNom}</div>
          <div style="font-size:.78rem;color:var(--gray3);">${ride.pasTel}</div>
        </div>
        <div style="margin-left:auto;"><div class="price-val">$${ride.precio}</div></div>
      </div>
      <div class="from-lbl">📍 ${ride.origen}</div>
      <div class="to-lbl" style="margin-top:.25rem;">🎯 ${ride.destino}</div>`;
  }

  // Botones según estado
  const btnIniciar   = document.getElementById('btn-iniciar-encurso');
  const btnCancelar  = document.getElementById('btn-cancelar-encurso');
  const btnCompletar = document.getElementById('btn-completar-encurso');

  if (btnCancelar)  btnCancelar.onclick = () => mostrarModalCancelacion(ride.id, 'chofer');

  if (ride.est === 'en_camino') {
    // Mostrar "Iniciar viaje", ocultar "Completar"
    if (btnIniciar) {
      btnIniciar.style.display = 'block';
      btnIniciar.onclick = async () => {
        await DB.updateRide(ride.id, { est: 'en_curso', tsInicio: Date.now() });
        const rides = await DB.rides();
        const r = rides.find(x => x.id === ride.id);
        if (r) await DB.saveNotif({ id: 'n_' + Date.now(), pasId: r.pasId,
          msg: '🚦 El conductor inició el viaje. ¡Buen viaje!',
          leida: false, fecha: new Date().toISOString() });
        toast('¡Viaje iniciado! 🛣️', 'ok');
      };
    }
    if (btnCompletar) btnCompletar.style.display = 'none';
  } else if (ride.est === 'en_curso') {
    // Ocultar "Iniciar viaje", mostrar "Completar"
    if (btnIniciar)   btnIniciar.style.display   = 'none';
    if (btnCompletar) {
      btnCompletar.style.display = 'block';
      btnCompletar.onclick = () => completarViaje(ride.id);
    }
  }

  if (wrap)  wrap.style.display  = 'block';
  if (empty) empty.style.display = 'none';

  // Iniciar mapa si la pestaña está activa
  const tabEncurso = document.getElementById('t-encurso');
  if (tabEncurso && tabEncurso.classList.contains('active')) {
    setTimeout(() => initMapaEncurso(ride), 200);
  } else {
    setTimeout(() => initMapaEncurso(ride), 300);
  }

  // Iniciar listener de chat en background (para badge de no leídos)
  if (typeof escucharChatBackground === 'function') {
    escucharChatBackground(ride.id);
  }
}
