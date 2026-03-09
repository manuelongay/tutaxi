/* ============================================================
   tuTaxi — rides.js
   Lógica de solicitud, aceptación y gestión de viajes
   ============================================================ */

// ── HELPER ESTRELLAS ─────────────────────────────
function renderEstrellas(prom) {
  if (!prom) return '';
  const full  = Math.floor(prom);
  const half  = prom - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '⭐'.repeat(full) + (half ? '✨' : '') + '☆'.repeat(empty);
}

// ── MOTIVOS DE CANCELACIÓN ────────────────────────
const MOTIVOS_PASAJERO = [
  'El chofer tardó demasiado',
  'Me equivoqué de destino',
  'Encontré otro transporte',
  'Cambié de planes',
  'Otro motivo',
];

const MOTIVOS_CHOFER = [
  'El pasajero no apareció',
  'El pasajero canceló por otro medio',
  'Problema con el vehículo',
  'Emergencia personal',
  'Otro motivo',
];

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
        ${activo.chofNom ? `<div>
          <div class="price-lbl">Chofer</div>
          <div style="font-weight:700;">${activo.chofNom}</div>
          <div style="font-size:.75rem;color:var(--gray3);">${activo.veh || ''} ${activo.pla ? '| ' + activo.pla : ''}</div>
          ${activo.chofRating ? `<div style="margin-top:.3rem;display:flex;align-items:center;gap:.3rem;">
            ${renderEstrellas(activo.chofRating)}
            <span style="font-size:.75rem;color:var(--gray3);">${activo.chofRating} (${activo.chofRatingCount || 0})</span>
          </div>` : ''}
        </div>` : ''}
      </div>
      <div style="display:flex;gap:.6rem;margin-top:.5rem;">
        ${activo.est === 'pendiente' ? `
          <button class="btn btn-danger btn-full" onclick="mostrarModalCancelacion('${activo.id}','pasajero')">
            Cancelar solicitud
          </button>` : ''}
        ${activo.est === 'aceptado' ? `
          <button class="btn btn-danger" style="flex:1;" onclick="mostrarModalCancelacion('${activo.id}','pasajero')">
            Cancelar
          </button>
          <button class="btn btn-success" style="flex:2;" onclick="completarViaje('${activo.id}')">
            Marcar completado ✓
          </button>` : ''}
      </div>
    </div>`;
  } else {
    const completado = rides.find(r => r.pasId === me.id && r.est === 'completado' && !r.calificacion);
    if (completado) mostrarModalCalificacion(completado);
    wrap.style.display = 'none'; card.innerHTML = '';
  }
}

async function completarViaje(id) {
  await DB.updateRide(id, { est: 'completado' });
  toast('¡Completado! ⭐', 'ok');
}

// ── MODAL CANCELACIÓN ─────────────────────────────
function mostrarModalCancelacion(rideId, quien) {
  if (document.getElementById('modal-cancelacion')) return;
  const motivos = quien === 'pasajero' ? MOTIVOS_PASAJERO : MOTIVOS_CHOFER;

  const modal = document.createElement('div');
  modal.id = 'modal-cancelacion';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.78);display:flex;align-items:flex-end;justify-content:center;z-index:99999;padding:1rem;backdrop-filter:blur(4px);';
  modal.innerHTML = `
    <div style="background:var(--gray);border:1px solid rgba(255,255,255,.1);border-radius:24px 24px 0 0;padding:2rem;width:100%;max-width:440px;">
      <div style="font-size:1.1rem;font-weight:700;margin-bottom:.3rem;">¿Por qué cancelas? 😕</div>
      <div style="font-size:.85rem;color:var(--gray3);margin-bottom:1.5rem;">Selecciona el motivo de cancelación</div>
      <div id="motivos-list" style="display:flex;flex-direction:column;gap:.6rem;margin-bottom:1.5rem;">
        ${motivos.map((m, i) => `
          <div class="motivo-item" onclick="selMotivo(${i})" data-idx="${i}"
            style="padding:.85rem 1rem;border-radius:12px;border:1.5px solid rgba(255,255,255,.08);cursor:pointer;font-size:.9rem;display:flex;align-items:center;gap:.8rem;transition:all .15s;">
            <div class="motivo-radio" style="width:18px;height:18px;border-radius:50%;border:2px solid rgba(255,255,255,.3);flex-shrink:0;"></div>
            ${m}
          </div>`).join('')}
      </div>
      <div id="otro-motivo-wrap" style="display:none;margin-bottom:1.2rem;">
        <textarea id="otro-motivo-txt" placeholder="Describe el motivo..."
          style="width:100%;background:var(--gray2);border:1.5px solid rgba(255,255,255,.08);border-radius:10px;color:var(--white);padding:.75rem;font-size:.88rem;resize:none;height:80px;outline:none;box-sizing:border-box;"></textarea>
      </div>
      <button onclick="confirmarCancelacion('${rideId}','${quien}')" class="btn btn-danger btn-full" style="margin-bottom:.8rem;">
        Confirmar cancelación
      </button>
      <button onclick="document.getElementById('modal-cancelacion').remove()"
        style="width:100%;background:none;border:none;color:var(--gray3);cursor:pointer;font-size:.88rem;">
        Volver
      </button>
    </div>`;
  document.body.appendChild(modal);
}

let motivoSelIdx = -1;

function selMotivo(idx) {
  motivoSelIdx = idx;
  document.querySelectorAll('.motivo-item').forEach((el, i) => {
    const radio = el.querySelector('.motivo-radio');
    const sel   = i === idx;
    el.style.borderColor    = sel ? 'var(--accent)' : 'rgba(255,255,255,.08)';
    el.style.background     = sel ? 'rgba(245,197,24,.08)' : '';
    radio.style.borderColor = sel ? 'var(--accent)' : 'rgba(255,255,255,.3)';
    radio.style.background  = sel ? 'var(--accent)' : '';
  });
  const motivos = document.querySelectorAll('.motivo-item');
  document.getElementById('otro-motivo-wrap').style.display =
    idx === motivos.length - 1 ? 'block' : 'none';
}

async function confirmarCancelacion(rideId, quien) {
  if (motivoSelIdx === -1) { toast('Selecciona un motivo', 'err'); return; }

  const motivos = quien === 'pasajero' ? MOTIVOS_PASAJERO : MOTIVOS_CHOFER;
  let motivo    = motivos[motivoSelIdx];
  const esOtro  = motivoSelIdx === motivos.length - 1;

  if (esOtro) {
    const txt = document.getElementById('otro-motivo-txt').value.trim();
    if (!txt) { toast('Describe el motivo', 'err'); return; }
    motivo = txt;
  }

  const rides = await DB.rides();
  const ride  = rides.find(r => r.id === rideId);

  await DB.updateRide(rideId, {
    est:               'cancelado',
    canceladoPor:      quien,
    motivoCancelacion: motivo,
    fechaCancelacion:  new Date().toISOString(),
  });

  // Notificar a la otra parte
  if (ride) {
    const destinatarioId = quien === 'pasajero' ? ride.chofId : ride.pasId;
    if (destinatarioId) {
      const quienNom = quien === 'pasajero' ? ride.pasNom : ride.chofNom;
      await DB.saveNotif({
        id:    'n_' + Date.now(),
        pasId: destinatarioId,
        msg:   `❌ ${quienNom} canceló el viaje. Motivo: "${motivo}"`,
        leida: false,
        fecha: new Date().toISOString(),
      });
    }
  }

  document.getElementById('modal-cancelacion').remove();
  motivoSelIdx = -1;
  toast('Viaje cancelado');
}

// ── RENDER SOLICITUDES (CHOFER) ───────────────────
function renderSolicitudes(rides) {
  if (!driverOn) return;
  const pendientes = rides.filter(r => r.est === 'pendiente');
  const el         = document.getElementById('solicitudes-list');

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
    <div class="ride-bot">
      <span class="ride-price">$${r.precio}</span>
      <span class="ride-date">${new Date(r.fecha).toLocaleDateString('es-MX')}</span>
      ${r.canceladoPor ? `<span style="font-size:.72rem;color:var(--gray3);">Canceló: ${r.canceladoPor === 'pasajero' ? '👤 Pasajero' : '🚗 Chofer'}</span>` : ''}
    </div>
    ${r.motivoCancelacion ? `<div style="font-size:.75rem;color:var(--gray3);margin-top:.3rem;padding-top:.5rem;border-top:1px solid rgba(255,255,255,.05);">Motivo: ${r.motivoCancelacion}</div>` : ''}
  </div>`).join('');
}

function rechazarViaje(id, btn) { btn.closest('.avail-card').remove(); toast('Rechazada'); }

async function aceptarViaje(id) {
  await DB.updateRide(id, {
    est: 'aceptado', chofId: me.id, chofNom: me.nom + ' ' + (me.ape || ''),
    chofTel: me.tel, veh: me.veh, pla: me.pla,
    chofRating: me.ratingProm || null, chofRatingCount: me.ratingCount || 0,
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
