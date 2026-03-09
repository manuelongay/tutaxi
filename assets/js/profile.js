/* ============================================================
   tuTaxi — profile.js
   Perfil editable, foto, calificaciones y ganancias
   ============================================================ */

let filtroGanancias = 'todos';
let estrellasSel    = 0;

// ── PERFIL ────────────────────────────────────────
function refrescarPerfil() {
  if (!me) return;
  const ini = (me.nom[0] + (me.ape?.[0] || '')).toUpperCase();
  const initEl = document.getElementById('prof-initials');
  if (initEl) initEl.textContent = ini;
  document.getElementById('prof-name').textContent  = me.nom + ' ' + (me.ape || '');
  document.getElementById('prof-email').textContent = me.email;
  document.getElementById('tb-name').textContent    = me.nom;
  if (me.foto) mostrarFotoPerfil(me.foto);

  document.getElementById('prof-rows').innerHTML = `
    <div class="irow"><span class="ik">Nombre</span><span class="iv">${me.nom} ${me.ape || ''}</span></div>
    <div class="irow"><span class="ik">Correo</span><span class="iv">${me.email}</span></div>
    <div class="irow"><span class="ik">Teléfono</span><span class="iv">${me.tel}</span></div>
    <div class="irow"><span class="ik">Tipo</span><span class="iv">${me.rol === 'chofer' ? '🚗 Chofer' : '👤 Pasajero'}</span></div>
    <div class="irow"><span class="ik">Desde</span><span class="iv">${new Date(me.fecha).toLocaleDateString('es-MX')}</span></div>`;

  if (me.rol === 'chofer') {
    document.getElementById('veh-card').style.display = 'block';
    document.getElementById('veh-rows').innerHTML = `
      <div class="irow"><span class="ik">Vehículo</span><span class="iv">${me.veh || '—'}</span></div>
      <div class="irow"><span class="ik">Placas</span><span class="iv">${me.pla || '—'}</span></div>
      <div class="irow"><span class="ik">Color</span><span class="iv">${me.col || '—'}</span></div>
      <div class="irow"><span class="ik">Licencia</span><span class="iv">${me.lic || '—'}</span></div>`;
  }
}

function activarEdicion() {
  document.getElementById('prof-ver').style.display    = 'none';
  document.getElementById('prof-editar').style.display = 'block';
  document.getElementById('edit-nom').value  = me.nom  || '';
  document.getElementById('edit-ape').value  = me.ape  || '';
  document.getElementById('edit-tel').value  = me.tel  || '';
  document.getElementById('edit-pass').value = '';
  if (me.rol === 'chofer') {
    document.getElementById('edit-veh-card').style.display = 'block';
    document.getElementById('edit-veh').value = me.veh || '';
    document.getElementById('edit-pla').value = me.pla || '';
    document.getElementById('edit-col').value = me.col || '';
    document.getElementById('edit-lic').value = me.lic || '';
  } else {
    document.getElementById('edit-veh-card').style.display = 'none';
  }
}

function cancelarEdicion() {
  document.getElementById('prof-ver').style.display    = 'block';
  document.getElementById('prof-editar').style.display = 'none';
}

async function guardarPerfil() {
  const nom  = document.getElementById('edit-nom').value.trim();
  const ape  = document.getElementById('edit-ape').value.trim();
  const tel  = document.getElementById('edit-tel').value.trim();
  const pass = document.getElementById('edit-pass').value;
  if (!nom || !tel) { toast('Nombre y teléfono son obligatorios', 'err'); return; }
  if (pass.length > 0 && pass.length < 6) { toast('Contraseña mínimo 6 caracteres', 'err'); return; }

  const data = { nom, ape, nombre: nom, apellido: ape, tel, telefono: tel };
  if (pass.length >= 6) data.pass = pass;

  if (me.rol === 'chofer') {
    data.veh      = document.getElementById('edit-veh').value.trim(); data.vehiculo  = data.veh;
    data.pla      = document.getElementById('edit-pla').value.trim(); data.placas    = data.pla;
    data.col      = document.getElementById('edit-col').value.trim(); data.color     = data.col;
    data.lic      = document.getElementById('edit-lic').value.trim(); data.licencia  = data.lic;
  }

  await DB.updateUser(me.id, data);
  Object.assign(me, data);
  DB.saveSession(me);
  refrescarPerfil();
  cancelarEdicion();
  toast('¡Perfil actualizado! ✅', 'ok');
}

function mostrarFotoPerfil(base64) {
  const foto = document.getElementById('prof-foto');
  const ini  = document.getElementById('prof-initials');
  if (foto && ini) { foto.src = base64; foto.style.display = 'block'; ini.style.display = 'none'; }
}

async function cambiarFoto(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { toast('La imagen no debe superar 2MB', 'err'); return; }
  const reader = new FileReader();
  reader.onload = async e => {
    const base64 = e.target.result;
    await DB.updateUser(me.id, { foto: base64 });
    me.foto = base64;
    DB.saveSession(me);
    mostrarFotoPerfil(base64);
    toast('¡Foto actualizada! 📸', 'ok');
  };
  reader.readAsDataURL(file);
}

// ── CALIFICACIÓN ──────────────────────────────────
function mostrarModalCalificacion(ride) {
  if (document.getElementById('modal-calif')) return;
  const modal = document.createElement('div');
  modal.id = 'modal-calif';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:flex-end;justify-content:center;z-index:99999;padding:1rem;backdrop-filter:blur(4px);';
  modal.innerHTML = `
    <div style="background:var(--gray);border:1px solid rgba(255,255,255,.1);border-radius:24px 24px 0 0;padding:2rem;width:100%;max-width:440px;">
      <div style="font-size:1.1rem;font-weight:700;margin-bottom:.4rem;">¿Cómo estuvo el viaje? ⭐</div>
      <div style="font-size:.85rem;color:var(--gray3);margin-bottom:1.5rem;">Califica a tu chofer: <strong style="color:var(--white);">${ride.chofNom || 'Chofer'}</strong></div>
      <div id="estrellas" style="display:flex;gap:.5rem;justify-content:center;margin-bottom:1.5rem;">
        ${[1, 2, 3, 4, 5].map(n => `<span data-n="${n}" onclick="selEstrellas(${n})" style="font-size:2.2rem;cursor:pointer;transition:transform .15s;filter:grayscale(1);opacity:.4;">⭐</span>`).join('')}
      </div>
      <textarea id="comentario-calif" placeholder="Comentario opcional..." style="width:100%;background:var(--gray2);border:1.5px solid rgba(255,255,255,.08);border-radius:10px;color:var(--white);padding:.75rem;font-size:.88rem;resize:none;height:80px;outline:none;"></textarea>
      <button onclick="enviarCalificacion('${ride.id}')" class="btn btn-primary btn-full" style="margin-top:1rem;">Enviar calificación</button>
      <button onclick="document.getElementById('modal-calif').remove()" style="width:100%;background:none;border:none;color:var(--gray3);margin-top:.8rem;cursor:pointer;font-size:.88rem;">Omitir</button>
    </div>`;
  document.body.appendChild(modal);
}

function selEstrellas(n) {
  estrellasSel = n;
  document.querySelectorAll('#estrellas span').forEach(s => {
    const sn = parseInt(s.dataset.n);
    s.style.filter    = sn <= n ? 'none' : 'grayscale(1)';
    s.style.opacity   = sn <= n ? '1' : '.4';
    s.style.transform = sn <= n ? 'scale(1.15)' : 'scale(1)';
  });
}

async function enviarCalificacion(rideId) {
  if (!estrellasSel) { toast('Selecciona una calificación', 'err'); return; }
  const comentario = document.getElementById('comentario-calif').value.trim();
  await DB.updateRide(rideId, { calificacion: estrellasSel, comentario });

  // Calcular promedio y guardarlo en el perfil del conductor
  const rides    = await DB.rides();
  const ride     = rides.find(r => r.id === rideId);
  if (ride && ride.chofId) {
    const califRides = rides.filter(r => r.chofId === ride.chofId && r.calificacion);
    // Incluir la calificación actual que acabamos de guardar
    const todasCalif = califRides.map(r => r.id === rideId ? estrellasSel : r.calificacion);
    if (!todasCalif.includes(estrellasSel)) todasCalif.push(estrellasSel);
    const prom = todasCalif.reduce((a, b) => a + b, 0) / todasCalif.length;
    await DB.updateUser(ride.chofId, {
      ratingProm:  Math.round(prom * 10) / 10,
      ratingCount: todasCalif.length,
    });
  }

  document.getElementById('modal-calif').remove();
  toast('¡Gracias por tu calificación! ' + '⭐'.repeat(estrellasSel), 'ok');
  estrellasSel = 0;
}

// ── NOTIFICACIÓN BANNER ───────────────────────────
function mostrarNotifBanner(msg) {
  let banner = document.getElementById('notif-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'notif-banner';
    banner.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);background:#1a3a1a;border:1.5px solid var(--green);border-radius:14px;padding:1rem 1.5rem;max-width:340px;width:90%;z-index:99999;box-shadow:0 8px 32px rgba(0,0,0,.6);font-size:.88rem;line-height:1.5;';
    document.body.appendChild(banner);
  }
  banner.innerHTML = `
    <div style="font-weight:700;color:var(--green);margin-bottom:.3rem;">¡Chofer en camino! 🚗</div>
    <div style="color:var(--white);">${msg}</div>
    <button onclick="this.parentElement.remove()" style="margin-top:.8rem;background:var(--green);border:none;color:#000;border-radius:8px;padding:.4rem 1rem;font-weight:700;cursor:pointer;width:100%;">Entendido</button>`;
  setTimeout(() => { if (banner.parentElement) banner.remove(); }, 8000);
}

// ── GANANCIAS ─────────────────────────────────────
async function cargarGanancias() {
  const rides  = await DB.rides();
  const todos  = rides.filter(r => r.chofId === me.id && r.est === 'completado');
  const ahora  = new Date();
  const hoy    = ahora.toDateString();
  const semana = new Date(); semana.setDate(ahora.getDate() - 7);
  const mes    = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const suma   = arr => arr.reduce((a, r) => a + r.precio, 0);

  const vH = todos.filter(r => new Date(r.fecha).toDateString() === hoy);
  const vS = todos.filter(r => new Date(r.fecha) >= semana);
  const vM = todos.filter(r => new Date(r.fecha) >= mes);

  document.getElementById('gan-hoy').textContent           = '$' + suma(vH).toLocaleString();
  document.getElementById('gan-hoy-viajes').textContent    = vH.length + ' viaje' + (vH.length !== 1 ? 's' : '');
  document.getElementById('gan-semana').textContent        = '$' + suma(vS).toLocaleString();
  document.getElementById('gan-semana-viajes').textContent = vS.length + ' viaje' + (vS.length !== 1 ? 's' : '');
  document.getElementById('gan-mes').textContent           = '$' + suma(vM).toLocaleString();
  document.getElementById('gan-mes-viajes').textContent    = vM.length + ' viaje' + (vM.length !== 1 ? 's' : '');
  document.getElementById('gan-total').textContent         = '$' + suma(todos).toLocaleString();
  document.getElementById('gan-total-viajes').textContent  = todos.length + ' viaje' + (todos.length !== 1 ? 's' : '');

  renderGrafica(todos);
  filtrarGanancias(filtroGanancias, null, todos);
}

function renderGrafica(todos) {
  const wrap   = document.getElementById('grafica-wrap');
  const labels = document.getElementById('grafica-labels');
  const dias   = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const viajes = todos.filter(r => new Date(r.fecha).toDateString() === d.toDateString());
    dias.push({ label: d.toLocaleDateString('es-MX', { weekday: 'short' }), total: viajes.reduce((a, r) => a + r.precio, 0), viajes: viajes.length });
  }
  const maxVal = Math.max(...dias.map(d => d.total), 1);
  wrap.innerHTML = dias.map(d => {
    const h = Math.max(Math.round((d.total / maxVal) * 100), d.total > 0 ? 8 : 2);
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:.3rem;" title="${d.viajes} viajes · $${d.total}">
      ${d.total > 0 ? `<div style="font-size:.65rem;color:var(--accent);font-weight:700;">$${d.total}</div>` : ''}
      <div style="width:100%;height:${h}%;min-height:4px;background:${d.total > 0 ? 'var(--accent)' : 'rgba(255,255,255,.08)'};border-radius:6px 6px 0 0;"></div>
    </div>`;
  }).join('');
  labels.innerHTML = dias.map(d => `<div style="flex:1;text-align:center;font-size:.68rem;color:var(--gray3);">${d.label}</div>`).join('');
}

function filtrarGanancias(filtro, btn, todosParam) {
  filtroGanancias = filtro;
  ['todos', 'hoy', 'semana', 'mes'].forEach(f => {
    const b = document.getElementById('fil-' + f);
    if (b) { b.style.color = f === filtro ? 'var(--accent)' : ''; b.style.borderColor = f === filtro ? 'rgba(245,197,24,.4)' : ''; }
  });
  const process = todos => {
    const ahora = new Date();
    let viajes  = todos;
    if (filtro === 'hoy')    viajes = todos.filter(r => new Date(r.fecha).toDateString() === ahora.toDateString());
    if (filtro === 'semana') { const s = new Date(); s.setDate(ahora.getDate() - 7); viajes = todos.filter(r => new Date(r.fecha) >= s); }
    if (filtro === 'mes')    viajes = todos.filter(r => new Date(r.fecha) >= new Date(ahora.getFullYear(), ahora.getMonth(), 1));
    viajes.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const el = document.getElementById('historial-ganancias');
    if (!viajes.length) { el.innerHTML = '<div class="empty"><div class="empty-icon">💸</div><div class="empty-title">Sin viajes en este período</div></div>'; return; }
    el.innerHTML = viajes.map(r => `
      <div class="ride-card" style="display:flex;align-items:center;gap:1rem;">
        <div style="font-size:1.5rem;">🚗</div>
        <div style="flex:1;">
          <div class="from-lbl">📍 ${r.origen}</div>
          <div class="to-lbl">🎯 ${r.destino}</div>
          <div style="font-size:.75rem;color:var(--gray3);margin-top:.3rem;">
            ${new Date(r.fecha).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' })}
            · ${new Date(r.fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
            ${r.calificacion ? '· ' + '⭐'.repeat(r.calificacion) : ''}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:1.2rem;font-weight:900;color:var(--green);">+$${r.precio}</div>
          <div class="status-pill s-completado" style="margin-top:.3rem;">Completado</div>
        </div>
      </div>`).join('');
  };
  if (todosParam) process(todosParam);
  else DB.rides().then(rides => process(rides.filter(r => r.chofId === me.id && r.est === 'completado')));
}
