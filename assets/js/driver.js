/* ============================================================
   tuTaxi — driver.js
   Lógica específica del conductor: disponibilidad y tracking
   ============================================================ */

let driverOn = false;

function toggleChofer() {
  driverOn = document.getElementById('driver-sw').checked;
  document.getElementById('driver-sub').textContent = driverOn ? 'Estás disponible' : 'Desconectado';
  if (driverOn) {
    toast('¡En línea! 🚗', 'ok');
    iniciarTracking();
  } else {
    document.getElementById('solicitudes-list').innerHTML =
      '<div class="empty"><div class="empty-icon">📡</div><div class="empty-title">Activa tu disponibilidad</div></div>';
  }
}

function iniciarTracking() {
  if (!navigator.geolocation) return;
  setInterval(() => {
    if (!me || me.rol !== 'chofer' || !driverOn) return;
    navigator.geolocation.getCurrentPosition(pos => {
      DB.updateUser(me.id, {
        lastLat:    pos.coords.latitude,
        lastLng:    pos.coords.longitude,
        lastUpdate: Date.now()
      });
    }, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 });
  }, 5000);
}
