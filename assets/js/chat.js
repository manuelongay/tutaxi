// ── CHAT EN TIEMPO REAL ──────────────────────────────────────────────────
// Panel deslizable desde abajo, mensajes por viaje, badges de no leídos
// Usa: DB.sendMsg, DB.onChat, DB.markChatRead, DB.clearChat

let _chatRideId      = null;   // rideId actualmente abierto
let _chatStop        = null;   // función para detener listener activo
let _chatBgStop      = null;   // listener background (solo badges)
let _chatBgRideId    = null;
let _chatAbierto     = false;

// ── Abrir panel de chat ──────────────────────────────────────────────────
function abrirChat(rideId) {
  if (!rideId || !me) return;

  _chatRideId  = rideId;
  _chatAbierto = true;

  // Asegurar que el panel existe en el DOM
  _ensureChatPanel();

  const panel = document.getElementById('chat-panel');
  panel.classList.add('open');
  document.getElementById('chat-messages').innerHTML =
    '<div class="chat-loading">Cargando mensajes...</div>';

  // Detener listener background si estaba activo
  if (_chatBgStop) { _chatBgStop(); _chatBgStop = null; }

  // Iniciar listener principal
  if (_chatStop) { _chatStop(); _chatStop = null; }
  _chatStop = DB.onChat(rideId, msgs => {
    _renderMensajes(msgs);
    // Marcar como leídos los mensajes del otro
    msgs.forEach(m => {
      if (m.uid !== me.id && !m.leido) {
        DB.markChatRead(rideId, m.id);
      }
    });
    _actualizarBadge(rideId, msgs);
  });

  // Focus en textarea
  setTimeout(() => {
    const ta = document.getElementById('chat-input');
    if (ta) ta.focus();
  }, 300);
}

// ── Cerrar panel ─────────────────────────────────────────────────────────
function cerrarChat() {
  const panel = document.getElementById('chat-panel');
  if (panel) panel.classList.remove('open');
  _chatAbierto = false;

  // Volver a escuchar en background para badges
  if (_chatRideId) {
    if (_chatStop) { _chatStop(); _chatStop = null; }
    escucharChatBackground(_chatRideId);
  }
}

// ── Escuchar en background (solo actualiza badges sin abrir panel) ────────
function escucharChatBackground(rideId) {
  if (!rideId || !me) return;
  if (_chatBgRideId === rideId && _chatBgStop) return; // ya activo

  if (_chatBgStop) { _chatBgStop(); _chatBgStop = null; }
  _chatBgRideId = rideId;

  _chatBgStop = DB.onChat(rideId, msgs => {
    if (!_chatAbierto) {
      _actualizarBadge(rideId, msgs);
    }
  });
}

// ── Detener todo el chat ──────────────────────────────────────────────────
function detenerChat() {
  if (_chatStop)   { _chatStop();   _chatStop   = null; }
  if (_chatBgStop) { _chatBgStop(); _chatBgStop = null; }
  _chatRideId   = null;
  _chatBgRideId = null;
  _chatAbierto  = false;
  // Limpiar badges
  ['badge-chat-pas','badge-chat-encurso','badge-chat-chofer'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.style.display = 'none'; }
  });
  const panel = document.getElementById('chat-panel');
  if (panel) panel.classList.remove('open');
}

// ── Enviar mensaje ────────────────────────────────────────────────────────
function enviarMensaje() {
  if (!_chatRideId || !me) return;
  const ta  = document.getElementById('chat-input');
  const txt = ta ? ta.value.trim() : '';
  if (!txt) return;

  const msg = {
    id:    'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
    rideId: _chatRideId,
    uid:   me.id,
    nom:   me.nom + (me.ape ? ' ' + me.ape : ''),
    rol:   me.rol,
    txt,
    ts:    Date.now(),
    leido: false
  };

  DB.sendMsg(_chatRideId, msg);
  ta.value = '';
  ta.style.height = 'auto';
}

// ── Render mensajes ───────────────────────────────────────────────────────
function _renderMensajes(msgs) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  if (!msgs.length) {
    container.innerHTML = '<div class="chat-empty">Envía el primer mensaje 👋</div>';
    return;
  }

  let html = '';
  let lastDate = '';

  msgs.forEach(m => {
    const esMio = m.uid === me.id;
    const fecha = new Date(m.ts);
    const dateStr = fecha.toLocaleDateString('es-MX', { day:'numeric', month:'short' });

    if (dateStr !== lastDate) {
      html += `<div class="chat-date-sep">${dateStr}</div>`;
      lastDate = dateStr;
    }

    const hora    = fecha.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
    const leido   = m.leido ? '✓✓' : '✓';
    const leidoCls = m.leido ? 'leido' : '';

    html += `
      <div class="chat-bubble ${esMio ? 'mio' : 'otro'}">
        <div class="chat-txt">${_escHTML(m.txt)}</div>
        <div class="chat-meta">
          <span class="chat-hora">${hora}</span>
          ${esMio ? `<span class="chat-tick ${leidoCls}">${leido}</span>` : ''}
        </div>
      </div>`;
  });

  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

// ── Actualizar badge de no leídos ─────────────────────────────────────────
function _actualizarBadge(rideId, msgs) {
  if (!me) return;
  const noLeidos = msgs.filter(m => m.uid !== me.id && !m.leido).length;
  const txt = noLeidos > 0 ? (noLeidos > 9 ? '9+' : String(noLeidos)) : '';

  ['badge-chat-pas','badge-chat-encurso','badge-chat-chofer'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent    = txt;
    el.style.display  = txt ? 'flex' : 'none';
  });
}

// ── Escape HTML básico ────────────────────────────────────────────────────
function _escHTML(str) {
  return str
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\n/g,'<br>');
}

// ── Crear panel en el DOM si no existe ───────────────────────────────────
function _ensureChatPanel() {
  if (document.getElementById('chat-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'chat-panel';
  panel.innerHTML = `
    <div class="chat-header">
      <div style="display:flex;align-items:center;gap:.6rem;">
        <span style="font-size:1.2rem;">💬</span>
        <span style="font-weight:700;">Chat del viaje</span>
      </div>
      <button class="chat-close-btn" onclick="cerrarChat()">✕</button>
    </div>
    <div id="chat-messages" class="chat-messages"></div>
    <div class="chat-footer">
      <textarea
        id="chat-input"
        class="chat-textarea"
        placeholder="Escribe un mensaje..."
        rows="1"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();enviarMensaje();}"
        oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,100)+'px';"
      ></textarea>
      <button class="chat-send-btn" onclick="enviarMensaje()">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
        </svg>
      </button>
    </div>`;

  document.body.appendChild(panel);
  _inyectarEstilosChat();
}

// ── Estilos del chat ──────────────────────────────────────────────────────
function _inyectarEstilosChat() {
  if (document.getElementById('chat-styles')) return;
  const style = document.createElement('style');
  style.id = 'chat-styles';
  style.textContent = `
    #chat-panel {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      height: 0;
      max-height: 85vh;
      background: #1a1a2e;
      border-top: 1px solid rgba(255,255,255,.1);
      border-radius: 18px 18px 0 0;
      display: flex;
      flex-direction: column;
      z-index: 3000;
      transition: height .35s cubic-bezier(.4,0,.2,1);
      overflow: hidden;
      box-shadow: 0 -4px 30px rgba(0,0,0,.5);
    }
    #chat-panel.open {
      height: 75vh;
    }
    .chat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: .9rem 1.2rem;
      border-bottom: 1px solid rgba(255,255,255,.08);
      flex-shrink: 0;
      background: #16213e;
      border-radius: 18px 18px 0 0;
    }
    .chat-close-btn {
      background: rgba(255,255,255,.08);
      border: none;
      color: #fff;
      width: 30px; height: 30px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 1rem;
      display: flex; align-items: center; justify-content: center;
    }
    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: .8rem 1rem;
      display: flex;
      flex-direction: column;
      gap: .4rem;
    }
    .chat-loading, .chat-empty {
      text-align: center;
      color: rgba(255,255,255,.4);
      font-size: .85rem;
      margin: auto;
      padding: 2rem;
    }
    .chat-date-sep {
      text-align: center;
      font-size: .72rem;
      color: rgba(255,255,255,.35);
      margin: .5rem 0;
    }
    .chat-bubble {
      max-width: 78%;
      padding: .5rem .75rem;
      border-radius: 14px;
      line-height: 1.4;
      word-break: break-word;
    }
    .chat-bubble.mio {
      align-self: flex-end;
      background: #f5c518;
      color: #000;
      border-bottom-right-radius: 4px;
    }
    .chat-bubble.otro {
      align-self: flex-start;
      background: #2a2a4a;
      color: #fff;
      border-bottom-left-radius: 4px;
    }
    .chat-txt { font-size: .9rem; }
    .chat-meta {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: .3rem;
      margin-top: .2rem;
    }
    .chat-hora { font-size: .68rem; opacity: .65; }
    .chat-tick { font-size: .72rem; opacity: .6; }
    .chat-tick.leido { opacity: 1; color: #0af; }
    .chat-bubble.mio .chat-tick.leido { color: #0066cc; }
    .chat-footer {
      display: flex;
      align-items: flex-end;
      gap: .5rem;
      padding: .7rem .9rem;
      border-top: 1px solid rgba(255,255,255,.08);
      background: #16213e;
      flex-shrink: 0;
      padding-bottom: calc(.7rem + env(safe-area-inset-bottom));
    }
    .chat-textarea {
      flex: 1;
      background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 20px;
      color: #fff;
      padding: .55rem 1rem;
      font-size: .9rem;
      resize: none;
      outline: none;
      max-height: 100px;
      overflow-y: auto;
      line-height: 1.4;
      font-family: inherit;
    }
    .chat-textarea::placeholder { color: rgba(255,255,255,.35); }
    .chat-send-btn {
      background: #f5c518;
      color: #000;
      border: none;
      border-radius: 50%;
      width: 40px; height: 40px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: transform .1s;
    }
    .chat-send-btn:active { transform: scale(.9); }
    .chat-badge {
      background: #e53e3e;
      color: #fff;
      border-radius: 50%;
      width: 18px; height: 18px;
      font-size: .65rem;
      font-weight: 700;
      display: none;
      align-items: center;
      justify-content: center;
      margin-left: .2rem;
    }
    .btn-chat {
      display: flex;
      align-items: center;
      gap: .5rem;
      background: rgba(245,197,24,.12);
      border: 1px solid rgba(245,197,24,.3);
      color: #f5c518;
      border-radius: 10px;
      padding: .55rem 1rem;
      cursor: pointer;
      font-size: .88rem;
      font-weight: 600;
      transition: background .2s;
    }
    .btn-chat:hover { background: rgba(245,197,24,.2); }
  `;
  document.head.appendChild(style);
}
