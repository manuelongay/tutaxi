/* ============================================================
   tuTaxi — auth.js  v5.0
   Autenticación con Firebase Auth (email/pass + Google)
   ============================================================ */

// ── REGISTRO CON EMAIL/CONTRASEÑA ─────────────────
async function doRegister() {
  const nom   = document.getElementById('r-nom').value.trim();
  const ape   = document.getElementById('r-ape').value.trim();
  const email = document.getElementById('r-email').value.trim().toLowerCase();
  const tel   = document.getElementById('r-tel').value.trim();
  const pass  = document.getElementById('r-pass').value;
  let   rol   = document.getElementById('r-rol').value;

  if (!nom || !email || !pass || !tel) { toast('Completa todos los campos', 'err'); return; }
  if (pass.length < 6) { toast('Contraseña mínimo 6 caracteres', 'err'); return; }

  // Validar campos de chofer ANTES de crear en Auth
  let veh = '', pla = '', col = '', lic = '';
  if (rol === 'chofer') {
    veh = document.getElementById('r-veh').value.trim();
    pla = document.getElementById('r-pla').value.trim();
    col = document.getElementById('r-col').value.trim();
    lic = document.getElementById('r-lic').value.trim();
    if (!veh || !pla) { toast('Completa datos del vehículo', 'err'); return; }
  }

  // Verificar invitación ANTES de crear en Auth para detectar errores temprano
  let invitacion = null;
  try {
    invitacion = await DB.getInvitacion(email);
  } catch(e) { /* sin invitación */ }

  // Si hay invitación, el rol viene de ahí
  if (invitacion) {
    rol = invitacion.rol || 'admin';
  }

  try {
    const cred = await firebase.auth().createUserWithEmailAndPassword(email, pass);
    const uid  = cred.user.uid;

    const user = {
      id: uid,
      nom, ape, nombre: nom, apellido: ape,
      email, tel, telefono: tel,
      rol, estatus: 'activo',
      fecha: new Date().toISOString(),
      fechaRegistro: new Date().toISOString(),
      provider: 'email',
      companyId: invitacion ? (invitacion.companyId || null) : null,
    };

    if (rol === 'chofer') {
      user.veh = veh; user.vehiculo = veh;
      user.pla = pla; user.placas   = pla;
      user.col = col; user.color    = col;
      user.lic = lic; user.licencia = lic;
      user.estatusChofer = 'activo';
    }

    // Guardar usuario en DB
    await DB.saveUser(user);

    // Procesar invitación DESPUÉS de guardar usuario exitosamente
    if (invitacion) {
      await DB.deleteInvitacion(email);
      if (invitacion.companyId && invitacion.rol === 'admin') {
        await DB.updateCompany(invitacion.companyId, { adminUid: uid });
      }
    }

    DB.saveSession(user);
    me = user;
    const bienvenida = invitacion
      ? `¡Bienvenido como administrador de ${invitacion.companyNombre || 'tu compañía'}! 🎉`
      : '¡Cuenta creada! 🎉';
    toast(bienvenida, 'ok');
    initApp();
  } catch (e) {
    toast(firebaseAuthError(e.code), 'err');
  }
}

// ── LOGIN CON EMAIL/CONTRASEÑA ────────────────────
async function doLogin() {
  const email = document.getElementById('l-email').value.trim().toLowerCase();
  const pass  = document.getElementById('l-pass').value;

  try {
    // Intentar login normal con Firebase Auth
    const cred = await firebase.auth().signInWithEmailAndPassword(email, pass);
    await cargarSesionFirebase(cred.user);
  } catch (e) {
    if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
      // Usuario no existe en Firebase Auth — intentar migración desde DB
      await migrarUsuarioLegacy(email, pass);
    } else {
      toast(firebaseAuthError(e.code), 'err');
    }
  }
}

// ── MIGRACIÓN DE USUARIOS LEGACY ─────────────────
async function migrarUsuarioLegacy(email, pass) {
  toast('Verificando cuenta...', '');
  try {
    // Buscar en Realtime Database (sistema anterior)
    const users  = await DB.users();
    const legacy = users.find(u => u.email === email && u.pass === pass);

    if (!legacy) {
      toast('Datos incorrectos', 'err');
      return;
    }
    if (legacy.estatus === 'bloqueado') {
      toast('Cuenta bloqueada', 'err');
      return;
    }

    // Crear usuario en Firebase Auth con el mismo email/pass
    const cred = await firebase.auth().createUserWithEmailAndPassword(email, pass);
    const uid  = cred.user.uid;

    // Actualizar el perfil en DB con el nuevo uid de Firebase Auth
    // Conservar todos los datos existentes
    const userActualizado = { ...legacy, id: uid, migrado: true };

    // Eliminar el registro viejo si el id era diferente
    if (legacy.id !== uid) {
      await firebase.database().ref('users/' + legacy.id).remove();
    }

    await DB.saveUser(userActualizado);
    DB.saveSession(userActualizado);
    me = userActualizado;

    toast('¡Cuenta migrada exitosamente! Bienvenido, ' + legacy.nom + ' 👋', 'ok');
    initApp();
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') {
      toast('Este correo ya tiene cuenta en el nuevo sistema. Usa "¿Olvidaste tu contraseña?" si no recuerdas tu acceso.', 'err');
    } else {
      toast(firebaseAuthError(e.code), 'err');
    }
  }
}

// ── LOGIN CON GOOGLE ──────────────────────────────
async function doLoginGoogle() {
  if (window._popupEnProgreso) return;
  window._popupEnProgreso = true;
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const cred = await firebase.auth().signInWithPopup(provider);
    const u    = cred.user;

    // Verificar si ya existe en la DB
    let user = await DB.getUser(u.uid);

    if (!user) {
      // Primera vez — necesita elegir rol
      // Guardar datos temporales y mostrar pantalla de selección de rol
      window._googleUser = {
        id:    u.uid,
        nom:   u.displayName?.split(' ')[0] || '',
        ape:   u.displayName?.split(' ').slice(1).join(' ') || '',
        nombre: u.displayName?.split(' ')[0] || '',
        apellido: u.displayName?.split(' ').slice(1).join(' ') || '',
        email: u.email,
        tel:   u.phoneNumber || '',
        foto:  u.photoURL || '',
        provider: 'google',
        estatus: 'activo',
        fecha: new Date().toISOString(),
        fechaRegistro: new Date().toISOString(),
      };
      go('register-google');
    } else {
      if (user.estatus === 'bloqueado') {
        toast('Cuenta bloqueada', 'err');
        await firebase.auth().signOut();
        return;
      }
      DB.saveSession(user);
      me = user;
      toast('¡Bienvenido, ' + user.nom + '! 👋', 'ok');
      initApp();
    }
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
      toast(firebaseAuthError(e.code), 'err');
    }
  } finally {
    window._popupEnProgreso = false;
  }
}

// ── COMPLETAR REGISTRO GOOGLE ─────────────────────
async function completarRegistroGoogle() {
  const rol = document.getElementById('rg-rol').value;
  const tel = document.getElementById('rg-tel').value.trim();

  if (!tel) { toast('Ingresa tu teléfono', 'err'); return; }

  const user = {
    ...window._googleUser,
    id:  window._googleUser.id,
    tel, telefono: tel,
    rol,
  };

  if (rol === 'chofer') {
    const veh = document.getElementById('rg-veh').value.trim();
    const pla = document.getElementById('rg-pla').value.trim();
    if (!veh || !pla) { toast('Completa datos del vehículo', 'err'); return; }
    user.veh = veh;  user.vehiculo  = veh;
    user.pla = pla;  user.placas    = pla;
    user.col = document.getElementById('rg-col').value.trim(); user.color    = user.col;
    user.lic = document.getElementById('rg-lic').value.trim(); user.licencia = user.lic;
    user.estatusChofer = 'activo';
  }

  // Verificar invitación para este email
  let invitacion = null;
  try { invitacion = await DB.getInvitacion(user.email); } catch(e) {}
  if (invitacion) {
    user.rol       = invitacion.rol || 'admin';
    user.companyId = invitacion.companyId || null;
  }

  await DB.saveUser(user);

  if (invitacion) {
    await DB.deleteInvitacion(user.email);
    if (invitacion.companyId && invitacion.rol === 'admin') {
      await DB.updateCompany(invitacion.companyId, { adminUid: user.id });
    }
  }

  DB.saveSession(user);
  me = user;
  window._googleUser = null;
  const bienvenida = invitacion
    ? `¡Bienvenido como administrador de ${invitacion.companyNombre || 'tu compañía'}! 🎉`
    : '¡Cuenta creada! 🎉';
  toast(bienvenida, 'ok');
  initApp();
}

function toggleChoferFieldsGoogle() {
  document.getElementById('rg-chofer-fields').style.display =
    document.getElementById('rg-rol').value === 'chofer' ? 'block' : 'none';
}

// ── RECUPERAR CONTRASEÑA ──────────────────────────
async function recuperarPassword() {
  const email = document.getElementById('l-email').value.trim().toLowerCase();
  if (!email) { toast('Ingresa tu correo primero', 'err'); return; }
  try {
    await firebase.auth().sendPasswordResetEmail(email);
    toast('¡Correo de recuperación enviado! Revisa tu bandeja 📧', 'ok');
  } catch (e) {
    toast(firebaseAuthError(e.code), 'err');
  }
}

// ── LOGOUT ────────────────────────────────────────
async function doLogout() {
  await firebase.auth().signOut();
  me = null; driverOn = false; map = null;
  DB.clearSession();
  go('landing');
  toast('Sesión cerrada');
}

// ── HELPERS ───────────────────────────────────────
async function cargarSesionFirebase(firebaseUser) {
  let user = await DB.getUser(firebaseUser.uid);
  if (!user) { toast('Usuario no encontrado', 'err'); return; }
  if (user.estatus === 'bloqueado') { toast('Cuenta bloqueada', 'err'); await firebase.auth().signOut(); return; }
  DB.saveSession(user);
  me = user;
  toast('¡Bienvenido, ' + user.nom + '! 👋', 'ok');
  initApp();
}

function firebaseAuthError(code) {
  const errors = {
    'auth/email-already-in-use':    'Este correo ya está registrado',
    'auth/invalid-email':           'Correo inválido',
    'auth/weak-password':           'Contraseña muy débil (mínimo 6 caracteres)',
    'auth/user-not-found':          'Correo no registrado',
    'auth/wrong-password':          'Contraseña incorrecta',
    'auth/invalid-credential':      'Datos incorrectos',
    'auth/too-many-requests':       'Demasiados intentos. Intenta más tarde',
    'auth/network-request-failed':  'Error de conexión',
    'auth/popup-blocked':           'El navegador bloqueó la ventana. Permite popups e intenta de nuevo',
  };
  return errors[code] || 'Error: ' + code;
}

function toggleChoferFields() {
  document.getElementById('chofer-fields').style.display =
    document.getElementById('r-rol').value === 'chofer' ? 'block' : 'none';
}
