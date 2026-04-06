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

function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const view = document.getElementById('view-' + viewId);
  if (view) view.classList.add('active');
  // Mark nav item active
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(n => {
    if (n.getAttribute('onclick') && n.getAttribute('onclick').includes("'" + viewId + "'")) {
      n.classList.add('active');
    }
  });
}

function showTab(id, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (btn) btn.classList.add('active');
  // Invalidar tamaño de mapas al cambiar de pestaña
  if (id === 't-driver'  && typeof initMapaSolicitudes === 'function') setTimeout(() => initMapaSolicitudes(), 100);
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

// ── INIT APP (ADMIN) ─────────────────────────────
function initApp() {
  go('app');
  if (document.getElementById('tb-name')) document.getElementById('tb-name').textContent = me.nom;

  // Cargar dashboard inicial
  showView('dashboard');
  cargarDashboard();
  cargarDocumentos();

  // Escuchar alertas de emergencia y documentos en tiempo real
  DB.onAllDocs(docs => {
    let pendientes = 0;
    if (docs) Object.values(docs).forEach(d => {
      Object.values(d).forEach(doc => { if (doc?.est === 'subido') pendientes++; });
    });
    const badge = document.getElementById('badge-docs');
    if (badge) { badge.textContent = pendientes || ''; badge.style.display = pendientes ? 'block' : 'none'; }
  });
}

async function cargarDashboard() {
  try {
    const [users, rides] = await Promise.all([DB.getUsers(), DB.getRides()]);
    const choferes  = users.filter(u => u.rol === 'chofer');
    const pasajeros = users.filter(u => u.rol === 'pasajero');
    const activos   = rides.filter(r => ['pendiente','en_camino','en_curso'].includes(r.est));
    const hoy       = new Date().toDateString();
    const hoyRides  = rides.filter(r => new Date(r.fecha).toDateString() === hoy);

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('stat-choferes',  choferes.length);
    set('stat-pasajeros', pasajeros.length);
    set('stat-activos',   activos.length);
    set('stat-hoy',       hoyRides.length);
    set('badge-drivers',  choferes.filter(c => c.estatus !== 'bloqueado').length);
  } catch(e) { console.error('Dashboard error:', e); }
}


// ── MÓDULO DE DOCUMENTOS — PANEL ADMIN ──────────────────────────────────

const DOCS_DEF = [
  { key: 'ine',         label: 'INE / Identificación oficial'      },
  { key: 'licencia',    label: 'Licencia de conducir'              },
  { key: 'circulacion', label: 'Tarjeta de circulación'            },
  { key: 'domicilio',   label: 'Comprobante de domicilio'          },
  { key: 'tarjeton',    label: 'Tarjetón del taxi'                 },
  { key: 'num_taxi',    label: 'Número de taxi'                    },
  { key: 'permiso',     label: 'Permiso Instituto de Transporte'   },
];

let _docsFilter    = 'subido';
let _todosDocsData = {};
let _todosUsers    = {};

async function cargarDocumentos() {
  const [allDocs, allUsers] = await Promise.all([DB.getAllDocs(), DB.getUsers()]);
  _todosDocsData = allDocs || {};
  _todosUsers    = {};
  (allUsers || []).filter(u => u.rol === 'chofer').forEach(u => { _todosUsers[u.id] = u; });
  _actualizarBadgeDocs();
  renderTablaDocumentos();
}

function filtrarDocs(filtro, btn) {
  _docsFilter = filtro;
  document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderTablaDocumentos();
}

function _actualizarBadgeDocs() {
  let pendientes = 0;
  Object.entries(_todosDocsData).forEach(([uid, docs]) => {
    DOCS_DEF.forEach(d => {
      if (docs[d.key]?.est === 'subido') pendientes++;
    });
  });
  const badge = document.getElementById('badge-docs');
  if (badge) { badge.textContent = pendientes || ''; badge.style.display = pendientes ? 'block' : 'none'; }
}

function renderTablaDocumentos() {
  const wrap = document.getElementById('docs-admin-table');
  if (!wrap) return;

  // Construir lista de filas: un conductor puede tener múltiples docs
  const filas = [];
  Object.entries(_todosDocsData).forEach(([uid, docs]) => {
    const chofer = _todosUsers[uid];
    if (!chofer) return;
    DOCS_DEF.forEach(d => {
      const doc = docs[d.key];
      if (!doc) return;
      if (_docsFilter !== 'todos' && doc.est !== _docsFilter) return;
      filas.push({ uid, chofer, key: d.key, label: d.label, doc });
    });
  });

  if (!filas.length) {
    wrap.innerHTML = '<div style="text-align:center;padding:2rem;color:rgba(255,255,255,.4);">Sin documentos en este filtro</div>';
    return;
  }

  const pillMap = {
    subido:    { cls: 'pill-blue',   txt: 'En revisión' },
    aprobado:  { cls: 'pill-green',  txt: 'Aprobado ✓'  },
    rechazado: { cls: 'pill-red',    txt: 'Rechazado'   },
    vencido:   { cls: 'pill-orange', txt: 'Vencido'     },
    pendiente: { cls: 'pill-gray',   txt: 'Pendiente'   },
  };

  wrap.innerHTML = filas.map(({uid, chofer, key, label, doc}) => {
    const pill = pillMap[doc.est] || pillMap.pendiente;
    const thumb = doc.url
      ? `<a href="${doc.url}" target="_blank" style="margin-right:.5rem;">
           <img src="${doc.url}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid rgba(255,255,255,.15);vertical-align:middle;" alt="${label}">
         </a>` : '';
    const vence = doc.fechaVence
      ? `<div style="font-size:.72rem;color:rgba(255,255,255,.4);">Vence: ${new Date(doc.fechaVence).toLocaleDateString('es-MX')}</div>` : '';
    const motivo = doc.motivo
      ? `<div style="font-size:.72rem;color:#ef4444;">Motivo: ${doc.motivo}</div>` : '';
    const fechaSub = doc.fechaSubida
      ? new Date(doc.fechaSubida).toLocaleDateString('es-MX', {day:'2-digit',month:'short',year:'numeric'}) : '—';

    return `<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:1rem;margin-bottom:.75rem;">
      <div style="display:flex;align-items:flex-start;gap:.75rem;flex-wrap:wrap;">
        ${thumb}
        <div style="flex:1;min-width:180px;">
          <div style="font-weight:700;font-size:.9rem;">${chofer.nom} ${chofer.ape||''}</div>
          <div style="font-size:.78rem;color:rgba(255,255,255,.5);margin-bottom:.3rem;">${chofer.tel||''}</div>
          <div style="font-size:.85rem;margin-bottom:.25rem;">📄 ${label}</div>
          <div style="font-size:.72rem;color:rgba(255,255,255,.4);">Subido: ${fechaSub}</div>
          ${vence}${motivo}
        </div>
        <div style="display:flex;flex-direction:column;gap:.4rem;align-items:flex-end;">
          <span class="pill ${pill.cls}" style="font-size:.7rem;padding:.25rem .65rem;border-radius:100px;">${pill.txt}</span>
          ${doc.est === 'subido' ? `
          <button onclick="aprobarDoc('${uid}','${key}')"
            style="background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.3);color:#22c55e;border-radius:8px;padding:.35rem .75rem;font-size:.78rem;cursor:pointer;">
            ✅ Aprobar
          </button>
          <button onclick="rechazarDocPrompt('${uid}','${key}','${label}')"
            style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);color:#ef4444;border-radius:8px;padding:.35rem .75rem;font-size:.78rem;cursor:pointer;">
            ❌ Rechazar
          </button>` : ''}
          ${doc.est !== 'subido' ? `
          <button onclick="solicitarRenovacion('${uid}','${key}','${label}')"
            style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.6);border-radius:8px;padding:.35rem .75rem;font-size:.78rem;cursor:pointer;">
            🔄 Solicitar renovación
          </button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

async function aprobarDoc(uid, key) {
  await DB.updateDocs(uid, { [`${key}.est`]: 'aprobado', [`${key}.fechaAprobacion`]: new Date().toISOString(), [`${key}.motivo`]: null });
  // Notificar al conductor
  await DB.saveNotif({
    id: 'n_doc_ap_' + Date.now(), pasId: uid,
    msg: `✅ Tu ${DOCS_DEF.find(d=>d.key===key)?.label || 'documento'} fue aprobado.`,
    leida: false, fecha: new Date().toISOString(), tipo: 'documento'
  });
  // Verificar si todos los docs están aprobados y desbloquear conductor
  const docs = await DB.getDocs(uid);
  const todoAprobado = DOCS_DEF.every(d => docs?.[d.key]?.est === 'aprobado');
  if (todoAprobado) {
    await DB.updateUser(uid, { estatus: 'activo', motivoBloqueo: null });
    await DB.saveNotif({
      id: 'n_docs_ok_' + Date.now(), pasId: uid,
      msg: '🎉 Todos tus documentos fueron aprobados. ¡Ya puedes recibir viajes!',
      leida: false, fecha: new Date().toISOString(), tipo: 'documento'
    });
  }
  toast('Documento aprobado ✅', 'ok');
  await cargarDocumentos();
}

function rechazarDocPrompt(uid, key, label) {
  const motivo = prompt(`Motivo de rechazo para "${label}":`);
  if (!motivo) return;
  rechazarDoc(uid, key, label, motivo);
}

async function rechazarDoc(uid, key, label, motivo) {
  await DB.updateDocs(uid, {
    [`${key}.est`]: 'rechazado',
    [`${key}.motivo`]: motivo,
    [`${key}.fechaRechazo`]: new Date().toISOString()
  });
  await DB.saveNotif({
    id: 'n_doc_rj_' + Date.now(), pasId: uid,
    msg: `❌ Tu ${label} fue rechazado. Motivo: "${motivo}". Por favor sube un nuevo documento.`,
    leida: false, fecha: new Date().toISOString(), tipo: 'documento'
  });
  toast('Documento rechazado', 'err');
  await cargarDocumentos();
}

async function solicitarRenovacion(uid, key, label) {
  await DB.updateDocs(uid, { [`${key}.est`]: 'pendiente' });
  await DB.saveNotif({
    id: 'n_doc_ren_' + Date.now(), pasId: uid,
    msg: `🔄 El admin solicita que actualices tu ${label}. Por favor sube la versión vigente.`,
    leida: false, fecha: new Date().toISOString(), tipo: 'documento'
  });
  toast('Renovación solicitada', 'ok');
  await cargarDocumentos();
}

// ── ARRANQUE ──────────────────────────────────────
window.addEventListener('load', () => {
  if (localStorage.getItem('tt_theme') === 'light') {
    document.body.classList.add('light');
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = '☀️';
  }
  // El login del admin se maneja desde adminLogin() en admin.html
  // No usar onAuthStateChanged aquí para evitar conflictos con el SDK de auth
});
