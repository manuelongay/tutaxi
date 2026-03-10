/* ============================================================
   tuTaxi — db.js
   Capa de datos — Firebase Realtime Database
   Sin ES modules — compatible con GitHub Pages sin bundler
   Para migrar a otro backend solo cambia este archivo
   ============================================================ */

const DB = {

  /* ── USUARIOS ─────────────────────────────────────────── */

  saveUser: (user) =>
    firebase.database().ref(`users/${user.id}`).set(user),

  getUser: async (id) => {
    const snap = await firebase.database().ref(`users/${id}`).get();
    return snap.exists() ? snap.val() : null;
  },

  users: async () => {
    const snap = await firebase.database().ref('users').get();
    return snap.exists() ? Object.values(snap.val()) : [];
  },

  updateUser: (id, data) =>
    firebase.database().ref(`users/${id}`).update(data),

  onUsers: (cb) =>
    firebase.database().ref('users').on('value', snap =>
      cb(snap.exists() ? Object.values(snap.val()) : [])
    ),

  /* ── VIAJES ───────────────────────────────────────────── */

  saveRide: (ride) =>
    firebase.database().ref(`rides/${ride.id}`).set(ride),

  rides: async () => {
    const snap = await firebase.database().ref('rides').get();
    return snap.exists() ? Object.values(snap.val()) : [];
  },

  updateRide: (id, data) =>
    firebase.database().ref(`rides/${id}`).update(data),

  onRides: (cb) =>
    firebase.database().ref('rides').on('value', snap =>
      cb(snap.exists() ? Object.values(snap.val()) : [])
    ),

  /* ── NOTIFICACIONES ───────────────────────────────────── */

  saveNotif: (notif) =>
    firebase.database().ref(`notifs/${notif.id}`).set(notif),

  onNotifs: (userId, cb) =>
    firebase.database().ref('notifs').on('value', snap => {
      if (!snap.exists()) { cb([]); return; }
      cb(Object.values(snap.val()).filter(n => n.pasId === userId && !n.leida));
    }),

  markNotifRead: (id) =>
    firebase.database().ref(`notifs/${id}`).update({ leida: true }),

  /* ── SESIÓN (localStorage — local por dispositivo) ────── */

  session:      () => JSON.parse(localStorage.getItem('tt_session') || 'null'),
  saveSession:  s  => localStorage.setItem('tt_session', JSON.stringify(s)),
  clearSession: () => localStorage.removeItem('tt_session'),


  /* ── TARIFAS ──────────────────────────────────────── */

  getTarifas: async () => {
    const snap = await firebase.database().ref('config/tarifas').get();
    return snap.exists() ? snap.val() : {
      porKm:        9,
      minima:       30,
      kmIncluidos:  3,
      nocturna:     1.3,
      horaInicio:   22,
      horaFin:      6,
      espera:       1,
      esperaActiva: false,
      radioKm:      3,
    };
  },

  saveTarifas: (tarifas) =>
    firebase.database().ref('config/tarifas').set(tarifas),

  onTarifas: (cb) =>
    firebase.database().ref('config/tarifas').on('value', snap =>
      cb(snap.exists() ? snap.val() : {
        porKm: 9, minima: 30, kmIncluidos: 3, nocturna: 1.3,
        horaInicio: 22, horaFin: 6, espera: 1, esperaActiva: false, radioKm: 3,
      })
    ),
  /* ── ALIAS ADMIN ──────────────────────────────────────── */

  getUsers: async () => {
    const snap = await firebase.database().ref('users').get();
    return snap.exists() ? Object.values(snap.val()) : [];
  },

  getRides: async () => {
    const snap = await firebase.database().ref('rides').get();
    return snap.exists() ? Object.values(snap.val()) : [];
  },
};
