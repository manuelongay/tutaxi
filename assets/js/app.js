/* ============================================================
   tuTaxi — app.js
   Inicialización, navegación y arranque de la app
   ============================================================ */

let me = null;

// ── NAVEGACIÓN ────────────────────────────────────
function go(s) {
  document.querySelectorAll('.screen').forEach(x => x.classList.remove('active'));
  document.getElementById('screen-' + s).classList.add('active');
  if (s === 'app') setTimeout(initMapa, 350);
  // Rellenar datos de Google si aplica
  if (s === 'register-google' && window._googleUser) {
    const u = window._googleUser;
    const el = id => document.getElementById(id);
    if (el('rg-nombre'))     el('rg-nombre').textContent    = (u.nom + ' ' + u.ape).trim();
    if (el('rg-email-show')) el('rg-email-show').textContent = u.email;
    if (el('rg-foto') && u.foto) { el('rg-foto').src = u.foto; el('rg-foto').style.display = 'block'; }
  }
}

function showTab(id, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (btn) btn.classList.add('active');
  // Invalidar tamaño de mapas al cambiar de pestaña
  if (id === 't-driver' && typeof initMapaSolicitudes === 'function') {
    // Solo iniciar mini-mapa si el conductor no tiene viaje activo
    DB.rides().then(rides => {
      const tieneViaje = rides.some(r => r.chofId === me.id && ['en_camino','en_curso'].includes(r.est));
      if (!tieneViaje) requestAnimationFrame(() => setTimeout(() => initMapaSolicitudes(), 150));
    });
  }
  if (id === 't-encurso' && typeof mapEncurso !== 'undefined' && mapEncurso) setTimeout(() => mapEncurso.invalidateSize(), 100);
  if (id === 't-rides')    cargarMisViajes();
  if (id === 't-driver' && driverOn) DB.rides().then(rides => renderSolicitudes(rides));
  if (id === 't-home')     setTimeout(() => map && map.invalidateSize(), 200);
  if (id === 't-ganancias') cargarGanancias();
  // Al activar la pestaña En curso iniciar el mapa
  if (id === 't-encurso') {
    DB.rides().then(rides => {
      const activo = rides.find(r => r.chofId === me.id && ['en_camino','en_curso'].includes(r.est));
      if (activo) setTimeout(() => initMapaEncurso(activo), 200);
    });
  }
}

// ── TOAST ─────────────────────────────────────────
// ── CHAT: abrir desde cualquier rol ──────────────────
function abrirChatViaje() {
  // Buscar el viaje activo según el rol del usuario
  DB.rides().then(rides => {
    let rideActivo = null;
    if (me.rol === 'chofer') {
      rideActivo = rides.find(r => r.chofId === me.id && ['en_camino','en_curso'].includes(r.est));
    } else {
      rideActivo = rides.find(r => r.pasId === me.id && ['pendiente','en_camino','en_curso'].includes(r.est));
    }
    if (rideActivo) {
      abrirChat(rideActivo.id);
    } else {
      toast('No hay viaje activo para chatear', 'err');
    }
  });
}

// ── COMPARTIR VIAJE EN TIEMPO REAL ──────────────────────────────────────
function compartirViaje(rideId) {
  // URL fija apuntando a la raíz del repositorio en GitHub Pages
  const shareUrl = 'https://manuelongay.github.io/tutaxi/share.html?ride=' + rideId;
  const waMensaje = '📍 Sigue mi viaje en tuTaxi en tiempo real: ' + shareUrl;

  const modal = document.createElement('div');
  modal.id = 'modal-share';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:5000;display:flex;align-items:flex-end;justify-content:center;';

  const btnCopiar  = document.createElement('button');
  btnCopiar.textContent = '📋 Copiar link';
  btnCopiar.style.cssText = 'background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:#fff;border-radius:12px;padding:.75rem;font-size:.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.6rem;width:100%;';
  btnCopiar.onclick = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrl)
        .then(() => { toast('¡Link copiado! 📋','ok'); cerrarModalShare(); })
        .catch(() => { _copiarFallback(shareUrl); cerrarModalShare(); });
    } else {
      _copiarFallback(shareUrl);
      cerrarModalShare();
    }
  };

  const btnWa = document.createElement('button');
  btnWa.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="flex-shrink:0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.118 1.532 5.845L0 24l6.337-1.508A11.946 11.946 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.373l-.36-.213-3.762.895.952-3.659-.234-.375A9.818 9.818 0 1112 21.818z"/></svg> Enviar por WhatsApp';
  btnWa.style.cssText = 'background:#25D366;border:none;color:#fff;border-radius:12px;padding:.75rem;font-size:.9rem;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.6rem;width:100%;';
  btnWa.onclick = () => {
    window.open('https://wa.me/?text=' + encodeURIComponent(waMensaje), '_blank');
    cerrarModalShare();
  };

  const btnCancelar = document.createElement('button');
  btnCancelar.textContent = 'Cancelar';
  btnCancelar.style.cssText = 'background:transparent;border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.6);border-radius:12px;padding:.65rem;font-size:.88rem;cursor:pointer;width:100%;';
  btnCancelar.onclick = cerrarModalShare;

  const urlDiv = document.createElement('div');
  urlDiv.style.cssText = 'background:rgba(255,255,255,.06);border-radius:10px;padding:.7rem .9rem;font-size:.75rem;color:rgba(255,255,255,.5);word-break:break-all;margin-bottom:1rem;';
  urlDiv.textContent = shareUrl;

  const inner = document.createElement('div');
  inner.style.cssText = 'background:#1a1a2e;border-radius:18px 18px 0 0;width:100%;max-width:480px;padding:1.4rem 1.2rem 2rem;';
  inner.innerHTML = '<div style="text-align:center;margin-bottom:1.2rem;"><div style="font-size:1.5rem;">📤</div><div style="font-weight:700;font-size:1rem;margin-top:.4rem;">Compartir viaje</div><div style="font-size:.78rem;color:rgba(255,255,255,.45);margin-top:.2rem;">Cualquiera con este link puede ver tu viaje en tiempo real</div></div>';
  inner.appendChild(urlDiv);
  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;flex-direction:column;gap:.6rem;';
  btns.appendChild(btnCopiar);
  btns.appendChild(btnWa);
  btns.appendChild(btnCancelar);
  inner.appendChild(btns);
  modal.appendChild(inner);
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) cerrarModalShare(); });
}

function _copiarFallback(texto) {
  const ta = document.createElement('textarea');
  ta.value = texto;
  ta.style.cssText = 'position:fixed;opacity:0;';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); toast('¡Link copiado! 📋','ok'); }
  catch(e) { toast('Copia el link manualmente','err'); }
  document.body.removeChild(ta);
}

function cerrarModalShare() {
  const m = document.getElementById('modal-share');
  if (m) m.remove();
}

function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = 'toast show ' + type;
  setTimeout(() => el.classList.remove('show'), 3000);
}

// ── TEMA ──────────────────────────────────────────
function toggleTheme() {
  const isLight = document.body.classList.toggle('light');
  document.getElementById('theme-btn').textContent = isLight ? '☀️' : '🌙';
  localStorage.setItem('tt_theme', isLight ? 'light' : 'dark');
}

// ── INIT APP ──────────────────────────────────────
function initApp() {
  go('app');
  document.getElementById('tb-name').textContent = me.nom;
  // Inicializar botón SOS (crea el botón flotante en el DOM)
  if (typeof initSOS === 'function') initSOS();
  const rel = document.getElementById('tb-role');

  if (me.rol === 'chofer') {
    rel.textContent  = '🚗 Chofer';
    rel.className    = 'role-chip role-chofer';
    document.getElementById('tab-chofer-btn').style.display    = 'block';
    document.getElementById('tab-ganancias-btn').style.display = 'block';
    document.getElementById('tab-inicio-btn').style.display    = 'none';

    setTimeout(() => {
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.getElementById('t-driver').classList.add('active');
      document.getElementById('tab-chofer-btn').classList.add('active');
      driverOn = true;
      document.getElementById('driver-sw').checked      = true;
      document.getElementById('driver-sub').textContent = 'Estás disponible';
      iniciarTracking();
      DB.rides().then(rides => renderSolicitudes(rides));

      // Mini-mapa solicitudes — solo si no hay viaje activo al iniciar
      DB.rides().then(rides => {
        const tieneViaje = rides.some(r => r.chofId === me.id && ['en_camino','en_curso'].includes(r.est));
        if (!tieneViaje) requestAnimationFrame(() => setTimeout(() => initMapaSolicitudes(), 100));
      });

      // onRides dentro del setTimeout — driverOn ya es true aquí
      let _ridesCache = [];
      DB.onRides(rides => {
        _ridesCache = rides;
        renderSolicitudes(rides);
        actualizarIconosChoferes(rides);
        actualizarIconoPropio(rides);
        // Verificar si hay viaje activo para mostrar/ocultar pestaña En curso
        const activo = rides.find(r => r.chofId === me.id && ['en_camino','en_curso'].includes(r.est));
        mostrarPestanaEncurso(activo || null);
      });

      // Actualizar otros conductores en mini-mapa
      DB.onUsers(users => {
        actualizarOtrosChoferesMini(users, _ridesCache);
      });
    }, 400);

  } else {
    rel.textContent  = '👤 Pasajero';
    rel.className    = 'role-chip role-pasajero';
    document.getElementById('tab-chofer-btn').style.display    = 'none';
    document.getElementById('tab-ganancias-btn').style.display = 'none';
    document.getElementById('tab-inicio-btn').style.display    = 'block';
    setTimeout(async () => {
      initMapa();
      // Restaurar ruta si hay viaje activo al recargar
      const rides = await DB.rides();
      const activo = rides.find(r => r.pasId === me.id && ['pendiente','en_camino','en_curso'].includes(r.est));
      if (activo) {
        // Ocultar botón solicitar si hay viaje activo
        const btnSolicitar = document.getElementById('btn-solicitar');
        if (btnSolicitar) btnSolicitar.style.display = 'none';

        if (activo.coordO && activo.coordD) {
          coordO = activo.coordO;
          coordD = activo.coordD;
          document.getElementById('inp-origen').value  = activo.origen  || '';
          document.getElementById('inp-destino').value = activo.destino || '';
          setTimeout(() => {
            ponerPin('origen',  coordO.lat, coordO.lng);
            ponerPin('destino', coordD.lat, coordD.lng);
            trazarRuta();
          }, 400);
        }

        // Reiniciar tracking del conductor si aplica
        if ((activo.est === 'en_camino' || activo.est === 'en_curso') && activo.chofId) {
          setTimeout(() => iniciarMapaPasajero(activo), 500);
        }
      }

      // Registrar onRides AQUÍ, después de que el mapa ya está listo
      DB.onRides(rides => {
        renderViajeActivo(rides);
        actualizarIconosChoferes(rides);
      });
      // Tracking en tiempo real de choferes en el mapa
      iniciarTrackingMapa();
      // Tracking GPS continuo del pasajero (guarda lastLat en Firebase)
      iniciarTrackingPasajero();
    }, 350);

    DB.onNotifs(me.id, notifs => {
      notifs.forEach(n => {
        mostrarNotifBanner(n.msg);
        DB.markNotifRead(n.id);
      });
    });

    // onRides y tracking se inician DENTRO del setTimeout para garantizar
    // que initMapa() ya ejecutó y map != null antes del primer render
    // (evita que ponerPin/renderViajeActivo fallen con map=null al recargar)
  }

  cargarTarifas();
  refrescarPerfil();

  const savedTheme = localStorage.getItem('tt_theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light');
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = '☀️';
  }
}

// ── ARRANQUE ──────────────────────────────────────
window.addEventListener('load', () => {
  if (localStorage.getItem('tt_theme') === 'light') {
    document.body.classList.add('light');
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = '☀️';
  }

  // Firebase Auth maneja la sesión automáticamente
  firebase.auth().onAuthStateChanged(async firebaseUser => {
    // Ignorar si hay un popup de Google en progreso
    if (window._popupEnProgreso) return;

    if (firebaseUser) {
      const u = await DB.getUser(firebaseUser.uid);
      if (u && u.estatus !== 'bloqueado') {
        // Solo iniciar app si no está ya activa
        if (document.getElementById('screen-app').classList.contains('active')) return;
        me = u;
        DB.saveSession(u);
        initApp();
        return;
      }
      // Usuario en Firebase Auth pero no en DB — puede ser registro Google pendiente
      if (window._googleUser) return;
    }
    // Sin sesión válida — mostrar landing solo si no estamos en otra pantalla de auth
    const screens = ['screen-login','screen-register','screen-register-google'];
    const enAuth = screens.some(s => document.getElementById('screen-' + s)?.classList.contains('active') ||
                                     document.getElementById(s)?.classList.contains('active'));
    if (!enAuth && !document.getElementById('screen-app').classList.contains('active')) go('landing');
  });
});
