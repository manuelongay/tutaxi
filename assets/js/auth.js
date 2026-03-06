/* ============================================================
   tuTaxi — auth.js
   Registro, login y sesión de usuario
   ============================================================ */

async function doRegister() {
  const nom   = document.getElementById('r-nom').value.trim();
  const ape   = document.getElementById('r-ape').value.trim();
  const email = document.getElementById('r-email').value.trim().toLowerCase();
  const tel   = document.getElementById('r-tel').value.trim();
  const pass  = document.getElementById('r-pass').value;
  const rol   = document.getElementById('r-rol').value;

  if (!nom || !email || !pass || !tel) { toast('Completa todos los campos', 'err'); return; }
  if (pass.length < 6) { toast('Contraseña mínimo 6 caracteres', 'err'); return; }

  const users = await DB.users();
  if (users.find(u => u.email === email)) { toast('Correo ya registrado', 'err'); return; }

  const user = {
    id: 'u_' + Date.now(),
    nom, ape, nombre: nom, apellido: ape,
    email, tel, telefono: tel,
    pass, rol,
    estatus: 'activo',
    fecha: new Date().toISOString(),
    fechaRegistro: new Date().toISOString(),
  };

  if (rol === 'chofer') {
    const veh = document.getElementById('r-veh').value.trim();
    const pla = document.getElementById('r-pla').value.trim();
    if (!veh || !pla) { toast('Completa datos del vehículo', 'err'); return; }
    user.veh = veh;   user.vehiculo  = veh;
    user.pla = pla;   user.placas    = pla;
    user.col = document.getElementById('r-col').value.trim(); user.color    = user.col;
    user.lic = document.getElementById('r-lic').value.trim(); user.licencia = user.lic;
    user.estatusChofer = 'activo';
  }

  await DB.saveUser(user);
  DB.saveSession(user);
  me = user;
  toast('¡Cuenta creada! 🎉', 'ok');
  initApp();
}

async function doLogin() {
  const email = document.getElementById('l-email').value.trim().toLowerCase();
  const pass  = document.getElementById('l-pass').value;
  const users = await DB.users();
  const user  = users.find(u => u.email === email && u.pass === pass);
  if (!user) { toast('Datos incorrectos', 'err'); return; }
  if (user.estatus === 'bloqueado') { toast('Cuenta bloqueada', 'err'); return; }
  DB.saveSession(user);
  me = user;
  toast('¡Bienvenido, ' + user.nom + '! 👋', 'ok');
  initApp();
}

function doLogout() {
  me = null; driverOn = false; map = null;
  DB.clearSession();
  go('landing');
  toast('Sesión cerrada');
}

function toggleChoferFields() {
  document.getElementById('chofer-fields').style.display =
    document.getElementById('r-rol').value === 'chofer' ? 'block' : 'none';
}
