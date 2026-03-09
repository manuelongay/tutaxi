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
  if (id === 't-rides')    cargarMisViajes();
  if (id === 't-driver' && driverOn) DB.rides().then(rides => renderSolicitudes(rides));
  if (id === 't-home')     setTimeout(() => map && map.invalidateSize(), 200);
  if (id === 't-ganancias') cargarGanancias();
  // Al activar la pestaña En curso iniciar el mapa
  if (id === 't-encurso') {
    DB.rides().then(rides => {
      const activo = rides.find(r => r.chofId === me.id && r.est === 'aceptado');
      if (activo) setTimeout(() => initMapaEncurso(activo), 200);
    });
  }
}

// ── TOAST ─────────────────────────────────────────
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

      // onRides dentro del setTimeout — driverOn ya es true aquí
      DB.onRides(rides => {
        renderSolicitudes(rides);
        actualizarIconosChoferes(rides);
        // Verificar si hay viaje aceptado para mostrar/ocultar pestaña En curso
        const activo = rides.find(r => r.chofId === me.id && r.est === 'aceptado');
        mostrarPestanaEncurso(activo || null);
      });
    }, 400);

  } else {
    rel.textContent  = '👤 Pasajero';
    rel.className    = 'role-chip role-pasajero';
    document.getElementById('tab-chofer-btn').style.display    = 'none';
    document.getElementById('tab-ganancias-btn').style.display = 'none';
    document.getElementById('tab-inicio-btn').style.display    = 'block';
    setTimeout(initMapa, 350);

    DB.onNotifs(me.id, notifs => {
      notifs.forEach(n => {
        mostrarNotifBanner(n.msg);
        DB.markNotifRead(n.id);
      });
    });

    // onRides solo para pasajero
    DB.onRides(rides => {
      renderViajeActivo(rides);
      actualizarIconosChoferes(rides);
    });
    // Tracking en tiempo real de choferes en el mapa
    iniciarTrackingMapa();
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
    if (firebaseUser) {
      const u = await DB.getUser(firebaseUser.uid);
      if (u && u.estatus !== 'bloqueado') {
        me = u;
        DB.saveSession(u);
        if (!document.getElementById('screen-app').classList.contains('active')) {
          initApp();
        }
        return;
      }
    }
    // Sin sesión válida — mostrar landing
    const screens = ['screen-app','screen-login','screen-register','screen-register-google'];
    const anyActive = screens.some(s => document.getElementById(s)?.classList.contains('active'));
    if (!anyActive) go('landing');
  });
});
