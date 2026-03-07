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
}

function showTab(id, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (btn) btn.classList.add('active');
  if (id === 't-rides')    cargarMisViajes();
  if (id === 't-driver' && driverOn) renderSolicitudes([]);
  if (id === 't-home')     setTimeout(() => map && map.invalidateSize(), 200);
  if (id === 't-ganancias') cargarGanancias();
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
      // Cargar solicitudes al iniciar sesión
      DB.rides().then(rides => renderSolicitudes(rides));
    }, 400);
  } else {
    rel.textContent  = '👤 Pasajero';
    rel.className    = 'role-chip role-pasajero';
    document.getElementById('tab-chofer-btn').style.display    = 'none';
    document.getElementById('tab-ganancias-btn').style.display = 'none';
    document.getElementById('tab-inicio-btn').style.display    = 'block';
    setTimeout(initMapa, 350);

    // Notificaciones en tiempo real
    DB.onNotifs(me.id, notifs => {
      notifs.forEach(n => {
        mostrarNotifBanner(n.msg);
        DB.markNotifRead(n.id);
      });
    });
  }

  // Viajes en tiempo real
  DB.onRides(rides => {
    if (me.rol === 'pasajero') renderViajeActivo(rides);
    if (me.rol === 'chofer' && driverOn) renderSolicitudes(rides);
    actualizarIconosChoferes(rides);
  });

  refrescarPerfil();

  // Restaurar tema
  const savedTheme = localStorage.getItem('tt_theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light');
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = '☀️';
  }
}

// ── ARRANQUE ──────────────────────────────────────
window.addEventListener('load', async () => {
  // Restaurar tema antes de mostrar nada
  if (localStorage.getItem('tt_theme') === 'light') {
    document.body.classList.add('light');
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = '☀️';
  }

  // Restaurar sesión
  const s = DB.session();
  if (s) {
    const u = await DB.getUser(s.id);
    if (u && u.estatus !== 'bloqueado') { me = u; initApp(); return; }
    DB.clearSession();
  }
});
