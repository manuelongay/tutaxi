/* ============================================================
   tuTaxi — driver.js
   Disponibilidad, tracking GPS y mapa "En curso"
   ============================================================ */

let driverOn   = false;
let mapEncurso = null;

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
