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

  // Limpiar capas previas excepto el tile layer
  mapEncurso.eachLayer(layer => {
    if (!(layer instanceof L.TileLayer)) mapEncurso.removeLayer(layer);
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

  // Trazar ruta entre origen y destino
  if (ride.coordO && ride.coordD) {
    const url = `https://router.project-osrm.org/route/v1/driving/${ride.coordO.lng},${ride.coordO.lat};${ride.coordD.lng},${ride.coordD.lat}?overview=full&geometries=geojson`;
    fetch(url).then(r => r.json()).then(data => {
      if (data.routes?.length) {
        const pts = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        L.polyline(pts, { color: '#f5c518', weight: 5, opacity: .9 }).addTo(mapEncurso);
        mapEncurso.fitBounds(L.polyline(pts).getBounds(), { padding: [40, 40] });
      } else if (bounds.length === 2) {
        mapEncurso.fitBounds(bounds, { padding: [40, 40] });
      }
    }).catch(() => {
      if (bounds.length === 2) mapEncurso.fitBounds(bounds, { padding: [40, 40] });
    });
  }
}

// ── MOSTRAR / OCULTAR PESTAÑA EN CURSO ────────────
function mostrarPestanaEncurso(ride) {
  const btn  = document.getElementById('tab-encurso-btn');
  const wrap = document.getElementById('encurso-wrap');
  const empty = document.getElementById('encurso-empty');
  const info  = document.getElementById('encurso-info');

  if (!ride) {
    // Sin viaje activo — ocultar pestaña
    if (btn) btn.style.display = 'none';
    if (wrap)  wrap.style.display  = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }

  // Mostrar pestaña
  if (btn) btn.style.display = 'block';

  // Info del viaje
  if (info) {
    info.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.8rem;">
        <span class="sec-label" style="margin:0;">Viaje en curso</span>
        <span class="status-pill s-aceptado">Aceptado</span>
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

  // Botones
  const btnCancelar   = document.getElementById('btn-cancelar-encurso');
  const btnCompletar  = document.getElementById('btn-completar-encurso');
  if (btnCancelar)  btnCancelar.onclick  = () => mostrarModalCancelacion(ride.id, 'chofer');
  if (btnCompletar) btnCompletar.onclick = () => completarViaje(ride.id);

  if (wrap)  wrap.style.display  = 'block';
  if (empty) empty.style.display = 'none';

  // Iniciar mapa si la pestaña está activa
  const tabEncurso = document.getElementById('t-encurso');
  if (tabEncurso && tabEncurso.classList.contains('active')) {
    setTimeout(() => initMapaEncurso(ride), 200);
  }
}
