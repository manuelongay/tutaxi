/* ============================================================
   tuTaxi — rides.js
   Lógica de solicitud, aceptación y gestión de viajes
   ============================================================ */

// ── PRECIO ────────────────────────────────────────
function setPrice(v) { document.getElementById('price-show').textContent = '$' + v; }

function pickPrice(v) {
  document.getElementById('price-range').value = v;
  setPrice(v);
  document.querySelectorAll('.chip').forEach(c =>
    c.classList.toggle('on', parseInt(c.textContent.replace('$', '')) === parseInt(v))
  );
}

// ── SOLICITAR VIAJE ───────────────────────────────
async function solicitarViaje() {
  const origen  = document.getElementById('inp-origen').value.trim();
  const destino = document.getElementById('inp-destino').value.trim();
  const precio  = document.getElementById('price-range').value;
  if (!origen || !destino) { toast('Ingresa origen y destino', 'err'); return; }

  const rides = await DB.rides();
  if (rides.find(r => r.pasId === me.id && ['pendiente', 'aceptado'].includes(r.est))) {
    toast('Ya tienes un viaje activo', 'err'); return;
  }

  const ride = {
    id: 'r_' + Date.now(),
    pasId: me.id, pasNom: me.nom + ' ' + (me.ape || ''), pasTel: me.tel,
    origen, destino, coordO, coordD,
    precio: parseInt(precio),
    est: 'pendiente',
    fecha: new Date().toISOString(),
    chofId: null, chofNom: null,
  };

  await DB.saveRide(ride);
  toast('¡Viaje solicitado! Buscando chofer... 🚖', 'ok');
}

// ── RENDER VIAJE ACTIVO (PASAJERO) ────────────────
function renderViajeActivo(rides) {
  const activo = rides.find(r => r.pasId === me.id && ['pendiente', 'aceptado'].includes(r.est));
  const wrap   = document.getElementById('viaje-activo-wrap');
  const card   = document.getElementById('viaje-activo-card');

  if (activo) {
    wrap.style.display = 'block';
    card.innerHTML = `<div class="avail-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.9rem;">
        <span class="sec-label" style="margin:0;">Estado</span>
        <span class="status-pill s-${activo.est}">${sLabel(activo.est)}</span>
      </div>
      <div class="from-lbl">📍 ${activo.origen}</div>
      <div class="to-lbl" style="margin:.25rem 0 .9rem;">🎯 ${activo.destino}</div>
      <div class="price-box" style="margin-bottom:.8rem;">
        <div><div class="price-lbl">Tu oferta</div><div class="price-val">$${activo.precio}</div></div>
        ${activo.chofNom ? `<div><div class="price-lbl">Chofer</div><div style="font-weight:700;">${activo.chofNom}</div><div style="font-size:.75rem;color:var(--gray3);">${activo.veh || ''} ${activo.pla ? '| ' + activo.pla : ''}</div></div>` : ''}
      </div>
      ${activo.est === 'pendiente' ? `<button class="btn btn-danger btn-full" onclick="cancelarViaje('${activo.id}')">Cancelar solicitud</button>` : ''}
      ${activo.est === 'aceptado'  ? `<button class="btn btn-success btn-full" onclick="completarViaje('${activo.id}')">Marcar completado ✓</button>` : ''}
    </div>`;
  } else {
    const completado = rides.find(r => r.pasId === me.id && r.est === 'completado' && !r.calificacion);
    if (completado) mostrarModalCalificacion(completado);
    wrap.style.display = 'none'; card.innerHTML = '';
  }
}

async function cancelarViaje(id) {
  await DB.updateRide(id, { est: 'cancelado' });
  toast('Viaje cancelado');
}

async function completarViaje(id) {
  await DB.updateRide(id, { est: 'completado' });
  toast('¡Completado! ⭐', 'ok');
}

// ── RENDER SOLICITUDES (CHOFER) ───────────────────
function renderSolicitudes(rides) {
  if (!driverOn) return;
  const pendientes = rides.filter(r => r.est === 'pendiente');
  const el = document.getElementById('solicitudes-list');
  if (!pendientes.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">⏳</div><div class="empty-title">Sin solicitudes</div></div>';
    return;
  }
  el.innerHTML = pendientes.map(r => `<div class="avail-card">
    <div class="avail-user">
      <div class="avatar">${r.pasNom[0]}</div>
      <div><div style="font-weight:700;">${r.pasNom}</div><div style="font-size:.78rem;color:var(--gray3);">${r.pasTel}</div></div>
      <div style="margin-left:auto;"><div class="price-val">$${r.precio}</div></div>
    </div>
    <div class="from-lbl">📍 ${r.origen}</div>
    <div class="to-lbl" style="margin-top:.25rem;">🎯 ${r.destino}</div>
    <div class="avail-btns">
      <button class="btn btn-danger"  onclick="rechazarViaje('${r.id}', this)">Rechazar</button>
      <button class="btn btn-success" onclick="aceptarViaje('${r.id}')">Aceptar</button>
    </div>
  </div>`).join('');
}

async function cargarMisViajes() {
  const rides = await DB.rides();
  const mis   = rides.filter(r => r.pasId === me.id || r.chofId === me.id);
  const el    = document.getElementById('rides-list');
  if (!mis.length) { el.innerHTML = '<div class="empty"><div class="empty-icon">🛣️</div><div class="empty-title">Sin viajes aún</div></div>'; return; }
  mis.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  el.innerHTML = mis.map(r => `<div class="ride-card">
    <div class="ride-top">
      <div><div class="from-lbl">📍 ${r.origen}</div><div class="to-lbl">🎯 ${r.destino}</div></div>
      <span class="status-pill s-${r.est}">${sLabel(r.est)}</span>
    </div>
    <div class="ride-bot"><span class="ride-price">$${r.precio}</span><span class="ride-date">${new Date(r.fecha).toLocaleDateString('es-MX')}</span></div>
  </div>`).join('');
}

function rechazarViaje(id, btn) { btn.closest('.avail-card').remove(); toast('Rechazada'); }

async function aceptarViaje(id) {
  await DB.updateRide(id, {
    est: 'aceptado', chofId: me.id, chofNom: me.nom + ' ' + (me.ape || ''),
    chofTel: me.tel, veh: me.veh, pla: me.pla,
  });
  const rides = await DB.rides();
  const ride  = rides.find(r => r.id === id);
  if (ride) {
    await DB.saveNotif({
      id: 'n_' + Date.now(), pasId: ride.pasId,
      msg: `🚗 ${me.nom} aceptó tu viaje. Vehículo: ${me.veh || '—'} | Placas: ${me.pla || '—'}`,
      leida: false, fecha: new Date().toISOString()
    });
  }
  toast('¡Viaje aceptado! 🚗', 'ok');
}

// ── HELPER ────────────────────────────────────────
function sLabel(s) {
  return { pendiente: 'Pendiente', aceptado: 'Aceptado', completado: 'Completado', cancelado: 'Cancelado' }[s] || s;
}
