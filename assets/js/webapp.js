/* ============================================================
   tuTaxi — webapp.js
   Lógica principal de la app usuario/conductor
   Usa Firebase Realtime Database via db.js
   ============================================================ */

import { DB } from './db.js';

// ── ESTADO ─────────────────────────────────────────
let me=null, driverOn=false;
let map=null, markerO=null, markerD=null, routeLine=null;
let coordO=null, coordD=null, pinMode=null;
let ddTimers={}, ddRes={origen:[],destino:[]};
let unsubRides=null, unsubNotifs=null;

// ── NAVEGACIÓN ─────────────────────────────────────
function go(s){
  document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));
  document.getElementById('screen-'+s).classList.add('active');
  if(s==='app') setTimeout(initMapa,350);
}

function showTab(id,btn){
  document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if(btn) btn.classList.add('active');
  if(id==='t-rides')    cargarMisViajes();
  if(id==='t-driver' && driverOn) cargarSolicitudes();
  if(id==='t-home')     setTimeout(()=>map&&map.invalidateSize(),200);
  if(id==='t-ganancias') cargarGanancias();
}

// ── TOAST ──────────────────────────────────────────
function toast(msg,type=''){
  const el=document.getElementById('toast');
  el.textContent=msg; el.className='toast show '+type;
  setTimeout(()=>el.classList.remove('show'),3000);
}

// ── AUTH ───────────────────────────────────────────
function toggleChoferFields(){
  document.getElementById('chofer-fields').style.display=
    document.getElementById('r-rol').value==='chofer'?'block':'none';
}

async function doRegister(){
  const nom=document.getElementById('r-nom').value.trim();
  const ape=document.getElementById('r-ape').value.trim();
  const email=document.getElementById('r-email').value.trim().toLowerCase();
  const tel=document.getElementById('r-tel').value.trim();
  const pass=document.getElementById('r-pass').value;
  const rol=document.getElementById('r-rol').value;

  if(!nom||!email||!pass||!tel){toast('Completa todos los campos','err');return;}
  if(pass.length<6){toast('Contraseña mínimo 6 caracteres','err');return;}

  const users = await DB.users();
  if(users.find(u=>u.email===email)){toast('Correo ya registrado','err');return;}

  const user={
    id:'u_'+Date.now(),
    nom, ape, nombre:nom, apellido:ape,
    email, tel, telefono:tel,
    pass, rol,
    estatus:'activo',
    fecha:new Date().toISOString(),
    fechaRegistro:new Date().toISOString(),
  };

  if(rol==='chofer'){
    const veh=document.getElementById('r-veh').value.trim();
    const pla=document.getElementById('r-pla').value.trim();
    if(!veh||!pla){toast('Completa datos del vehículo','err');return;}
    user.veh=veh; user.vehiculo=veh;
    user.pla=pla; user.placas=pla;
    user.col=document.getElementById('r-col').value.trim(); user.color=user.col;
    user.lic=document.getElementById('r-lic').value.trim(); user.licencia=user.lic;
    user.estatusChofer='activo';
  }

  await DB.saveUser(user);
  DB.saveSession(user);
  me=user;
  toast('¡Cuenta creada! 🎉','ok');
  initApp();
}

async function doLogin(){
  const email=document.getElementById('l-email').value.trim().toLowerCase();
  const pass=document.getElementById('l-pass').value;
  const users = await DB.users();
  const user=users.find(u=>u.email===email&&u.pass===pass);
  if(!user){toast('Datos incorrectos','err');return;}
  if(user.estatus==='bloqueado'){toast('Cuenta bloqueada','err');return;}
  DB.saveSession(user);
  me=user;
  toast('¡Bienvenido, '+user.nom+'! 👋','ok');
  initApp();
}

function doLogout(){
  me=null; driverOn=false; map=null;
  if(unsubRides)  unsubRides();
  if(unsubNotifs) unsubNotifs();
  DB.clearSession();
  go('landing');
  toast('Sesión cerrada');
}

// ── INIT APP ───────────────────────────────────────
function initApp(){
  go('app');
  document.getElementById('tb-name').textContent=me.nom;
  const rel=document.getElementById('tb-role');

  if(me.rol==='chofer'){
    rel.textContent='🚗 Chofer'; rel.className='role-chip role-chofer';
    document.getElementById('tab-chofer-btn').style.display='block';
    document.getElementById('tab-ganancias-btn').style.display='block';
    document.getElementById('tab-inicio-btn').style.display='none';
    setTimeout(()=>{
      document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
      document.getElementById('t-driver').classList.add('active');
      document.getElementById('tab-chofer-btn').classList.add('active');
      driverOn=true;
      document.getElementById('driver-sw').checked=true;
      document.getElementById('driver-sub').textContent='Estás disponible';
      cargarSolicitudes();
      iniciarTracking();
    },400);
  } else {
    rel.textContent='👤 Pasajero'; rel.className='role-chip role-pasajero';
    document.getElementById('tab-chofer-btn').style.display='none';
    document.getElementById('tab-ganancias-btn').style.display='none';
    document.getElementById('tab-inicio-btn').style.display='block';
    setTimeout(initMapa,350);
    // Escuchar notificaciones en tiempo real
    unsubNotifs = DB.onNotifs(me.id, notifs => {
      notifs.forEach(n => {
        mostrarNotifBanner(n.msg);
        DB.markNotifRead(n.id);
      });
    });
  }

  // Escuchar viajes en tiempo real
  unsubRides = DB.onRides(rides => {
    if(me.rol==='pasajero') renderViajeActivo(rides);
    if(me.rol==='chofer' && driverOn) renderSolicitudes(rides);
    actualizarIconosChoferes(rides);
  });

  refrescarPerfil();
  const savedTheme=localStorage.getItem('tt_theme');
  if(savedTheme==='light'){
    document.body.classList.add('light');
    const btn=document.getElementById('theme-btn');
    if(btn) btn.textContent='☀️';
  }
}

// ── MAPA ───────────────────────────────────────────
function initMapa(){
  if(map!==null){map.invalidateSize();return;}
  map=L.map('map',{zoom:14,zoomControl:true});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© <a href="https://openstreetmap.org">OpenStreetMap</a>',maxZoom:19
  }).addTo(map);
  map.on('click',function(e){
    if(!pinMode) return;
    geocReverso(e.latlng.lat,e.latlng.lng,nombre=>{
      if(pinMode==='origen'){
        coordO={lat:e.latlng.lat,lng:e.latlng.lng};
        document.getElementById('inp-origen').value=nombre;
        document.getElementById('cl-origen').style.display='block';
        ponerPin('origen',e.latlng.lat,e.latlng.lng);
      } else {
        coordD={lat:e.latlng.lat,lng:e.latlng.lng};
        document.getElementById('inp-destino').value=nombre;
        document.getElementById('cl-destino').style.display='block';
        ponerPin('destino',e.latlng.lat,e.latlng.lng);
      }
      desactivarPin();
      if(coordO&&coordD) trazarRuta();
    });
  });
  miUbicacion(true);
}

function mkIcono(emoji,color){
  return L.divIcon({
    html:`<div style="background:${color};width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #000;box-shadow:0 3px 10px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);font-size:15px;">${emoji}</span></div>`,
    className:'',iconSize:[36,36],iconAnchor:[18,36]
  });
}

function ponerPin(tipo,lat,lng){
  if(tipo==='origen'){
    if(markerO) map.removeLayer(markerO);
    markerO=L.marker([lat,lng],{icon:mkIcono('📍','#f5c518'),draggable:true}).addTo(map);
    markerO.on('dragend',e=>{
      const p=e.target.getLatLng(); coordO={lat:p.lat,lng:p.lng};
      geocReverso(p.lat,p.lng,n=>{document.getElementById('inp-origen').value=n;if(coordD)trazarRuta();});
    });
  } else {
    if(markerD) map.removeLayer(markerD);
    markerD=L.marker([lat,lng],{icon:mkIcono('🎯','#ff6b35'),draggable:true}).addTo(map);
    markerD.on('dragend',e=>{
      const p=e.target.getLatLng(); coordD={lat:p.lat,lng:p.lng};
      geocReverso(p.lat,p.lng,n=>{document.getElementById('inp-destino').value=n;if(coordO)trazarRuta();});
    });
  }
}

function trazarRuta(){
  if(!coordO||!coordD) return;
  if(routeLine){map.removeLayer(routeLine);routeLine=null;}
  const url=`https://router.project-osrm.org/route/v1/driving/${coordO.lng},${coordO.lat};${coordD.lng},${coordD.lat}?overview=full&geometries=geojson`;
  fetch(url).then(r=>r.json()).then(data=>{
    if(!data.routes?.length){rutaLinea();return;}
    const r=data.routes[0];
    const pts=r.geometry.coordinates.map(c=>[c[1],c[0]]);
    routeLine=L.polyline(pts,{color:'#f5c518',weight:5,opacity:.9}).addTo(map);
    map.fitBounds(routeLine.getBounds(),{padding:[50,50]});
    const km=(r.distance/1000).toFixed(1);
    const min=Math.round(r.duration/60);
    const sug=Math.max(30,Math.round(parseFloat(km)*9));
    document.getElementById('ri-dist').textContent=km+' km';
    document.getElementById('ri-time').textContent=min+' min';
    document.getElementById('ri-sug').textContent='$'+sug;
    document.getElementById('route-info').classList.add('on');
    pickPrice(sug);
  }).catch(()=>rutaLinea());
}

function rutaLinea(){
  if(routeLine){map.removeLayer(routeLine);}
  routeLine=L.polyline([[coordO.lat,coordO.lng],[coordD.lat,coordD.lng]],{color:'#f5c518',weight:4,dashArray:'8 6'}).addTo(map);
  map.fitBounds([[coordO.lat,coordO.lng],[coordD.lat,coordD.lng]],{padding:[50,50]});
  const d=map.distance([coordO.lat,coordO.lng],[coordD.lat,coordD.lng]);
  const km=(d/1000).toFixed(1);
  document.getElementById('ri-dist').textContent=km+' km';
  document.getElementById('ri-time').textContent=Math.round(d/300)+' min';
  document.getElementById('ri-sug').textContent='$'+Math.max(30,Math.round(parseFloat(km)*9));
  document.getElementById('route-info').classList.add('on');
}

function miUbicacion(silencioso=false){
  if(!map){if(!silencioso)toast('Mapa no listo','err');return;}
  if(!navigator.geolocation){if(!silencioso)toast('GPS no disponible','err');return;}
  navigator.geolocation.getCurrentPosition(pos=>{
    const{latitude:lat,longitude:lng}=pos.coords;
    map.setView([lat,lng],15);
    if(!coordO){
      geocReverso(lat,lng,nombre=>{
        coordO={lat,lng};
        document.getElementById('inp-origen').value=nombre;
        document.getElementById('cl-origen').style.display='block';
        ponerPin('origen',lat,lng);
        if(!silencioso) toast('Ubicación detectada 📍','ok');
      });
    } else {
      if(!silencioso) toast('Centrado en tu ubicación','ok');
    }
  },()=>{if(!silencioso)toast('No se pudo obtener GPS','err');},
  {enableHighAccuracy:true,timeout:10000,maximumAge:0});
}

function activarPin(tipo){
  pinMode=tipo;
  document.getElementById('btn-po').className='map-btn'+(tipo==='origen'?' m-active':'');
  document.getElementById('btn-pd').className='map-btn'+(tipo==='destino'?' m-dest':'');
  map.getContainer().style.cursor='crosshair';
  toast(tipo==='origen'?'📍 Toca el mapa para el origen':'🎯 Toca el mapa para el destino');
}

function desactivarPin(){
  pinMode=null;
  document.getElementById('btn-po').className='map-btn';
  document.getElementById('btn-pd').className='map-btn';
  if(map) map.getContainer().style.cursor='';
}

// ── GEOCODIFICACIÓN ────────────────────────────────
function geocReverso(lat,lng,cb){
  fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
    .then(r=>r.json())
    .then(d=>cb(d.display_name?.split(',').slice(0,3).join(', ')||`${lat.toFixed(5)},${lng.toFixed(5)}`))
    .catch(()=>cb(`${lat.toFixed(5)},${lng.toFixed(5)}`));
}

function geocSearch(q,cb){
  fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6`)
    .then(r=>r.json()).then(cb).catch(()=>cb([]));
}

// ── AUTOCOMPLETE ───────────────────────────────────
function buscar(campo,val){
  document.getElementById('cl-'+campo).style.display=val?'block':'none';
  if(val.length<3){cerrarDD(campo);return;}
  clearTimeout(ddTimers[campo]);
  const dd=document.getElementById('dd-'+campo);
  dd.style.display='block';
  dd.innerHTML='<div class="dd-info"><div class="spinner"></div> Buscando...</div>';
  ddTimers[campo]=setTimeout(()=>{
    geocSearch(val,results=>{
      ddRes[campo]=results;
      if(!results.length){dd.innerHTML='<div class="dd-info">Sin resultados</div>';return;}
      dd.innerHTML=results.map((r,i)=>`
        <div class="dd-item" onmousedown="elegir('${campo}',${i})">
          <span style="font-size:.9rem;flex-shrink:0;">${icoLugar(r)}</span>
          <div>
            <div class="dd-main">${(r.name||r.display_name.split(',')[0]).slice(0,50)}</div>
            <div class="dd-sub">${r.display_name.split(',').slice(1,4).join(', ')}</div>
          </div>
        </div>`).join('');
    });
  },450);
}

function icoLugar(r){
  if(r.type==='restaurant'||r.type==='fast_food') return '🍽️';
  if(r.type==='hospital') return '🏥';
  if(r.type==='school'||r.type==='university') return '🏫';
  if(r.class==='highway') return '🛣️';
  return '📌';
}

function cerrarDD(campo){setTimeout(()=>{document.getElementById('dd-'+campo).style.display='none';},150);}

function elegir(campo,idx){
  const r=ddRes[campo][idx];
  const nombre=r.display_name.split(',').slice(0,3).join(', ');
  const lat=parseFloat(r.lat),lng=parseFloat(r.lon);
  document.getElementById('inp-'+campo).value=nombre;
  document.getElementById('cl-'+campo).style.display='block';
  document.getElementById('dd-'+campo).style.display='none';
  if(campo==='origen'){coordO={lat,lng};ponerPin('origen',lat,lng);}
  else{coordD={lat,lng};ponerPin('destino',lat,lng);}
  if(map) map.setView([lat,lng],15);
  if(coordO&&coordD) trazarRuta();
}

function limpiar(campo){
  document.getElementById('inp-'+campo).value='';
  document.getElementById('cl-'+campo).style.display='none';
  document.getElementById('dd-'+campo).style.display='none';
  if(campo==='origen'){coordO=null;if(markerO){map&&map.removeLayer(markerO);markerO=null;}}
  else{coordD=null;if(markerD){map&&map.removeLayer(markerD);markerD=null;}}
  if(routeLine){map&&map.removeLayer(routeLine);routeLine=null;}
  document.getElementById('route-info').classList.remove('on');
}

// ── PRECIO ─────────────────────────────────────────
function setPrice(v){document.getElementById('price-show').textContent='$'+v;}
function pickPrice(v){
  document.getElementById('price-range').value=v; setPrice(v);
  document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',parseInt(c.textContent.replace('$',''))===parseInt(v)));
}

// ── VIAJES ─────────────────────────────────────────
async function solicitarViaje(){
  const origen=document.getElementById('inp-origen').value.trim();
  const destino=document.getElementById('inp-destino').value.trim();
  const precio=document.getElementById('price-range').value;
  if(!origen||!destino){toast('Ingresa origen y destino','err');return;}

  const rides = await DB.rides();
  if(rides.find(r=>r.pasId===me.id&&['pendiente','aceptado'].includes(r.est))){
    toast('Ya tienes un viaje activo','err');return;
  }

  const ride={
    id:'r_'+Date.now(),
    pasId:me.id, pasNom:me.nom+' '+(me.ape||''), pasTel:me.tel,
    origen, destino, coordO, coordD,
    precio:parseInt(precio),
    est:'pendiente',
    fecha:new Date().toISOString(),
    chofId:null, chofNom:null,
  };

  await DB.saveRide(ride);
  toast('¡Viaje solicitado! Buscando chofer... 🚖','ok');
}

function renderViajeActivo(rides){
  const activo=rides.find(r=>r.pasId===me.id&&['pendiente','aceptado'].includes(r.est));
  const wrap=document.getElementById('viaje-activo-wrap');
  const card=document.getElementById('viaje-activo-card');
  if(activo){
    wrap.style.display='block';
    card.innerHTML=`<div class="avail-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.9rem;">
        <span class="sec-label" style="margin:0;">Estado</span>
        <span class="status-pill s-${activo.est}">${sLabel(activo.est)}</span>
      </div>
      <div class="from-lbl">📍 ${activo.origen}</div>
      <div class="to-lbl" style="margin:.25rem 0 .9rem;">🎯 ${activo.destino}</div>
      <div class="price-box" style="margin-bottom:.8rem;">
        <div><div class="price-lbl">Tu oferta</div><div class="price-val">$${activo.precio}</div></div>
        ${activo.chofNom?`<div><div class="price-lbl">Chofer</div><div style="font-weight:700;">${activo.chofNom}</div><div style="font-size:.75rem;color:var(--gray3);">${activo.veh||''} ${activo.pla?'| '+activo.pla:''}</div></div>`:''}
      </div>
      ${activo.est==='pendiente'?`<button class="btn btn-danger btn-full" onclick="cancelarViaje('${activo.id}')">Cancelar solicitud</button>`:''}
      ${activo.est==='aceptado'?`<button class="btn btn-success btn-full" onclick="completarViaje('${activo.id}')">Marcar completado ✓</button>`:''}
    </div>`;
  } else {
    // Verificar si hay viaje recién completado sin calificar
    const completado=rides.find(r=>r.pasId===me.id&&r.est==='completado'&&!r.calificacion);
    if(completado) mostrarModalCalificacion(completado);
    wrap.style.display='none'; card.innerHTML='';
  }
}

async function cancelarViaje(id){
  await DB.updateRide(id,{est:'cancelado'});
  toast('Viaje cancelado');
}

async function completarViaje(id){
  await DB.updateRide(id,{est:'completado'});
  toast('¡Completado! ⭐','ok');
}

function renderSolicitudes(rides){
  const pendientes=rides.filter(r=>r.est==='pendiente');
  const el=document.getElementById('solicitudes-list');
  if(!pendientes.length){
    el.innerHTML='<div class="empty"><div class="empty-icon">⏳</div><div class="empty-title">Sin solicitudes</div></div>';
    return;
  }
  el.innerHTML=pendientes.map(r=>`<div class="avail-card">
    <div class="avail-user">
      <div class="avatar">${r.pasNom[0]}</div>
      <div><div style="font-weight:700;">${r.pasNom}</div><div style="font-size:.78rem;color:var(--gray3);">${r.pasTel}</div></div>
      <div style="margin-left:auto;"><div class="price-val">$${r.precio}</div></div>
    </div>
    <div class="from-lbl">📍 ${r.origen}</div>
    <div class="to-lbl" style="margin-top:.25rem;">🎯 ${r.destino}</div>
    <div class="avail-btns">
      <button class="btn btn-danger" onclick="rechazarViaje('${r.id}',this)">Rechazar</button>
      <button class="btn btn-success" onclick="aceptarViaje('${r.id}')">Aceptar</button>
    </div>
  </div>`).join('');
}

async function cargarMisViajes(){
  const rides = await DB.rides();
  const mis=rides.filter(r=>r.pasId===me.id||r.chofId===me.id);
  const el=document.getElementById('rides-list');
  if(!mis.length){el.innerHTML='<div class="empty"><div class="empty-icon">🛣️</div><div class="empty-title">Sin viajes aún</div></div>';return;}
  mis.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  el.innerHTML=mis.map(r=>`<div class="ride-card">
    <div class="ride-top">
      <div><div class="from-lbl">📍 ${r.origen}</div><div class="to-lbl">🎯 ${r.destino}</div></div>
      <span class="status-pill s-${r.est}">${sLabel(r.est)}</span>
    </div>
    <div class="ride-bot"><span class="ride-price">$${r.precio}</span><span class="ride-date">${new Date(r.fecha).toLocaleDateString('es-MX')}</span></div>
  </div>`).join('');
}

function rechazarViaje(id,btn){ btn.closest('.avail-card').remove(); toast('Rechazada'); }

async function aceptarViaje(id){
  await DB.updateRide(id,{
    est:'aceptado', chofId:me.id, chofNom:me.nom+' '+(me.ape||''),
    chofTel:me.tel, veh:me.veh, pla:me.pla,
  });
  // Notificación para el pasajero
  const rides = await DB.rides();
  const ride = rides.find(r=>r.id===id);
  if(ride){
    await DB.saveNotif({
      id:'n_'+Date.now(), pasId:ride.pasId,
      msg:`🚗 ${me.nom} aceptó tu viaje. Vehículo: ${me.veh||'—'} | Placas: ${me.pla||'—'}`,
      leida:false, fecha:new Date().toISOString()
    });
  }
  toast('¡Viaje aceptado! 🚗','ok');
}

// ── CHOFER ─────────────────────────────────────────
function toggleChofer(){
  driverOn=document.getElementById('driver-sw').checked;
  document.getElementById('driver-sub').textContent=driverOn?'Estás disponible':'Desconectado';
  if(driverOn){toast('¡En línea! 🚗','ok');iniciarTracking();}
  else document.getElementById('solicitudes-list').innerHTML=
    '<div class="empty"><div class="empty-icon">📡</div><div class="empty-title">Activa tu disponibilidad</div></div>';
}

function cargarSolicitudes(){} // Ahora lo hace onRides en tiempo real

function iniciarTracking(){
  if(!navigator.geolocation) return;
  setInterval(()=>{
    if(!me||me.rol!=='chofer'||!driverOn) return;
    navigator.geolocation.getCurrentPosition(pos=>{
      DB.updateUser(me.id,{
        lastLat:pos.coords.latitude,
        lastLng:pos.coords.longitude,
        lastUpdate:Date.now()
      });
    },{enableHighAccuracy:true,maximumAge:0,timeout:5000});
  },5000);
}

// ── ICONOS CHOFERES EN MAPA ────────────────────────
let marcadoresChoferes={};

function iconoVehiculo(conPasaje){
  const color=conPasaje?'#ef4444':'#cccccc';
  const sombra=conPasaje?'rgba(239,68,68,.5)':'rgba(150,150,150,.4)';
  return L.divIcon({
    html:`<div style="position:relative;width:36px;height:36px;filter:drop-shadow(0 2px 6px ${sombra});">
      <svg viewBox="0 0 64 64" width="36" height="36" xmlns="http://www.w3.org/2000/svg">
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
    className:'',iconSize:[36,36],iconAnchor:[18,36],
  });
}

async function actualizarIconosChoferes(rides){
  if(!map) return;
  const users = await DB.users();
  const choferes=users.filter(u=>u.rol==='chofer'&&u.estatus==='activo'&&u.lastLat);
  choferes.forEach(chofer=>{
    const tieneViaje=rides.some(r=>r.chofId===chofer.id&&r.est==='aceptado');
    const lat=chofer.lastLat, lng=chofer.lastLng;
    if(marcadoresChoferes[chofer.id]){
      marcadoresChoferes[chofer.id].setLatLng([lat,lng]);
      marcadoresChoferes[chofer.id].setIcon(iconoVehiculo(tieneViaje));
    } else {
      const m=L.marker([lat,lng],{icon:iconoVehiculo(tieneViaje),zIndexOffset:100}).addTo(map);
      m.bindTooltip(`🚗 ${chofer.nom} ${chofer.ape||''}<br>${chofer.veh||''} | ${chofer.pla||''}`,{permanent:false,direction:'top'});
      marcadoresChoferes[chofer.id]=m;
    }
  });
}

// ── NOTIFICACIÓN BANNER ────────────────────────────
function mostrarNotifBanner(msg){
  let banner=document.getElementById('notif-banner');
  if(!banner){
    banner=document.createElement('div');
    banner.id='notif-banner';
    banner.style.cssText='position:fixed;top:70px;left:50%;transform:translateX(-50%);background:#1a3a1a;border:1.5px solid var(--green);border-radius:14px;padding:1rem 1.5rem;max-width:340px;width:90%;z-index:99999;box-shadow:0 8px 32px rgba(0,0,0,.6);font-size:.88rem;line-height:1.5;';
    document.body.appendChild(banner);
  }
  banner.innerHTML=`
    <div style="font-weight:700;color:var(--green);margin-bottom:.3rem;">¡Chofer en camino! 🚗</div>
    <div style="color:var(--white);">${msg}</div>
    <button onclick="this.parentElement.remove()" style="margin-top:.8rem;background:var(--green);border:none;color:#000;border-radius:8px;padding:.4rem 1rem;font-weight:700;cursor:pointer;width:100%;">Entendido</button>`;
  setTimeout(()=>{if(banner.parentElement)banner.remove();},8000);
}

// ── CALIFICACIÓN ───────────────────────────────────
function mostrarModalCalificacion(ride){
  if(document.getElementById('modal-calif')) return;
  const modal=document.createElement('div');
  modal.id='modal-calif';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:flex-end;justify-content:center;z-index:99999;padding:1rem;backdrop-filter:blur(4px);';
  modal.innerHTML=`
    <div style="background:var(--gray);border:1px solid rgba(255,255,255,.1);border-radius:24px 24px 0 0;padding:2rem;width:100%;max-width:440px;">
      <div style="font-size:1.1rem;font-weight:700;margin-bottom:.4rem;">¿Cómo estuvo el viaje? ⭐</div>
      <div style="font-size:.85rem;color:var(--gray3);margin-bottom:1.5rem;">Califica a tu chofer: <strong style="color:var(--white);">${ride.chofNom||'Chofer'}</strong></div>
      <div id="estrellas" style="display:flex;gap:.5rem;justify-content:center;margin-bottom:1.5rem;">
        ${[1,2,3,4,5].map(n=>`<span data-n="${n}" onclick="selEstrellas(${n})" style="font-size:2.2rem;cursor:pointer;transition:transform .15s;filter:grayscale(1);opacity:.4;">⭐</span>`).join('')}
      </div>
      <textarea id="comentario-calif" placeholder="Comentario opcional..." style="width:100%;background:var(--gray2);border:1.5px solid rgba(255,255,255,.08);border-radius:10px;color:var(--white);padding:.75rem;font-size:.88rem;resize:none;height:80px;outline:none;"></textarea>
      <button onclick="enviarCalificacion('${ride.id}')" class="btn btn-primary btn-full" style="margin-top:1rem;">Enviar calificación</button>
      <button onclick="document.getElementById('modal-calif').remove()" style="width:100%;background:none;border:none;color:var(--gray3);margin-top:.8rem;cursor:pointer;font-size:.88rem;">Omitir</button>
    </div>`;
  document.body.appendChild(modal);
}

let estrellasSel=0;
function selEstrellas(n){
  estrellasSel=n;
  document.querySelectorAll('#estrellas span').forEach(s=>{
    const sn=parseInt(s.dataset.n);
    s.style.filter=sn<=n?'none':'grayscale(1)';
    s.style.opacity=sn<=n?'1':'.4';
    s.style.transform=sn<=n?'scale(1.15)':'scale(1)';
  });
}

async function enviarCalificacion(rideId){
  if(!estrellasSel){toast('Selecciona una calificación','err');return;}
  const comentario=document.getElementById('comentario-calif').value.trim();
  await DB.updateRide(rideId,{calificacion:estrellasSel,comentario});
  document.getElementById('modal-calif').remove();
  toast('¡Gracias por tu calificación! '+('⭐'.repeat(estrellasSel)),'ok');
  estrellasSel=0;
}

// ── GANANCIAS ──────────────────────────────────────
let filtroGanancias='todos';

async function cargarGanancias(){
  const rides = await DB.rides();
  const todos=rides.filter(r=>r.chofId===me.id&&r.est==='completado');
  const ahora=new Date();
  const hoy=ahora.toDateString();
  const semana=new Date(); semana.setDate(ahora.getDate()-7);
  const mes=new Date(ahora.getFullYear(),ahora.getMonth(),1);

  const viajesHoy=todos.filter(r=>new Date(r.fecha).toDateString()===hoy);
  const viajesSemana=todos.filter(r=>new Date(r.fecha)>=semana);
  const viajesMes=todos.filter(r=>new Date(r.fecha)>=mes);
  const suma=arr=>arr.reduce((a,r)=>a+r.precio,0);

  document.getElementById('gan-hoy').textContent='$'+suma(viajesHoy).toLocaleString();
  document.getElementById('gan-hoy-viajes').textContent=viajesHoy.length+' viaje'+(viajesHoy.length!==1?'s':'');
  document.getElementById('gan-semana').textContent='$'+suma(viajesSemana).toLocaleString();
  document.getElementById('gan-semana-viajes').textContent=viajesSemana.length+' viaje'+(viajesSemana.length!==1?'s':'');
  document.getElementById('gan-mes').textContent='$'+suma(viajesMes).toLocaleString();
  document.getElementById('gan-mes-viajes').textContent=viajesMes.length+' viaje'+(viajesMes.length!==1?'s':'');
  document.getElementById('gan-total').textContent='$'+suma(todos).toLocaleString();
  document.getElementById('gan-total-viajes').textContent=todos.length+' viaje'+(todos.length!==1?'s':'');

  renderGrafica(todos);
  filtrarGanancias(filtroGanancias,null,todos);
}

function renderGrafica(todos){
  const wrap=document.getElementById('grafica-wrap');
  const labels=document.getElementById('grafica-labels');
  const dias=[];
  for(let i=6;i>=0;i--){
    const d=new Date(); d.setDate(d.getDate()-i);
    const key=d.toDateString();
    const viajes=todos.filter(r=>new Date(r.fecha).toDateString()===key);
    dias.push({label:d.toLocaleDateString('es-MX',{weekday:'short'}),total:viajes.reduce((a,r)=>a+r.precio,0),viajes:viajes.length});
  }
  const maxVal=Math.max(...dias.map(d=>d.total),1);
  wrap.innerHTML=dias.map(d=>{
    const h=Math.max(Math.round((d.total/maxVal)*100),d.total>0?8:2);
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:.3rem;" title="${d.viajes} viajes · $${d.total}">
      ${d.total>0?`<div style="font-size:.65rem;color:var(--accent);font-weight:700;">$${d.total}</div>`:''}
      <div style="width:100%;height:${h}%;min-height:4px;background:${d.total>0?'var(--accent)':'rgba(255,255,255,.08)'};border-radius:6px 6px 0 0;"></div>
    </div>`;
  }).join('');
  labels.innerHTML=dias.map(d=>`<div style="flex:1;text-align:center;font-size:.68rem;color:var(--gray3);">${d.label}</div>`).join('');
}

function filtrarGanancias(filtro,btn,todosParam){
  filtroGanancias=filtro;
  ['todos','hoy','semana','mes'].forEach(f=>{
    const b=document.getElementById('fil-'+f);
    if(b){b.style.color=f===filtro?'var(--accent)':'';b.style.borderColor=f===filtro?'rgba(245,197,24,.4)':'';}
  });
  const process=todos=>{
    const ahora=new Date();
    let viajes=todos;
    if(filtro==='hoy')    viajes=todos.filter(r=>new Date(r.fecha).toDateString()===ahora.toDateString());
    if(filtro==='semana'){const s=new Date();s.setDate(ahora.getDate()-7);viajes=todos.filter(r=>new Date(r.fecha)>=s);}
    if(filtro==='mes')    viajes=todos.filter(r=>new Date(r.fecha)>=new Date(ahora.getFullYear(),ahora.getMonth(),1));
    viajes.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
    const el=document.getElementById('historial-ganancias');
    if(!viajes.length){el.innerHTML='<div class="empty"><div class="empty-icon">💸</div><div class="empty-title">Sin viajes en este período</div></div>';return;}
    el.innerHTML=viajes.map(r=>`
      <div class="ride-card" style="display:flex;align-items:center;gap:1rem;">
        <div style="font-size:1.5rem;">🚗</div>
        <div style="flex:1;">
          <div class="from-lbl">📍 ${r.origen}</div>
          <div class="to-lbl">🎯 ${r.destino}</div>
          <div style="font-size:.75rem;color:var(--gray3);margin-top:.3rem;">
            ${new Date(r.fecha).toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'short'})}
            · ${new Date(r.fecha).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}
            ${r.calificacion?'· '+'⭐'.repeat(r.calificacion):''}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:1.2rem;font-weight:900;color:var(--green);">+$${r.precio}</div>
          <div class="status-pill s-completado" style="margin-top:.3rem;">Completado</div>
        </div>
      </div>`).join('');
  };
  if(todosParam) process(todosParam);
  else DB.rides().then(rides=>process(rides.filter(r=>r.chofId===me.id&&r.est==='completado')));
}

// ── PERFIL ─────────────────────────────────────────
function refrescarPerfil(){
  if(!me) return;
  const ini=(me.nom[0]+(me.ape?.[0]||'')).toUpperCase();
  const initEl=document.getElementById('prof-initials');
  if(initEl) initEl.textContent=ini;
  document.getElementById('prof-name').textContent=me.nom+' '+(me.ape||'');
  document.getElementById('prof-email').textContent=me.email;
  document.getElementById('tb-name').textContent=me.nom;
  if(me.foto) mostrarFotoPerfil(me.foto);
  document.getElementById('prof-rows').innerHTML=`
    <div class="irow"><span class="ik">Nombre</span><span class="iv">${me.nom} ${me.ape||''}</span></div>
    <div class="irow"><span class="ik">Correo</span><span class="iv">${me.email}</span></div>
    <div class="irow"><span class="ik">Teléfono</span><span class="iv">${me.tel}</span></div>
    <div class="irow"><span class="ik">Tipo</span><span class="iv">${me.rol==='chofer'?'🚗 Chofer':'👤 Pasajero'}</span></div>
    <div class="irow"><span class="ik">Desde</span><span class="iv">${new Date(me.fecha).toLocaleDateString('es-MX')}</span></div>`;
  if(me.rol==='chofer'){
    document.getElementById('veh-card').style.display='block';
    document.getElementById('veh-rows').innerHTML=`
      <div class="irow"><span class="ik">Vehículo</span><span class="iv">${me.veh||'—'}</span></div>
      <div class="irow"><span class="ik">Placas</span><span class="iv">${me.pla||'—'}</span></div>
      <div class="irow"><span class="ik">Color</span><span class="iv">${me.col||'—'}</span></div>
      <div class="irow"><span class="ik">Licencia</span><span class="iv">${me.lic||'—'}</span></div>`;
  }
}

function activarEdicion(){
  document.getElementById('prof-ver').style.display='none';
  document.getElementById('prof-editar').style.display='block';
  document.getElementById('edit-nom').value=me.nom||'';
  document.getElementById('edit-ape').value=me.ape||'';
  document.getElementById('edit-tel').value=me.tel||'';
  document.getElementById('edit-pass').value='';
  if(me.rol==='chofer'){
    document.getElementById('edit-veh-card').style.display='block';
    document.getElementById('edit-veh').value=me.veh||'';
    document.getElementById('edit-pla').value=me.pla||'';
    document.getElementById('edit-col').value=me.col||'';
    document.getElementById('edit-lic').value=me.lic||'';
  } else {
    document.getElementById('edit-veh-card').style.display='none';
  }
}

function cancelarEdicion(){
  document.getElementById('prof-ver').style.display='block';
  document.getElementById('prof-editar').style.display='none';
}

async function guardarPerfil(){
  const nom=document.getElementById('edit-nom').value.trim();
  const ape=document.getElementById('edit-ape').value.trim();
  const tel=document.getElementById('edit-tel').value.trim();
  const pass=document.getElementById('edit-pass').value;
  if(!nom||!tel){toast('Nombre y teléfono son obligatorios','err');return;}
  if(pass.length>0&&pass.length<6){toast('Contraseña mínimo 6 caracteres','err');return;}

  const data={nom,ape,nombre:nom,apellido:ape,tel,telefono:tel};
  if(pass.length>=6) data.pass=pass;

  if(me.rol==='chofer'){
    data.veh=document.getElementById('edit-veh').value.trim(); data.vehiculo=data.veh;
    data.pla=document.getElementById('edit-pla').value.trim(); data.placas=data.pla;
    data.col=document.getElementById('edit-col').value.trim(); data.color=data.col;
    data.lic=document.getElementById('edit-lic').value.trim(); data.licencia=data.lic;
  }

  await DB.updateUser(me.id, data);
  Object.assign(me, data);
  DB.saveSession(me);
  refrescarPerfil();
  cancelarEdicion();
  toast('¡Perfil actualizado! ✅','ok');
}

function mostrarFotoPerfil(base64){
  const foto=document.getElementById('prof-foto');
  const ini=document.getElementById('prof-initials');
  if(foto&&ini){foto.src=base64;foto.style.display='block';ini.style.display='none';}
}

async function cambiarFoto(input){
  const file=input.files[0];
  if(!file) return;
  if(file.size>2*1024*1024){toast('La imagen no debe superar 2MB','err');return;}
  const reader=new FileReader();
  reader.onload=async e=>{
    const base64=e.target.result;
    await DB.updateUser(me.id,{foto:base64});
    me.foto=base64;
    DB.saveSession(me);
    mostrarFotoPerfil(base64);
    toast('¡Foto actualizada! 📸','ok');
  };
  reader.readAsDataURL(file);
}

// ── TEMA ───────────────────────────────────────────
function toggleTheme(){
  const isLight=document.body.classList.toggle('light');
  document.getElementById('theme-btn').textContent=isLight?'☀️':'🌙';
  localStorage.setItem('tt_theme',isLight?'light':'dark');
}

// ── HELPERS ────────────────────────────────────────
function sLabel(s){return{pendiente:'Pendiente',aceptado:'Aceptado',completado:'Completado',cancelado:'Cancelado'}[s]||s;}

// ── ARRANQUE ───────────────────────────────────────
window.onload=async()=>{
  const savedTheme=localStorage.getItem('tt_theme');
  if(savedTheme==='light'){document.body.classList.add('light');const btn=document.getElementById('theme-btn');if(btn)btn.textContent='☀️';}
  const s=DB.session();
  if(s){
    const u=await DB.getUser(s.id);
    if(u&&u.estatus!=='bloqueado'){me=u;initApp();return;}
    DB.clearSession();
  }
};
