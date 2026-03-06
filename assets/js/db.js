/* ============================================================
   tuTaxi — db.js
   Capa de datos — Firebase Realtime Database
   ============================================================ */

import { db } from "../../firebase/config.js";
import {
  ref, set, get, push, update, onValue, child
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

/* ─────────────────────────────────────────────────────────────
   USUARIOS
───────────────────────────────────────────────────────────── */
const DB = {

  // Guardar usuario nuevo
  saveUser: async (user) => {
    await set(ref(db, `users/${user.id}`), user);
  },

  // Obtener todos los usuarios (una vez)
  users: async () => {
    const snap = await get(ref(db, 'users'));
    return snap.exists() ? Object.values(snap.val()) : [];
  },

  // Obtener un usuario por id
  getUser: async (id) => {
    const snap = await get(ref(db, `users/${id}`));
    return snap.exists() ? snap.val() : null;
  },

  // Actualizar campos de un usuario
  updateUser: async (id, data) => {
    await update(ref(db, `users/${id}`), data);
  },

  // Escuchar cambios en usuarios en tiempo real
  onUsers: (cb) => {
    onValue(ref(db, 'users'), snap => {
      cb(snap.exists() ? Object.values(snap.val()) : []);
    });
  },

  /* ─────────────────────────────────────────────────────────
     VIAJES
  ───────────────────────────────────────────────────────── */

  // Crear viaje nuevo
  saveRide: async (ride) => {
    await set(ref(db, `rides/${ride.id}`), ride);
  },

  // Obtener todos los viajes (una vez)
  rides: async () => {
    const snap = await get(ref(db, 'rides'));
    return snap.exists() ? Object.values(snap.val()) : [];
  },

  // Actualizar campos de un viaje
  updateRide: async (id, data) => {
    await update(ref(db, `rides/${id}`), data);
  },

  // Escuchar viajes en tiempo real
  onRides: (cb) => {
    onValue(ref(db, 'rides'), snap => {
      cb(snap.exists() ? Object.values(snap.val()) : []);
    });
  },

  // Escuchar un viaje específico
  onRide: (id, cb) => {
    onValue(ref(db, `rides/${id}`), snap => {
      cb(snap.exists() ? snap.val() : null);
    });
  },

  /* ─────────────────────────────────────────────────────────
     SESIÓN (sigue en localStorage — es local por dispositivo)
  ───────────────────────────────────────────────────────── */
  session:      () => JSON.parse(localStorage.getItem('tt_session') || 'null'),
  saveSession:  s  => localStorage.setItem('tt_session', JSON.stringify(s)),
  clearSession: () => localStorage.removeItem('tt_session'),

  /* ─────────────────────────────────────────────────────────
     NOTIFICACIONES
  ───────────────────────────────────────────────────────── */

  // Agregar notificación para un usuario
  saveNotif: async (notif) => {
    await set(ref(db, `notifs/${notif.id}`), notif);
  },

  // Escuchar notificaciones de un usuario en tiempo real
  onNotifs: (userId, cb) => {
    onValue(ref(db, 'notifs'), snap => {
      if (!snap.exists()) { cb([]); return; }
      const todas = Object.values(snap.val());
      cb(todas.filter(n => n.pasId === userId && !n.leida));
    });
  },

  // Marcar notificación como leída
  markNotifRead: async (id) => {
    await update(ref(db, `notifs/${id}`), { leida: true });
  },

  /* ─────────────────────────────────────────────────────────
     ALIAS para admin.html (compatibilidad)
  ───────────────────────────────────────────────────────── */
  getUsers: async () => {
    const snap = await get(ref(db, 'users'));
    return snap.exists() ? Object.values(snap.val()) : [];
  },

  getRides: async () => {
    const snap = await get(ref(db, 'rides'));
    return snap.exists() ? Object.values(snap.val()) : [];
  },

  saveUsers: async (users) => {
    const updates = {};
    users.forEach(u => { updates[`users/${u.id}`] = u; });
    await update(ref(db), updates);
  },
};

export { DB, ref, db, onValue, update, get };
