// ── MÓDULO DE DOCUMENTOS DEL CONDUCTOR ──────────────────────────────────
// Subida a Cloudinary, estados, fechas de vencimiento, alertas
// Cloudinary: upload preset 'tutaxi_docs' (unsigned), cloud name configurado abajo

//const CLOUDINARY_CLOUD = 'tutaxi';        // ← Cambiar por tu cloud name de Cloudinary
//const CLOUDINARY_PRESET = 'tutaxi_docs';  // ← Cambiar por tu upload preset (unsigned)

const CLOUDINARY_CLOUD = 'deuj7qpq1';        // ← Cambiar por tu cloud name de Cloudinary
const CLOUDINARY_PRESET = 'tutaxi';  // ← Cambiar por tu upload preset (unsigned)

// Días permitidos para subir documentos desde el registro
const DIAS_SUBIR   = 5;
// Días para que el admin valide desde que se suben
const DIAS_VALIDAR = 7;

// Definición de documentos requeridos
const DOCS_REQUERIDOS = [
  { key: 'ine',        label: 'INE / Identificación oficial',     icono: '🪪', vence: true  },
  { key: 'licencia',   label: 'Licencia de conducir',             icono: '📋', vence: true  },
  { key: 'circulacion',label: 'Tarjeta de circulación',           icono: '🚗', vence: true  },
  { key: 'domicilio',  label: 'Comprobante de domicilio',         icono: '🏠', vence: false },
  { key: 'tarjeton',   label: 'Tarjetón del taxi',                icono: '🏷️', vence: true  },
  { key: 'num_taxi',   label: 'Número de taxi (placa/concesión)', icono: '🔢', vence: false },
  { key: 'permiso',    label: 'Permiso de Instituto de Transporte',icono: '📄', vence: true  },
];

// Estados posibles por documento
// pendiente | subido | aprobado | rechazado | vencido

let _docsData   = null; // datos actuales del conductor
let _docsStop   = null; // listener Firebase

// ── Inicializar módulo para el conductor ──────────────────────────────────
function initDocs() {
  if (!me || me.rol !== 'chofer') return;
  _docsStop = DB.onDocs(me.id, datos => {
    _docsData = datos;
    _renderDocsPanel(datos);
    _verificarPlazosDocs(datos);
  });
}

function detenerDocs() {
  if (_docsStop) { _docsStop(); _docsStop = null; }
}

// ── Render del panel de documentos en el perfil ───────────────────────────
function _renderDocsPanel(datos) {
  const wrap = document.getElementById('docs-panel');
  if (!wrap) return;

  const fechaRegistro = me.fechaRegistro ? new Date(me.fechaRegistro) : new Date();
  const diasTranscurridos = Math.floor((Date.now() - fechaRegistro) / 86400000);
  const diasRestantesSubir = Math.max(0, DIAS_SUBIR - diasTranscurridos);
  const todoSubido = DOCS_REQUERIDOS.every(d => datos && datos[d.key]?.url);
  const todoAprobado = DOCS_REQUERIDOS.every(d => datos && datos[d.key]?.est === 'aprobado');

  let headerHtml = '';
  if (todoAprobado) {
    headerHtml = `<div class="docs-status ok">✅ Documentos verificados</div>`;
  } else if (diasRestantesSubir > 0 && !todoSubido) {
    headerHtml = `<div class="docs-status warn">⏳ Tienes ${diasRestantesSubir} día${diasRestantesSubir !== 1 ? 's' : ''} para subir tus documentos</div>`;
  } else if (!todoSubido) {
    headerHtml = `<div class="docs-status err">⚠️ Plazo vencido — Documentos pendientes. Tu cuenta puede ser bloqueada.</div>`;
  } else {
    headerHtml = `<div class="docs-status info">🔍 Documentos en revisión por el administrador</div>`;
  }

  const rows = DOCS_REQUERIDOS.map(doc => {
    const d   = datos?.[doc.key] || {};
    const est = d.est || 'pendiente';
    const pillMap = {
      pendiente:  { cls: 'pill-gray',    txt: 'Pendiente' },
      subido:     { cls: 'pill-blue',    txt: 'En revisión' },
      aprobado:   { cls: 'pill-green',   txt: 'Aprobado ✓' },
      rechazado:  { cls: 'pill-red',     txt: 'Rechazado' },
      vencido:    { cls: 'pill-orange',  txt: 'Vencido' },
    };
    const pill = pillMap[est] || pillMap.pendiente;

    // Alerta de vencimiento próximo
    let venceHtml = '';
    if (doc.vence && d.fechaVence) {
      const dv = new Date(d.fechaVence);
      const diasVence = Math.floor((dv - Date.now()) / 86400000);
      if (diasVence <= 30 && diasVence > 0) {
        venceHtml = `<div class="doc-vence warn">Vence en ${diasVence} días</div>`;
      } else if (diasVence <= 0) {
        venceHtml = `<div class="doc-vence err">Vencido</div>`;
      } else {
        venceHtml = `<div class="doc-vence ok">Vence: ${dv.toLocaleDateString('es-MX')}</div>`;
      }
    }

    // Motivo de rechazo
    const motivoHtml = est === 'rechazado' && d.motivo
      ? `<div class="doc-motivo">❌ ${d.motivo}</div>` : '';

    // Miniatura si ya subió
    const thumbHtml = d.url
      ? `<a href="${d.url}" target="_blank"><img src="${d.url}" class="doc-thumb" alt="${doc.label}"></a>` : '';

    return `
      <div class="doc-row" id="doc-row-${doc.key}">
        <div class="doc-info">
          <span class="doc-ico">${doc.icono}</span>
          <div class="doc-meta">
            <div class="doc-label">${doc.label}</div>
            ${venceHtml}${motivoHtml}
          </div>
          ${thumbHtml}
        </div>
        <div class="doc-actions">
          <span class="pill ${pill.cls}">${pill.txt}</span>
          <button class="btn-doc-upload" onclick="seleccionarDoc('${doc.key}','${doc.label}',${doc.vence})">
            ${d.url ? '🔄 Actualizar' : '📤 Subir'}
          </button>
        </div>
      </div>`;
  }).join('');

  wrap.innerHTML = `
    ${headerHtml}
    <div class="docs-list">${rows}</div>
    <input type="file" id="doc-file-input" accept="image/*,application/pdf" style="display:none;"
      onchange="subirDoc(this)">`;
}

// ── Seleccionar documento para subir ─────────────────────────────────────
let _docActual = null;
function seleccionarDoc(key, label, vence) {
  _docActual = { key, label, vence };
  document.getElementById('doc-file-input').click();
}

// ── Subir documento a Cloudinary ─────────────────────────────────────────
async function subirDoc(input) {
  if (!input.files[0] || !_docActual) return;
  const file = input.files[0];
  input.value = '';

  // Pedir fecha de vencimiento si aplica
  let fechaVence = null;
  if (_docActual.vence) {
    fechaVence = await _pedirFechaVencimiento(_docActual.label);
    if (fechaVence === false) return; // canceló
  }

  toast(`Subiendo ${_docActual.label}...`);

  try {
    // Subir a Cloudinary
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', CLOUDINARY_PRESET);
    fd.append('folder', `tutaxi/docs/${me.id}`);

    const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/auto/upload`, {
      method: 'POST', body: fd
    });
    const data = await res.json();

    if (!data.secure_url) throw new Error('Sin URL');

    // Guardar en Firebase
    const docData = {
      url:        data.secure_url,
      est:        'subido',
      fechaSubida: new Date().toISOString(),
      fechaVence:  fechaVence || null,
      motivo:      null,
    };

    await DB.updateDocs(me.id, { [_docActual.key]: docData });

    // Notificar al admin
    await DB.saveNotif({
      id:    'n_doc_' + Date.now(),
      pasId: 'admin',
      msg:   `📄 ${me.nom} ${me.ape || ''} subió: ${_docActual.label}`,
      leida: false,
      fecha: new Date().toISOString(),
      tipo:  'documento',
    });

    toast(`✅ ${_docActual.label} subido correctamente`, 'ok');
  } catch(e) {
    console.error('Error subiendo doc:', e);
    toast('Error al subir el documento. Intenta de nuevo.', 'err');
  }
}

// ── Modal para fecha de vencimiento ──────────────────────────────────────
function _pedirFechaVencimiento(label) {
  return new Promise(resolve => {
    const prev = document.getElementById('modal-fecha-vence');
    if (prev) prev.remove();

    const modal = document.createElement('div');
    modal.id = 'modal-fecha-vence';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:6000;display:flex;align-items:center;justify-content:center;padding:1.5rem;';

    const inner = document.createElement('div');
    inner.style.cssText = 'background:#1a1a2e;border-radius:16px;padding:1.5rem;width:100%;max-width:340px;';
    inner.innerHTML = `
      <div style="font-size:1rem;font-weight:700;margin-bottom:.3rem;">📅 Fecha de vencimiento</div>
      <div style="font-size:.82rem;color:rgba(255,255,255,.5);margin-bottom:1rem;">${label}</div>
      <input type="date" id="fecha-vence-input" class="form-input"
        min="${new Date().toISOString().split('T')[0]}"
        style="margin-bottom:1rem;width:100%;">
      <div style="display:flex;gap:.6rem;">
        <button id="btn-fv-ok" style="flex:2;background:#f5c518;color:#000;border:none;border-radius:10px;padding:.7rem;font-weight:700;cursor:pointer;">Confirmar</button>
        <button id="btn-fv-cancel" style="flex:1;background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:.7rem;cursor:pointer;">Cancelar</button>
      </div>`;

    modal.appendChild(inner);
    document.body.appendChild(modal);

    document.getElementById('btn-fv-ok').onclick = () => {
      const val = document.getElementById('fecha-vence-input').value;
      if (!val) { toast('Selecciona una fecha', 'err'); return; }
      modal.remove();
      resolve(val);
    };
    document.getElementById('btn-fv-cancel').onclick = () => {
      modal.remove();
      resolve(false);
    };
  });
}

// ── Verificar plazos y bloquear si aplica ────────────────────────────────
async function _verificarPlazosDocs(datos) {
  if (!me || me.rol !== 'chofer') return;

  const fechaRegistro  = me.fechaRegistro ? new Date(me.fechaRegistro) : new Date();
  const diasRegistrado = Math.floor((Date.now() - fechaRegistro) / 86400000);
  const todoSubido     = DOCS_REQUERIDOS.every(d => datos?.[d.key]?.url);
  const todoAprobado   = DOCS_REQUERIDOS.every(d => datos?.[d.key]?.est === 'aprobado');

  if (todoAprobado) return; // todo bien

  // Verificar vencimiento de documentos aprobados
  if (datos) {
    for (const doc of DOCS_REQUERIDOS) {
      const d = datos[doc.key];
      if (d?.est === 'aprobado' && d.fechaVence) {
        const diasVence = Math.floor((new Date(d.fechaVence) - Date.now()) / 86400000);
        if (diasVence <= 30 && diasVence > 0) {
          // Alerta de vencimiento próximo
          await DB.saveNotif({
            id:    `n_vence_${doc.key}_${Date.now()}`,
            pasId: me.id,
            msg:   `⚠️ Tu ${doc.label} vence en ${diasVence} días. Actualízalo pronto.`,
            leida: false,
            fecha: new Date().toISOString(),
            tipo:  'vencimiento',
          });
        } else if (diasVence <= 0) {
          await DB.updateDocs(me.id, { [`${doc.key}.est`]: 'vencido' });
        }
      }
    }
  }

  // Bloquear si pasaron 5 días y no subió documentos
  if (diasRegistrado > DIAS_SUBIR && !todoSubido && me.estatus !== 'bloqueado') {
    await DB.updateUser(me.id, { estatus: 'bloqueado', motivoBloqueo: 'Documentos no subidos en el plazo de 5 días' });
    toast('⚠️ Tu cuenta fue bloqueada por no subir tus documentos a tiempo', 'err');
    return;
  }

  // Bloquear si subió documentos pero el admin no validó en 7 días
  if (todoSubido && !todoAprobado && datos) {
    const ultimaSubida = Math.max(...DOCS_REQUERIDOS.map(d =>
      datos[d.key]?.fechaSubida ? new Date(datos[d.key].fechaSubida).getTime() : 0
    ));
    const diasSinValidar = Math.floor((Date.now() - ultimaSubida) / 86400000);
    if (diasSinValidar > DIAS_VALIDAR && me.estatus !== 'bloqueado') {
      await DB.updateUser(me.id, { estatus: 'bloqueado', motivoBloqueo: 'Documentos sin validar en 7 días' });
      toast('⚠️ Tu cuenta fue bloqueada. Contacta al administrador.', 'err');
    }
  }
}

// ── Estilos ────────────────────────────────────────────────────────────────
function _inyectarEstilosDocs() {
  if (document.getElementById('docs-styles')) return;
  const s = document.createElement('style');
  s.id = 'docs-styles';
  s.textContent = `
    #docs-panel { margin-top: 1rem; }
    .docs-status { border-radius: 10px; padding: .65rem 1rem; font-size: .83rem; font-weight: 600; margin-bottom: 1rem; }
    .docs-status.ok   { background: rgba(34,197,94,.12);  color: #22c55e; border: 1px solid rgba(34,197,94,.25); }
    .docs-status.warn { background: rgba(234,179,8,.12);  color: #eab308; border: 1px solid rgba(234,179,8,.25); }
    .docs-status.err  { background: rgba(239,68,68,.12);  color: #ef4444; border: 1px solid rgba(239,68,68,.25); }
    .docs-status.info { background: rgba(99,102,241,.12); color: #818cf8; border: 1px solid rgba(99,102,241,.25); }
    .docs-list { display: flex; flex-direction: column; gap: .6rem; }
    .doc-row { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: .8rem 1rem; }
    .doc-info { display: flex; align-items: center; gap: .75rem; margin-bottom: .5rem; }
    .doc-ico  { font-size: 1.4rem; flex-shrink: 0; }
    .doc-meta { flex: 1; }
    .doc-label { font-size: .88rem; font-weight: 600; }
    .doc-vence { font-size: .72rem; margin-top: .15rem; }
    .doc-vence.ok   { color: rgba(255,255,255,.4); }
    .doc-vence.warn { color: #eab308; }
    .doc-vence.err  { color: #ef4444; }
    .doc-motivo { font-size: .72rem; color: #ef4444; margin-top: .15rem; }
    .doc-thumb  { width: 40px; height: 40px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(255,255,255,.15); }
    .doc-actions { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
    .btn-doc-upload { background: rgba(245,197,24,.1); border: 1px solid rgba(245,197,24,.25); color: #f5c518; border-radius: 8px; padding: .4rem .75rem; font-size: .78rem; cursor: pointer; white-space: nowrap; }
    .btn-doc-upload:hover { background: rgba(245,197,24,.2); }
    .pill { font-size: .7rem; font-weight: 700; padding: .25rem .65rem; border-radius: 100px; white-space: nowrap; }
    .pill-gray   { background: rgba(255,255,255,.08); color: rgba(255,255,255,.5); }
    .pill-blue   { background: rgba(99,102,241,.15);  color: #818cf8; }
    .pill-green  { background: rgba(34,197,94,.15);   color: #22c55e; }
    .pill-red    { background: rgba(239,68,68,.15);   color: #ef4444; }
    .pill-orange { background: rgba(249,115,22,.15);  color: #fb923c; }
  `;
  document.head.appendChild(s);
}

// Auto-inicializar estilos
_inyectarEstilosDocs();
