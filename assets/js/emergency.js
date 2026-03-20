// ── BOTÓN DE EMERGENCIA (SOS) ────────────────────────────────────────────
// Mantener presionado 3s → llama al 911 + alerta Firebase + notifica al otro
// Se muestra durante viajes en_camino y en_curso para pasajero y conductor

let _sosTimer       = null;  // setTimeout del hold
let _sosInterval    = null;  // intervalo para animar progreso
let _sosProgreso    = 0;     // 0-100
const SOS_DURACION  = 3000;  // ms de hold requerido

// ── Inicializar botón SOS ────────────────────────────────────────────────
function initSOS() {
  _inyectarEstilosSOS();
  _ensureSOSBtn();
}

// ── Mostrar / ocultar botón según estado del viaje ───────────────────────
function mostrarSOS(rideId, otroId) {
  _ensureSOSBtn();
  const btn = document.getElementById('sos-btn-float');
  if (!btn) return;
  btn.style.display = 'flex';
  btn.dataset.rideId = rideId  || '';
  btn.dataset.otroId = otroId  || '';
}

function ocultarSOS() {
  const btn = document.getElementById('sos-btn-float');
  if (btn) btn.style.display = 'none';
  _cancelarHold();
}

// ── Crear botón flotante en el DOM ────────────────────────────────────────
function _ensureSOSBtn() {
  if (document.getElementById('sos-btn-float')) return;

  const btn = document.createElement('button');
  btn.id = 'sos-btn-float';
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
    </svg>
    <span>SOS</span>
    <svg class="sos-ring" viewBox="0 0 44 44" width="54" height="54">
      <circle cx="22" cy="22" r="20" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="3"/>
      <circle id="sos-progress-ring" cx="22" cy="22" r="20" fill="none"
        stroke="#fff" stroke-width="3" stroke-linecap="round"
        stroke-dasharray="125.6" stroke-dashoffset="125.6"
        transform="rotate(-90 22 22)"/>
    </svg>`;
  btn.style.display = 'none';

  // Touch / mouse events para hold
  btn.addEventListener('mousedown',  _iniciarHold);
  btn.addEventListener('touchstart', _iniciarHold, { passive: true });
  btn.addEventListener('mouseup',    _cancelarHold);
  btn.addEventListener('mouseleave', _cancelarHold);
  btn.addEventListener('touchend',   _cancelarHold);
  btn.addEventListener('touchcancel',_cancelarHold);

  document.body.appendChild(btn);
}

// ── Iniciar hold ──────────────────────────────────────────────────────────
function _iniciarHold(e) {
  if (_sosTimer) return;
  _sosProgreso = 0;
  _actualizarRing(0);

  const btn = document.getElementById('sos-btn-float');
  if (btn) btn.classList.add('holding');

  const inicio = Date.now();
  _sosInterval = setInterval(() => {
    _sosProgreso = Math.min(100, ((Date.now() - inicio) / SOS_DURACION) * 100);
    _actualizarRing(_sosProgreso);
  }, 50);

  _sosTimer = setTimeout(() => {
    _cancelarHold();
    _activarEmergencia();
  }, SOS_DURACION);
}

// ── Cancelar hold ─────────────────────────────────────────────────────────
function _cancelarHold() {
  if (_sosTimer)    { clearTimeout(_sosTimer);   _sosTimer    = null; }
  if (_sosInterval) { clearInterval(_sosInterval); _sosInterval = null; }
  _actualizarRing(0);
  const btn = document.getElementById('sos-btn-float');
  if (btn) btn.classList.remove('holding');
}

// ── Actualizar anillo de progreso SVG ────────────────────────────────────
function _actualizarRing(pct) {
  const ring = document.getElementById('sos-progress-ring');
  if (!ring) return;
  const circunferencia = 125.6;
  ring.style.strokeDashoffset = circunferencia - (circunferencia * pct / 100);
}

// ── Activar emergencia ────────────────────────────────────────────────────
async function _activarEmergencia() {
  const btn    = document.getElementById('sos-btn-float');
  const rideId = btn?.dataset.rideId || null;
  const otroId = btn?.dataset.otroId || null;

  // Vibrar si el dispositivo lo soporta
  if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);

  // Obtener posición GPS actual
  let lat = null, lng = null;
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej,
        { enableHighAccuracy: true, timeout: 5000 }));
    lat = pos.coords.latitude;
    lng = pos.coords.longitude;
  } catch(e) {
    // usar última posición conocida
    if (me && me.lastLat) { lat = me.lastLat; lng = me.lastLng; }
  }

  // Guardar alerta en Firebase
  const alerta = {
    id:      'alerta_' + Date.now(),
    ts:      Date.now(),
    uid:     me?.id    || null,
    nom:     me ? (me.nom + ' ' + (me.ape || '')) : 'Desconocido',
    rol:     me?.rol   || null,
    rideId:  rideId,
    lat, lng,
    fecha:   new Date().toISOString(),
    atendida: false,
  };

  try { await DB.saveAlerta(alerta); } catch(e) {}

  // Notificar al otro participante del viaje
  if (otroId && rideId) {
    const quien = me?.rol === 'chofer' ? 'El conductor' : 'El pasajero';
    try {
      await DB.saveNotif({
        id:     'n_sos_' + Date.now(),
        pasId:  otroId,
        msg:    `🚨 EMERGENCIA: ${quien} activó el botón SOS. Viaje: ${rideId}`,
        leida:  false,
        fecha:  new Date().toISOString(),
        tipo:   'emergencia',
      });
    } catch(e) {}
  }

  // Mostrar modal de confirmación con opción de llamar al 911
  _mostrarModalSOS(lat, lng);
}

// ── Modal post-activación ─────────────────────────────────────────────────
function _mostrarModalSOS(lat, lng) {
  // Eliminar modal previo si existe
  const prev = document.getElementById('modal-sos');
  if (prev) prev.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-sos';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9000;display:flex;align-items:center;justify-content:center;padding:1.5rem;';

  const mapsUrl = lat && lng
    ? `https://maps.google.com/?q=${lat},${lng}`
    : null;

  const inner = document.createElement('div');
  inner.style.cssText = 'background:#1a1a2e;border-radius:18px;width:100%;max-width:360px;padding:1.8rem 1.4rem;text-align:center;border:2px solid #ef4444;';
  inner.innerHTML = `
    <div style="font-size:2.5rem;margin-bottom:.5rem;">🚨</div>
    <div style="font-size:1.1rem;font-weight:800;color:#ef4444;margin-bottom:.4rem;">Emergencia activada</div>
    <div style="font-size:.83rem;color:rgba(255,255,255,.6);margin-bottom:1.4rem;">
      Se notificó al otro participante del viaje.<br>
      ${lat ? 'Tu ubicación fue registrada.' : 'No se pudo obtener tu ubicación.'}
    </div>
    <div style="display:flex;flex-direction:column;gap:.7rem;">
      <button id="sos-call-911"
        style="background:#ef4444;border:none;color:#fff;border-radius:12px;padding:.85rem;font-size:1rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.5rem;">
        📞 Llamar al 911
      </button>
      ${mapsUrl ? `
      <button id="sos-share-loc"
        style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;border-radius:12px;padding:.7rem;font-size:.88rem;cursor:pointer;">
        📍 Compartir mi ubicación
      </button>` : ''}
      <button id="sos-cerrar"
        style="background:transparent;border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.5);border-radius:12px;padding:.65rem;font-size:.85rem;cursor:pointer;">
        Cerrar
      </button>
    </div>`;

  modal.appendChild(inner);
  document.body.appendChild(modal);

  document.getElementById('sos-call-911').onclick = () => {
    window.location.href = 'tel:911';
  };

  if (mapsUrl) {
    document.getElementById('sos-share-loc').onclick = () => {
      const txt = encodeURIComponent(`🚨 Emergencia tuTaxi\nMi ubicación: ${mapsUrl}`);
      window.open('https://wa.me/?text=' + txt, '_blank');
    };
  }

  document.getElementById('sos-cerrar').onclick = () => modal.remove();
}

// ── Estilos del botón SOS ─────────────────────────────────────────────────
function _inyectarEstilosSOS() {
  if (document.getElementById('sos-styles')) return;
  const style = document.createElement('style');
  style.id = 'sos-styles';
  style.textContent = `
    #sos-btn-float {
      position: fixed;
      bottom: 88px;
      right: 18px;
      width: 54px;
      height: 54px;
      border-radius: 50%;
      background: #ef4444;
      color: #fff;
      border: none;
      cursor: pointer;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1px;
      font-size: .6rem;
      font-weight: 800;
      letter-spacing: .5px;
      box-shadow: 0 4px 20px rgba(239,68,68,.5);
      z-index: 2000;
      padding: 0;
      transition: transform .1s, box-shadow .1s;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }
    #sos-btn-float .sos-ring {
      position: absolute;
      top: -1px; left: -1px;
      pointer-events: none;
    }
    #sos-btn-float.holding {
      transform: scale(1.08);
      box-shadow: 0 6px 28px rgba(239,68,68,.7);
    }
    #sos-btn-float span {
      font-size: .58rem;
      font-weight: 900;
      letter-spacing: 1px;
      line-height: 1;
    }
    @keyframes sos-pulse {
      0%,100% { box-shadow: 0 4px 20px rgba(239,68,68,.5); }
      50%      { box-shadow: 0 4px 28px rgba(239,68,68,.85); }
    }
    #sos-btn-float { animation: sos-pulse 2s ease-in-out infinite; }
    #sos-btn-float.holding { animation: none; }
  `;
  document.head.appendChild(style);
}
