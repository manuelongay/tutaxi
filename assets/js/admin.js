/* ============================================================
   tuTaxi — admin.js
   Lógica del panel administrativo
   ============================================================ */

// ── ESTADO ─────────────────────────────────────────
let adminLoggedIn = false;
let adminMap = null;
let adminMarkers = {};
let usersFilter = 'all', usersSearch = '';
let driversFilter = 'all';
let passengersFilter = 'all';

const ADMIN = { user: 'admin', pass: 'admin123' };

// ── LOGIN ──────────────────────────────────────────
function adminLogin(){
  const u=document.getElementById('admin-user').value.trim();
  const p=document.getElementById('admin-pass').value;
  if(u===ADMIN.user&&p===ADMIN.pass){
    document.getElementById('view-login').style.display='none';
    document.getElementById('main-content').style.display='block'; 
    adminLoggedIn=true;
    refreshAll();
    // Escuchar cambios en tiempo real
    DB.onUsers(users=>{ if(adminLoggedIn) renderAll(users); });
    DB.onRides(rides=>{ if(adminLoggedIn) renderRidesLive(rides); });
  } else {
    showToast('Credenciales incorrectas','error');
  }
}

function adminLogout(){
  adminLoggedIn=false;
  document.getElementById('view-login').style.display='flex';
}

// ── REFRESH ────────────────────────────────────────
async function refreshAll(){
  const users = await DB.getUsers();
  const rides = await DB.getRides();
  renderAll(users, rides);
}

function renderAll(users, rides){
  const choferes  = users.filter(u=>u.rol==='chofer');
  const pasajeros = users.filter(u=>u.rol==='pasajero');

  // Badges
  document.getElementById('badge-users').textContent       = users.length;
  document.getElementById('badge-drivers').textContent     = choferes.length;
  document.getElementById('badge-passengers').textContent  = pasajeros.length;

  // Stats
  const statTotal = document.getElementById('stat-total');
  const statChof  = document.getElementById('stat-choferes');
  const statPas   = document.getElementById('stat-pasajeros');
  if(statTotal) statTotal.textContent = users.length;
  if(statChof)  statChof.textContent  = choferes.length;
  if(statPas)   statPas.textContent   = pasajeros.length;

  renderRecentUsers(users);
  renderAllUsers(users);
  renderPassengers(pasajeros);
  renderDrivers(choferes);
}

function renderRidesLive(rides){
  allRidesCache = rides;
  const pendientes = rides.filter(r=>r.est==='pendiente').length;
  const badgeRides = document.getElementById('badge-rides');
  if(badgeRides) badgeRides.textContent = pendientes;
  const statRides = document.getElementById('stat-rides');
  if(statRides) statRides.textContent = rides.length;
  // Respetar filtro activo al actualizar
  const activeTab = document.querySelector('#view-rides .filter-tab.active');
  const estado = activeTab?.getAttribute('onclick')?.match(/'(\w+)'/)?.[1] || 'all';
  const filtrados = estado === 'all' ? rides : rides.filter(r => r.est === estado);
  renderRides(filtrados);
}

// ── VISTAS ─────────────────────────────────────────
const viewTitles = {
  dashboard:'Dashboard', users:'Usuarios', passengers:'Pasajeros',
  drivers:'Choferes', rides:'Viajes', mapa:'🗺️ Mapa en vivo', tarifas:'💲 Tarifas',
};

function showView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  document.getElementById('topbar-title').textContent = viewTitles[name]||name;
  document.querySelectorAll('.nav-item').forEach(item=>{
    if(item.getAttribute('onclick')?.includes(`'${name}'`)) item.classList.add('active');
  });
  if(name==='mapa') setTimeout(()=>{initAdminMap();actualizarMapaAdmin();},200);
}

// ── HELPERS TABLA ──────────────────────────────────
function statusBadge(e){ return `<span class="badge badge-${e}">${e==='activo'?'● Activo':'✕ Bloqueado'}</span>`; }
function rideBadge(s){ const icons={pendiente:'⏳',aceptado:'🚗',completado:'✓',cancelado:'✕'}; return `<span class="badge badge-${s}">${icons[s]||''} ${s}</span>`; }
function rolBadge(r){ return `<span class="badge badge-${r}">${r==='chofer'?'🚗 Chofer':'👤 Pasajero'}</span>`; }
function emptyRow(msg){ return `<tr><td colspan="10" class="empty"><div class="empty-icon">📭</div><div class="empty-title">${msg}</div></td></tr>`; }

// ── USUARIOS RECIENTES ─────────────────────────────
function renderRecentUsers(users){
  const el=document.getElementById('recent-users-table');
  if(!el) return;
  const recent=[...users].sort((a,b)=>new Date(b.fechaRegistro||b.fecha)-new Date(a.fechaRegistro||a.fecha)).slice(0,8);
  if(!recent.length){el.innerHTML=`<table><tbody>${emptyRow('Sin usuarios registrados aún')}</tbody></table>`;return;}
  el.innerHTML=`<table>
    <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Registro</th><th></th></tr></thead>
    <tbody>${recent.map(u=>userRow(u)).join('')}</tbody></table>`;
}

function userRow(u){
  return `<tr>
    <td><strong>${u.nombre||u.nom||'—'} ${u.apellido||u.ape||''}</strong></td>
    <td>${u.email}</td>
    <td>${rolBadge(u.rol)}</td>
    <td>${statusBadge(u.estatus||'activo')}</td>
    <td>${new Date(u.fechaRegistro||u.fecha).toLocaleDateString('es-MX')}</td>
    <td><button class="btn btn-sm btn-info" onclick="showUserDetail('${u.id}')">Ver</button></td>
  </tr>`;
}

// ── TODOS LOS USUARIOS ─────────────────────────────
async function renderAllUsers(users){
  const el=document.getElementById('all-users-table');
  if(!el) return;
  let filtered=users;
  if(usersFilter!=='all') filtered=filtered.filter(u=>u.estatus===usersFilter);
  if(usersSearch){
    const q=usersSearch.toLowerCase();
    filtered=filtered.filter(u=>(u.nombre||u.nom||'').toLowerCase().includes(q)||u.email.toLowerCase().includes(q)||(u.apellido||u.ape||'').toLowerCase().includes(q));
  }
  if(!filtered.length){el.innerHTML=`<table><tbody>${emptyRow('Sin usuarios')}</tbody></table>`;return;}
  el.innerHTML=`<table>
    <thead><tr><th>Nombre</th><th>Correo</th><th>Teléfono</th><th>Rol</th><th>Estado</th><th>Registro</th><th>Acciones</th></tr></thead>
    <tbody>${filtered.map(u=>`<tr>
      <td><strong>${u.nombre||u.nom||'—'} ${u.apellido||u.ape||''}</strong></td>
      <td>${u.email}</td>
      <td>${u.tel||u.telefono||'—'}</td>
      <td>${rolBadge(u.rol)}</td>
      <td>${statusBadge(u.estatus||'activo')}</td>
      <td>${new Date(u.fechaRegistro||u.fecha).toLocaleDateString('es-MX')}</td>
      <td style="display:flex;gap:.4rem;">
        <button class="btn btn-sm btn-info" onclick="showUserDetail('${u.id}')">Ver</button>
        ${u.estatus==='activo'
          ?`<button class="btn btn-sm btn-danger" onclick="toggleUserStatus('${u.id}','bloqueado')">Bloquear</button>`
          :`<button class="btn btn-sm btn-success" onclick="toggleUserStatus('${u.id}','activo')">Activar</button>`}
      </td>
    </tr>`).join('')}</tbody></table>`;
}

function filterUsers(val){
  usersFilter=val;
  document.querySelectorAll('#view-users .filter-tab').forEach(b=>b.classList.remove('active'));
  event.target.classList.add('active');
  DB.getUsers().then(renderAllUsers);
}

function searchUsers(q){
  usersSearch=q;
  DB.getUsers().then(renderAllUsers);
}

// ── PASAJEROS ──────────────────────────────────────
function renderPassengers(pasajeros){
  const el=document.getElementById('passengers-table');
  if(!el) return;
  let filtered=pasajeros;
  if(passengersFilter!=='all') filtered=filtered.filter(u=>u.estatus===passengersFilter);
  if(!filtered.length){el.innerHTML=`<table><tbody>${emptyRow('Sin pasajeros registrados')}</tbody></table>`;return;}
  el.innerHTML=`<table>
    <thead><tr><th>Nombre</th><th>Correo</th><th>Teléfono</th><th>Estado</th><th>Registro</th><th>Acciones</th></tr></thead>
    <tbody>${filtered.map(u=>`<tr>
      <td><strong>${u.nombre||u.nom||'—'} ${u.apellido||u.ape||''}</strong></td>
      <td>${u.email}</td>
      <td>${u.tel||u.telefono||'—'}</td>
      <td>${statusBadge(u.estatus||'activo')}</td>
      <td>${new Date(u.fechaRegistro||u.fecha).toLocaleDateString('es-MX')}</td>
      <td style="display:flex;gap:.4rem;">
        <button class="btn btn-sm btn-info" onclick="showUserDetail('${u.id}')">Ver</button>
        ${u.estatus==='activo'
          ?`<button class="btn btn-sm btn-danger" onclick="toggleUserStatus('${u.id}','bloqueado')">Bloquear</button>`
          :`<button class="btn btn-sm btn-success" onclick="toggleUserStatus('${u.id}','activo')">Activar</button>`}
      </td>
    </tr>`).join('')}</tbody></table>`;
}

// ── CHOFERES ───────────────────────────────────────
function renderDrivers(drivers){
  const el=document.getElementById('drivers-table');
  if(!el) return;
  let filtered=drivers;
  if(driversFilter!=='all') filtered=filtered.filter(u=>(u.estatusChofer||'activo')===driversFilter);
  if(!filtered.length){el.innerHTML=`<table><tbody>${emptyRow('Sin choferes registrados')}</tbody></table>`;return;}
  el.innerHTML=`<table>
    <thead><tr><th>Nombre</th><th>Correo</th><th>Vehículo</th><th>Placas</th><th>Est. cuenta</th><th>Est. chofer</th><th>Acciones</th></tr></thead>
    <tbody>${filtered.map(u=>`<tr>
      <td><strong>${u.nombre||u.nom||'—'} ${u.apellido||u.ape||''}</strong></td>
      <td>${u.email}</td>
      <td>${u.vehiculo||u.veh||'—'}</td>
      <td>${u.placas||u.pla||'—'}</td>
      <td>${statusBadge(u.estatus||'activo')}</td>
      <td>${statusBadge(u.estatusChofer||'activo')}</td>
      <td style="display:flex;gap:.4rem;flex-wrap:wrap;">
        <button class="btn btn-sm btn-info" onclick="showUserDetail('${u.id}')">Ver</button>
        ${u.estatus==='activo'
          ?`<button class="btn btn-sm btn-danger" onclick="toggleUserStatus('${u.id}','bloqueado')">Bloquear</button>`
          :`<button class="btn btn-sm btn-success" onclick="toggleUserStatus('${u.id}','activo')">Activar</button>`}
      </td>
    </tr>`).join('')}</tbody></table>`;
}

function filterDrivers(val){
  driversFilter=val;
  document.querySelectorAll('#view-drivers .filter-tab').forEach(b=>b.classList.remove('active'));
  event.target.classList.add('active');
  DB.getUsers().then(users=>renderDrivers(users.filter(u=>u.rol==='chofer')));
}

// ── VIAJES ─────────────────────────────────────────
// ── FILTRO DE VIAJES ──────────────────────────────
let allRidesCache = [];

function filterRides(estado, btn) {
  document.querySelectorAll('#view-rides .filter-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const filtrados = estado === 'all' ? allRidesCache : allRidesCache.filter(r => r.est === estado);
  renderRides(filtrados);
}

function renderRides(rides){
  const el=document.getElementById('rides-table');
  if(!el) return;
  const sorted=[...rides].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  if(!sorted.length){el.innerHTML=`<table><tbody>${emptyRow('Sin viajes registrados')}</tbody></table>`;return;}
  el.innerHTML=`<table>
    <thead><tr><th>Fecha</th><th>Pasajero</th><th>Chofer</th><th>Origen</th><th>Destino</th><th>Precio</th><th>Estado</th></tr></thead>
    <tbody>${sorted.map(r=>`<tr>
      <td>${new Date(r.fecha).toLocaleDateString('es-MX')}</td>
      <td>${r.pasNom||'—'}</td>
      <td>${r.chofNom||'—'}</td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.origen}">${r.origen}</td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.destino}">${r.destino}</td>
      <td><strong>$${r.precio}</strong></td>
      <td>${rideBadge(r.est)}</td>
    </tr>`).join('')}</tbody></table>`;
}

// ── DETALLE USUARIO ────────────────────────────────
async function showUserDetail(id){
  const u = await DB.getUser(id);
  if(!u) return;
  document.getElementById('modal-title').textContent=(u.nombre||u.nom||'—')+' '+(u.apellido||u.ape||'');
  document.getElementById('modal-body').innerHTML=`
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;">
      <div style="width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.4rem;color:var(--black);">
        ${u.foto?`<img src="${u.foto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`:(((u.nombre||u.nom||'?')[0])+((u.apellido||u.ape||'')[0]||'')).toUpperCase()}
      </div>
      <div><div style="font-weight:700;font-size:1.1rem;">${u.nombre||u.nom||'—'} ${u.apellido||u.ape||''}</div><div style="color:var(--gray3);font-size:.85rem;">${rolBadge(u.rol)}</div></div>
    </div>
    <div class="info-row"><span class="info-key">Correo</span><span class="info-val">${u.email}</span></div>
    <div class="info-row"><span class="info-key">Teléfono</span><span class="info-val">${u.tel||u.telefono||'—'}</span></div>
    <div class="info-row"><span class="info-key">Estado</span><span class="info-val">${statusBadge(u.estatus||'activo')}</span></div>
    <div class="info-row"><span class="info-key">Registro</span><span class="info-val">${new Date(u.fechaRegistro||u.fecha).toLocaleDateString('es-MX')}</span></div>
    ${u.rol==='chofer'?`
    <div class="info-row"><span class="info-key">Vehículo</span><span class="info-val">${u.vehiculo||u.veh||'—'}</span></div>
    <div class="info-row"><span class="info-key">Placas</span><span class="info-val">${u.placas||u.pla||'—'}</span></div>
    <div class="info-row"><span class="info-key">Color</span><span class="info-val">${u.color||u.col||'—'}</span></div>
    <div class="info-row"><span class="info-key">Licencia</span><span class="info-val">${u.licencia||u.lic||'—'}</span></div>`:''}`;
  document.getElementById('modal-actions').innerHTML=
    u.estatus==='activo'
      ?`<button class="btn btn-danger" onclick="toggleUserStatus('${u.id}','bloqueado');closeModal()">Bloquear usuario</button>`
      :`<button class="btn btn-success" onclick="toggleUserStatus('${u.id}','activo');closeModal()">Activar usuario</button>`;
  document.getElementById('user-modal').classList.add('open');
}

function closeModal(){ document.getElementById('user-modal').classList.remove('open'); }

async function toggleUserStatus(id,status){
  await DB.updateUser(id,{estatus:status});
  showToast(status==='activo'?'Usuario activado ✅':'Usuario bloqueado 🔒', status==='activo'?'success':'error');
  refreshAll();
}

// ── MAPA ADMIN ─────────────────────────────────────
function initAdminMap(){
  if(adminMap!==null){adminMap.invalidateSize();return;}
  adminMap=L.map('admin-map',{center:[19.4326,-99.1332],zoom:12,zoomControl:true});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:19}).addTo(adminMap);
}

function iconoAdminVehiculo(conPasaje){
  const color=conPasaje?'#ef4444':'#cccccc';
  const sombra=conPasaje?'rgba(239,68,68,.6)':'rgba(150,150,150,.4)';
  return L.divIcon({
    html:`<div style="position:relative;filter:drop-shadow(0 2px 8px ${sombra});">
      <svg viewBox="0 0 64 64" width="38" height="38" xmlns="http://www.w3.org/2000/svg">
        <rect x="8" y="28" width="48" height="20" rx="6" fill="${color}"/>
        <path d="M18 28 L22 14 L42 14 L46 28 Z" fill="${color}" opacity=".85"/>
        <path d="M23 27 L26 16 L38 16 L41 27 Z" fill="#cceeff" opacity=".7"/>
        <circle cx="18" cy="48" r="7" fill="#222"/><circle cx="18" cy="48" r="3.5" fill="#888"/>
        <circle cx="46" cy="48" r="7" fill="#222"/><circle cx="46" cy="48" r="3.5" fill="#888"/>
        <rect x="8" y="32" width="5" height="4" rx="1" fill="#fff9"/>
        <rect x="51" y="32" width="5" height="4" rx="1" fill="#ff09"/>
      </svg>
      <div style="position:absolute;top:-4px;right:-4px;width:12px;height:12px;border-radius:50%;background:${conPasaje?'#ef4444':'#22c55e'};border:2px solid #000;"></div>
    </div>`,
    className:'',iconSize:[38,38],iconAnchor:[19,38],
  });
}

async function actualizarMapaAdmin(){
  if(!adminMap) return;
  const users = await DB.getUsers();
  const rides = await DB.getRides();
  const choferes=users.filter(u=>u.rol==='chofer'&&u.estatus==='activo'&&u.lastLat);
  let online=0,ocupados=0,libres=0;
  const bounds=[];
  let listaHTML='';

  choferes.forEach(chofer=>{
    const tieneViaje=rides.some(r=>r.chofId===chofer.id&&r.est==='aceptado');
    const lat=chofer.lastLat,lng=chofer.lastLng;
    const segs=chofer.lastUpdate?Math.round((Date.now()-chofer.lastUpdate)/1000):null;
    if(segs!==null&&segs>1800) return;
    online++; if(tieneViaje) ocupados++; else libres++;
    bounds.push([lat,lng]);

    if(adminMarkers[chofer.id]){
      adminMarkers[chofer.id].setLatLng([lat,lng]);
      adminMarkers[chofer.id].setIcon(iconoAdminVehiculo(tieneViaje));
    } else {
      const m=L.marker([lat,lng],{icon:iconoAdminVehiculo(tieneViaje),zIndexOffset:200}).addTo(adminMap);
      m.bindPopup(`<div style="min-width:180px;"><div style="font-weight:700;margin-bottom:.3rem;">🚗 ${chofer.nombre||chofer.nom} ${chofer.apellido||chofer.ape||''}</div><div style="font-size:.8rem;color:#666;">${chofer.vehiculo||chofer.veh||'—'} | ${chofer.placas||chofer.pla||'—'}</div><div style="margin-top:.5rem;font-size:.8rem;">Estado: <strong style="color:${tieneViaje?'#ef4444':'#22c55e'}">${tieneViaje?'🔴 Con pasaje':'🟢 Disponible'}</strong></div></div>`);
      adminMarkers[chofer.id]=m;
    }

    listaHTML+=`<div class="chofer-online-card" onclick="adminMarkers['${chofer.id}']&&adminMap.setView([${lat},${lng}],16)">
      <div class="chofer-status-dot" style="background:${tieneViaje?'#ef4444':'#22c55e'};box-shadow:0 0 6px ${tieneViaje?'#ef4444':'#22c55e'};"></div>
      <div style="flex:1;"><div style="font-weight:600;font-size:.9rem;">${chofer.nombre||chofer.nom} ${chofer.apellido||chofer.ape||''}</div><div style="font-size:.78rem;color:var(--gray3);">${chofer.vehiculo||chofer.veh||'—'} | ${chofer.placas||chofer.pla||'—'}</div></div>
      <div style="text-align:right;"><div style="font-size:.8rem;font-weight:700;color:${tieneViaje?'#ef4444':'#22c55e'}">${tieneViaje?'Con pasaje':'Disponible'}</div>${segs!==null?`<div style="font-size:.72rem;color:var(--gray3);">hace ${segs}s</div>`:''}</div>
    </div>`;
  });

  const el=n=>document.getElementById(n);
  if(el('map-stat-online'))   el('map-stat-online').textContent=online;
  if(el('map-stat-ocupados')) el('map-stat-ocupados').textContent=ocupados;
  if(el('map-stat-libres'))   el('map-stat-libres').textContent=libres;
  if(el('badge-online'))      el('badge-online').textContent=online;
  if(bounds.length>0) adminMap.fitBounds(bounds,{padding:[60,60],maxZoom:15});
  if(el('admin-chofer-list')) el('admin-chofer-list').innerHTML=listaHTML||'<div style="text-align:center;padding:2rem;color:var(--gray3);"><div style="font-size:2rem;margin-bottom:.5rem;">📡</div><div>Ningún chofer activo</div></div>';
}

// ── TOAST ──────────────────────────────────────────
function showToast(msg,type=''){
  const el=document.getElementById('toast');
  el.textContent=msg; el.className='toast show '+type;
  setTimeout(()=>el.classList.remove('show'),3000);
}

// ── ARRANQUE ───────────────────────────────────────
window.onload=()=>{
  document.getElementById('admin-pass').addEventListener('keydown',e=>{if(e.key==='Enter')adminLogin();});
  // Auto-refresh del mapa
  setInterval(()=>{
    if(!adminLoggedIn) return;
    const mapaView=document.getElementById('view-mapa');
    if(mapaView&&mapaView.classList.contains('active')) actualizarMapaAdmin();
  },5000);
};

/* ============================================================
   TARIFAS
   ============================================================ */

async function cargarTarifas() {
  const t = await DB.getTarifas();
  document.getElementById('tar-porKm').value       = t.porKm       ?? 9;
  document.getElementById('tar-minima').value      = t.minima      ?? 30;
  document.getElementById('tar-kmIncluidos').value = t.kmIncluidos ?? 3;
  document.getElementById('tar-nocturna').value   = t.nocturna   ?? 1.3;
  document.getElementById('tar-horaInicio').value = t.horaInicio ?? 22;
  document.getElementById('tar-horaFin').value    = t.horaFin    ?? 6;
  document.getElementById('tar-espera').value      = t.espera      ?? 1;
  document.getElementById('tar-esperaActiva').checked = t.esperaActiva ?? false;
  document.getElementById('tar-radioKm').value    = t.radioKm    ?? 3;
  actualizarEjemplos(t);
}

async function guardarTarifas() {
  const t = {
    porKm:       parseFloat(document.getElementById('tar-porKm').value)       || 9,
    minima:      parseFloat(document.getElementById('tar-minima').value)      || 30,
    kmIncluidos: parseFloat(document.getElementById('tar-kmIncluidos').value) || 3,
    nocturna:   parseFloat(document.getElementById('tar-nocturna').value)   || 1.3,
    horaInicio: parseInt(document.getElementById('tar-horaInicio').value)   || 22,
    horaFin:    parseInt(document.getElementById('tar-horaFin').value)      || 6,
    espera:        parseFloat(document.getElementById('tar-espera').value) || 1,
    esperaActiva:  document.getElementById('tar-esperaActiva').checked,
    radioKm:    parseFloat(document.getElementById('tar-radioKm').value)    || 3,
  };
  await DB.saveTarifas(t);
  actualizarEjemplos(t);
  showToast('¡Tarifas actualizadas! ✅', 'success');
}

function actualizarEjemplos(t) {
  const calc = (km, min, noche) => {
    const mult    = noche ? t.nocturna : 1;
    const kmExtra = Math.max(0, km - (t.kmIncluidos || 0));
    const espera  = t.esperaActiva ? min * (t.espera || 0) : 0;
    const diurno  = Math.max(t.minima, t.minima + kmExtra * t.porKm + espera);
    const precio  = diurno * mult;
    return Math.round(precio / 5) * 5;
  };
  const ej = document.getElementById('tar-ejemplos');
  if (!ej) return;
  ej.innerHTML = `
    <div class="tar-ejemplo"><span>2 km · día</span><strong>$${calc(2, 0, false)}</strong></div>
    <div class="tar-ejemplo"><span>5 km · día</span><strong>$${calc(5, 0, false)}</strong></div>
    <div class="tar-ejemplo"><span>10 km · día</span><strong>$${calc(10, 0, false)}</strong></div>
    <div class="tar-ejemplo"><span>2 km · noche</span><strong>$${calc(2, 0, true)}</strong></div>
    <div class="tar-ejemplo"><span>5 km · noche</span><strong>$${calc(5, 0, true)}</strong></div>
    <div class="tar-ejemplo"><span>10 km · noche</span><strong>$${calc(10, 0, true)}</strong></div>`;
}
