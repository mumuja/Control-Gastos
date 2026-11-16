// PEGA AQUÍ TUS CREDENCIALES REALES DE SUPABASE
const SUPABASE_URL = 'https://stzukfgxwsjuztjjmfov.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_sdKNxaC0HQUeGa3thZQAIg_yFoYwa3Z';

let supabaseClient = null;
const credencialesConfiguradas = !SUPABASE_URL.includes('TU-PROYECTO') && !SUPABASE_ANON_KEY.includes('TU_LLAVE');

if (credencialesConfiguradas) {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

const CATEGORIAS_DEFAULT = [
  'Comida / Súper',
  'Gasolina / Auto',
  'Mantenimiento / Repuestos',
  'Casa / Servicios',
  'Ingresos Trabajo',
  'Ingresos Uber',
  'Hobby / Juegos',
  'Salud',
  'Otros'
];

// Estado global
let currentUser = null;
let currentGrupoId = null;
let gruposCache = [];
let movimientosCache = [];
let categoriasCache = [];
let ahorrosCache = [];
let authMode = 'login';
let chartMode = 'balance';
let chartInstance = null;

// Referencias DOM
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const authForm = document.getElementById('auth-form');
const authFeedback = document.getElementById('auth-feedback');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const workspaceSelect = document.getElementById('workspace-select');
const groupCodeBadge = document.getElementById('group-code-badge');
const txForm = document.getElementById('tx-form');
const txList = document.getElementById('tx-list');
const fechaInput = document.getElementById('fecha');
const estadoSelect = document.getElementById('estado');
const addCalendarCheck = document.getElementById('add-calendar');
const reciboInput = document.getElementById('recibo-input');
const monthFilter = document.getElementById('month-filter');
const categoryFilter = document.getElementById('category-filter');
const categoriaSelect = document.getElementById('categoria');

function obtenerFechaLocalISO(dateObj = new Date()) {
  const offset = dateObj.getTimezoneOffset();
  const local = new Date(dateObj.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

const hoyStr = obtenerFechaLocalISO();
if (fechaInput) fechaInput.value = hoyStr;
if (monthFilter) monthFilter.value = hoyStr.slice(0, 7);

fechaInput?.addEventListener('change', () => {
  if (fechaInput.value > obtenerFechaLocalISO()) {
    estadoSelect.value = 'pendiente';
    addCalendarCheck.checked = true;
  } else {
    estadoSelect.value = 'pagado';
    addCalendarCheck.checked = false;
  }
});

reciboInput?.addEventListener('change', () => {
  const file = reciboInput.files[0];
  document.getElementById('receipt-file-label').textContent = file ? file.name : 'Adjuntar imagen';
});

// --- AUTENTICACIÓN ---
function mostrarFeedbackAuth(mensaje, esError = true) {
  authFeedback.textContent = mensaje;
  authFeedback.className = `text-xs p-2.5 rounded-lg border ${
    esError ? 'bg-rose-950/60 border-rose-800 text-rose-300' : 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
  }`;
  authFeedback.classList.remove('hidden');
}

document.getElementById('tab-login')?.addEventListener('click', () => {
  authMode = 'login';
  document.getElementById('tab-login').className = 'py-1.5 text-xs font-semibold rounded-lg bg-slate-800 text-white transition';
  document.getElementById('tab-signup').className = 'py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-white transition';
  document.getElementById('auth-subtitle').textContent = 'Inicia sesión para sincronizar tus datos';
  authSubmitBtn.textContent = 'Entrar';
  authFeedback.classList.add('hidden');
});

document.getElementById('tab-signup')?.addEventListener('click', () => {
  authMode = 'signup';
  document.getElementById('tab-signup').className = 'py-1.5 text-xs font-semibold rounded-lg bg-slate-800 text-white transition';
  document.getElementById('tab-login').className = 'py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-white transition';
  document.getElementById('auth-subtitle').textContent = 'Crea tu usuario personal en Supabase';
  authSubmitBtn.textContent = 'Crear Cuenta';
  authFeedback.classList.add('hidden');
});

async function iniciarSesionExitosa(user) {
  currentUser = user;
  // Mostrar la app inmediatamente sin esperar a que terminen las consultas
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');

  try {
    await cargarGrupos();
  } catch (e) {
    console.warn('Aviso cargando grupos:', e);
  }
  await refrescarTodoElEspacio();
}

async function checkSession() {
  if (!credencialesConfiguradas) {
    mostrarFeedbackAuth('Falta configurar SUPABASE_URL y SUPABASE_ANON_KEY en app.js.');
    return;
  }
  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) {
      mostrarFeedbackAuth('Error de sesión: ' + error.message);
      return;
    }
    if (session && session.user) {
      await iniciarSesionExitosa(session.user);
    } else {
      authScreen.classList.remove('hidden');
      appScreen.classList.add('hidden');
    }
  } catch (err) {
    mostrarFeedbackAuth('Error conectando a Supabase: ' + err.message);
  }
}

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authFeedback.classList.add('hidden');

  if (!credencialesConfiguradas) {
    mostrarFeedbackAuth('Falta pegar tu SUPABASE_ANON_KEY real en app.js.');
    return;
  }

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = authMode === 'login' ? 'Entrando...' : 'Creando cuenta...';

  try {
    if (authMode === 'login') {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        mostrarFeedbackAuth('Error al entrar: ' + error.message);
      } else if (data?.user) {
        await iniciarSesionExitosa(data.user);
      } else {
        mostrarFeedbackAuth('No se recibió sesión de Supabase. Revisa tu usuario.');
      }
    } else {
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) {
        mostrarFeedbackAuth('Error al crear cuenta: ' + error.message);
      } else if (data?.session?.user) {
        await iniciarSesionExitosa(data.session.user);
      } else {
        mostrarFeedbackAuth('Cuenta creada. Revisa tu correo o desactiva "Confirm email" en Supabase.', false);
      }
    }
  } catch (err) {
    mostrarFeedbackAuth('Error inesperado: ' + err.message);
  } finally {
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = authMode === 'login' ? 'Entrar' : 'Crear Cuenta';
  }
});

document.getElementById('logout-btn')?.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  currentUser = null;
  authScreen.classList.remove('hidden');
  appScreen.classList.add('hidden');
});

// --- GRUPOS FAMILIARES ---
async function cargarGrupos() {
  const { data: miembros, error } = await supabaseClient
    .from('grupo_miembros')
    .select('grupo_id, alias, grupos ( id, nombre, codigo_invitacion )')
    .eq('user_id', currentUser.id);

  if (error) {
    console.error('Error cargando grupos:', error);
    return;
  }

  gruposCache = (miembros || [])
    .filter(m => m.grupos)
    .map(m => ({
      id: m.grupos.id,
      nombre: m.grupos.nombre,
      codigo: m.grupos.codigo_invitacion,
      miAlias: m.alias
    }));

  workspaceSelect.innerHTML = `<option value="PERSONAL">👤 Fondo Personal</option>` +
    gruposCache.map(g => `<option value="${g.id}">👨‍👩‍👧‍👦 ${g.nombre}</option>`).join('');

  if (currentGrupoId && gruposCache.some(g => g.id === currentGrupoId)) {
    workspaceSelect.value = currentGrupoId;
  } else {
    currentGrupoId = null;
    workspaceSelect.value = 'PERSONAL';
  }
}

workspaceSelect?.addEventListener('change', async () => {
  currentGrupoId = workspaceSelect.value === 'PERSONAL' ? null : workspaceSelect.value;
  await refrescarTodoElEspacio();
});

async function refrescarTodoElEspacio() {
  const groupActionsBar = document.getElementById('group-actions-bar');
  if (currentGrupoId) {
    const g = gruposCache.find(x => x.id === currentGrupoId);
    if (g) {
      if (groupCodeBadge) groupCodeBadge.textContent = `Código: ${g.codigo}`;
      if (groupActionsBar) groupActionsBar.classList.remove('hidden');
      document.getElementById('balance-label').textContent = `Fondo común: ${g.nombre}`;
      document.getElementById('savings-subtitle').textContent = `Ahorros compartidos (${g.nombre})`;
    }
  } else {
    if (groupActionsBar) groupActionsBar.classList.add('hidden');
    document.getElementById('balance-label').textContent = 'Balance real del periodo';
    document.getElementById('savings-subtitle').textContent = 'Ahorro personal';
  }

  await Promise.allSettled([cargarCategorias(), cargarAhorros(), cargarMovimientos()]);
}

// Crear Grupo Familiar
document.getElementById('create-group-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = document.getElementById('new-group-name').value.trim();
  const alias = document.getElementById('creator-alias').value.trim();

  const { data: grupo, error } = await supabaseClient
    .from('grupos')
    .insert([{ nombre, creado_por: currentUser.id }])
    .select()
    .single();

  if (error) return alert('Error creando grupo: ' + error.message);

  await supabaseClient.from('grupo_miembros').insert([{
    grupo_id: grupo.id,
    user_id: currentUser.id,
    alias
  }]);

  document.getElementById('new-group-name').value = '';
  document.getElementById('creator-alias').value = '';
  cerrarModal('group-modal');
  await cargarGrupos();
  currentGrupoId = grupo.id;
  workspaceSelect.value = grupo.id;
  await refrescarTodoElEspacio();
  alert(`Grupo "${grupo.nombre}" creado. Código de invitación: ${grupo.codigo_invitacion}`);
});

// Unirse a Grupo Familiar
document.getElementById('join-group-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const codigo = document.getElementById('join-group-code').value.trim().toLowerCase();
  const alias = document.getElementById('joiner-alias').value.trim();

  const { data: grupo, error } = await supabaseClient
    .from('grupos')
    .select('*')
    .eq('codigo_invitacion', codigo)
    .single();

  if (error || !grupo) return alert('No se encontró ningún grupo con ese código.');

  const { error: joinError } = await supabaseClient.from('grupo_miembros').insert([{
    grupo_id: grupo.id,
    user_id: currentUser.id,
    alias
  }]);

  if (joinError) return alert('Ya eres miembro o hubo un error: ' + joinError.message);

  document.getElementById('join-group-code').value = '';
  document.getElementById('joiner-alias').value = '';
  cerrarModal('group-modal');
  await cargarGrupos();
  currentGrupoId = grupo.id;
  workspaceSelect.value = grupo.id;
  await refrescarTodoElEspacio();
});

// Eliminar o salir del grupo
document.getElementById('delete-group-btn')?.addEventListener('click', async () => {
  if (!currentGrupoId) return;
  const g = gruposCache.find(x => x.id === currentGrupoId);
  if (!confirm(`¿Seguro que deseas eliminar o salir del grupo "${g.nombre}"?`)) return;

  const { error: delGroupErr } = await supabaseClient.from('grupos').delete().eq('id', currentGrupoId);
  if (delGroupErr) {
    await supabaseClient.from('grupo_miembros').delete().eq('grupo_id', currentGrupoId).eq('user_id', currentUser.id);
  }

  currentGrupoId = null;
  await cargarGrupos();
  await refrescarTodoElEspacio();
});

// --- COMPRESIÓN Y SUBIDA DE RECIBOS ---
function comprimirImagen(file, maxWidth = 1000, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

async function subirRecibo(file) {
  const blobComprimido = await comprimirImagen(file);
  const fileName = `${currentUser.id}/${Date.now()}.jpg`;
  const { error } = await supabaseClient.storage.from('recibos').upload(fileName, blobComprimido, { contentType: 'image/jpeg' });
  if (error) throw error;
  const { data } = supabaseClient.storage.from('recibos').getPublicUrl(fileName);
  return data.publicUrl;
}

function verRecibo(url) {
  document.getElementById('receipt-preview-img').src = url;
  abrirModal('receipt-modal');
}

// --- AHORROS ---
async function cargarAhorros() {
  let query = supabaseClient.from('ahorros').select('*').order('created_at', { ascending: true });
  query = currentGrupoId ? query.eq('grupo_id', currentGrupoId) : query.is('grupo_id', null);
  const { data, error } =
