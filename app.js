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

let currentUser = null;
let currentGrupoId = null;
let gruposCache = [];
let movimientosCache = [];
let categoriasCache = [];
let ahorrosCache = [];
let authMode = 'login';
let chartMode = 'balance';
let chartInstance = null;

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
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  try {
    await cargarGrupos();
  } catch (e) {
    console.warn('Aviso grupos:', e);
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
      if (error) mostrarFeedbackAuth('Error al entrar: ' + error.message);
      else if (data?.user) await iniciarSesionExitosa(data.user);
      else mostrarFeedbackAuth('No se recibió sesión de Supabase.');
    } else {
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) mostrarFeedbackAuth('Error al crear cuenta: ' + error.message);
      else if (data?.session?.user) await iniciarSesionExitosa(data.session.user);
      else mostrarFeedbackAuth('Cuenta creada. Desactiva "Confirm email" en Supabase o revisa tu correo.', false);
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

  if (error) return console.error('Error cargando grupos:', error);

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

// --- RECIBOS ---
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
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
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
  const { data, error } = await query;
  if (error) return console.error('Error ahorros:', error);
  ahorrosCache = data || [];
  renderizarAhorros();
}

function renderizarAhorros() {
  const container = document.getElementById('savings-list');
  if (ahorrosCache.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-500 text-center py-2">Aún no tienes metas de ahorro aquí.</p>';
    return;
  }
  container.innerHTML = ahorrosCache.map(a => {
    const pct = Math.min(100, Math.round((Number(a.actual) / Number(a.meta)) * 100));
    return `
      <div class="bg-slate-950/70 border border-slate-800 p-3 rounded-xl space-y-2">
        <div class="flex justify-between items-center">
          <div>
            <p class="text-sm font-semibold text-slate-200">${a.nombre}</p>
            <p class="text-xs text-cyan-400 font-medium">$${Number(a.actual).toFixed(2)} <span class="text-slate-500">/ $${Number(a.meta).toFixed(2)} (${pct}%)</span></p>
          </div>
          <div class="flex items-center gap-1.5">
            <button onclick="abonarAhorro('${a.id}', ${a.actual}, '${a.nombre}')" class="bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/30 text-xs px-2 py-1 rounded-lg transition">+ Abonar</button>
            <button onclick="eliminarAhorro('${a.id}')" class="text-slate-600 hover:text-rose-400 text-xs px-1">✕</button>
          </div>
        </div>
        <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
          <div class="bg-cyan-500 h-full transition-all duration-300" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

document.getElementById('new-saving-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = document.getElementById('saving-name').value.trim();
  const meta = parseFloat(document.getElementById('saving-target').value);
  const actual = parseFloat(document.getElementById('saving-initial').value) || 0;

  const { error } = await supabaseClient.from('ahorros').insert([{ nombre, meta, actual, grupo_id: currentGrupoId }]);
  if (error) return alert('Error al crear meta: ' + error.message);

  document.getElementById('saving-name').value = '';
  document.getElementById('saving-target').value = '';
  document.getElementById('saving-initial').value = '0';
  cerrarModal('saving-modal');
  await cargarAhorros();
});

async function abonarAhorro(id, saldoActual, nombreMeta) {
  const montoStr = prompt(`¿Cuánto deseas abonar a "${nombreMeta}"? (Usa signo - para retirar)`);
  if (!montoStr) return;
  const delta = parseFloat(montoStr);
  if (isNaN(delta) || delta === 0) return;
  const nuevoSaldo = Math.max(0, Number(saldoActual) + delta);
  const { error } = await supabaseClient.from('ahorros').update({ actual: nuevoSaldo }).eq('id', id);
  if (!error) await cargarAhorros();
}

async function eliminarAhorro(id) {
  if (!confirm('¿Eliminar esta meta de ahorro?')) return;
  const { error } = await supabaseClient.from('ahorros').delete().eq('id', id);
  if (!error) await cargarAhorros();
}

// --- CATEGORÍAS ---
async function cargarCategorias() {
  let query = supabaseClient.from('categorias').select('*').order('nombre', { ascending: true });
  query = currentGrupoId ? query.eq('grupo_id', currentGrupoId) : query.is('grupo_id', null);
  let { data, error } = await query;
  if (error) return console.error('Error cargando categorías:', error);

  if (!data || data.length === 0) {
    const iniciales = CATEGORIAS_DEFAULT.map(nombre => ({ nombre, tipo: 'ambos', grupo_id: currentGrupoId }));
    const res = await supabaseClient.from('categorias').insert(iniciales).select();
    if (!res.error) data = res.data;
  }

  categoriasCache = data || [];
  renderizarCategorias();
}

function renderizarCategorias() {
  categoriaSelect.innerHTML = categoriasCache.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join('');
  const filtroActual = categoryFilter.value;
  categoryFilter.innerHTML = `<option value="TODAS">Todas las categorías</option>` +
    categoriasCache.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join('');
  if ([...categoryFilter.options].some(o => o.value === filtroActual)) {
    categoryFilter.value = filtroActual;
  }

  document.getElementById('cat-list').innerHTML = categoriasCache.map(c => `
    <div class="flex justify-between items-center bg-slate-800/80 px-3 py-2 rounded-lg border border-slate-700/50">
      <span class="text-sm text-slate-200">${c.nombre}</span>
      <div class="flex gap-2">
        <button onclick="renombrarCategoria('${c.id}', '${c.nombre}')" class="text-xs text-indigo-400 hover:text-indigo-300">Editar</button>
        <button onclick="eliminarCategoria('${c.id}')" class="text-xs text-rose-400 hover:text-rose-300">Borrar</button>
      </div>
    </div>
  `).join('');
}

document.getElementById('new-cat-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('new-cat-name');
  const nombre = input.value.trim();
  if (!nombre) return;
  const { error } = await supabaseClient.from('categorias').insert([{ nombre, tipo: 'ambos', grupo_id: currentGrupoId }]);
  if (!error) { input.value = ''; await cargarCategorias(); }
});

async function renombrarCategoria(id, nombreActual) {
  const nuevoNombre = prompt('Nuevo nombre:', nombreActual);
  if (!nuevoNombre || nuevoNombre.trim() === '' || nuevoNombre === nombreActual) return;
  const { error } = await supabaseClient.from('categorias').update({ nombre: nuevoNombre.trim() }).eq('id', id);
  if (!error) await cargarCategorias();
}

async function eliminarCategoria(id) {
  if (!confirm('¿Borrar esta categoría?')) return;
  const { error } = await supabaseClient.from('categorias').delete().eq('id', id);
  if (!error) await cargarCategorias();
}

// --- GRÁFICOS ---
document.getElementById('chart-mode-balance')?.addEventListener('click', () => {
  chartMode = 'balance';
  document.getElementById('chart-mode-balance').className = 'px-2.5 py-1 rounded-md bg-slate-800 text-white font-medium';
  document.getElementById('chart-mode-cats').className = 'px-2.5 py-1 rounded-md text-slate-400 hover:text-white';
  renderizarUI();
});

document.getElementById('chart-mode-cats')?.addEventListener('click', () => {
  chartMode = 'cats';
  document.getElementById('chart-mode-cats').className = 'px-2.5 py-1 rounded-md bg-slate-800 text-white font-medium';
  document.getElementById('chart-mode-balance').className = 'px-2.5 py-1 rounded-md text-slate-400 hover:text-white';
  renderizarUI();
});

function actualizarGrafico(ingresos, gastos, movimientosPagadosMes) {
  const canvas = document.getElementById('finance-chart');
  const emptyMsg = document.getElementById('chart-empty-msg');
  if (!canvas) return;
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  if (chartMode === 'balance') {
    if (ingresos === 0 && gastos === 0) {
      canvas.classList.add('hidden'); emptyMsg.classList.remove('hidden'); return;
    }
    canvas.classList.remove('hidden'); emptyMsg.classList.add('hidden');
    chartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: ['Ingresos', 'Gastos'],
        datasets: [{ data: [ingresos, gastos], backgroundColor: ['#10b981', '#f43f5e'], borderRadius: 8, barThickness: 48 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#1e293b' }, ticks: { color: '#94a3b8', callback: v => '$' + v } },
          x: { grid: { display: false }, ticks: { color: '#cbd5e1', font: { weight: 'bold' } } }
        }
      }
    });
  } else {
    const soloGastos = movimientosPagadosMes.filter(m => m.tipo === 'gasto');
    if (soloGastos.length === 0) {
      canvas.classList.add('hidden'); emptyMsg.classList.remove('hidden'); return;
    }
    canvas.classList.remove('hidden'); emptyMsg.classList.add('hidden');

    const totalesPorCat = {};
    soloGastos.forEach(g => { totalesPorCat[g.categoria] = (totalesPorCat[g.categoria] || 0) + Number(g.monto); });
    const labels = Object.keys(totalesPorCat);
    const values = Object.values(totalesPorCat);
    const paleta = ['#6366f1', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#ec4899', '#8b5cf6', '#84cc16'];

    chartInstance = new Chart(canvas, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: labels.map((_, i) => paleta[i % paleta.length]), borderWidth: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: { legend: { position: 'right', labels: { color: '#cbd5e1', boxWidth: 12, font: { size: 11 } } } }
      }
    });
  }
}

// --- MOVIMIENTOS ---
async function cargarMovimientos() {
  let query = supabaseClient
    .from('movimientos')
    .select('*')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false });

  query = currentGrupoId ? query.eq('grupo_id', currentGrupoId) : query.is('grupo_id', null);

  const { data, error } = await query;
  if (error) return console.error('Error cargando datos:', error);
  movimientosCache = data || [];
  renderizarUI();
}

txForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    const tipo = document.querySelector('input[name="tipo"]:checked').value;
    const monto = parseFloat(document.getElementById('monto').value);
    const fecha = document.getElementById('fecha').value;
    const categoria = document.getElementById('categoria').value;
    const estado = document.getElementById('estado').value;
    const descripcion = document.getElementById('descripcion').value.trim();
    const agendarCalendar = document.getElementById('add-calendar').checked;
    const file = reciboInput?.files[0];

    let reciboUrl = null;
    if (file) {
      btn.textContent = 'Subiendo recibo...';
      reciboUrl = await subirRecibo(file);
    }

    const grupoActual = currentGrupoId ? gruposCache.find(g => g.id === currentGrupoId) : null;
    const autorNombre = grupoActual ? grupoActual.miAlias : currentUser.email.split('@')[0];

    const { error } = await supabaseClient.from('movimientos').insert([{
      tipo, monto, fecha, categoria, descripcion, estado,
      grupo_id: currentGrupoId,
      autor_email: autorNombre,
      recibo_url: reciboUrl
    }]);

    if (error) throw error;

    if (agendarCalendar) abrirGoogleCalendar({ tipo, monto, categoria, descripcion, fecha });

    document.getElementById('monto').value = '';
    document.getElementById('descripcion').value = '';
    if (reciboInput) reciboInput.value = '';
    document.getElementById('receipt-file-label').textContent = 'Adjuntar imagen';
    fechaInput.value = obtenerFechaLocalISO();
    estadoSelect.value = 'pagado';
    addCalendarCheck.checked = false;
    await cargarMovimientos();
  } catch (err) {
    alert('Error al guardar: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar Movimiento';
  }
});

async function marcarComoPagado(id) {
  const { error } = await supabaseClient.from('movimientos').update({ estado: 'pagado', fecha: obtenerFechaLocalISO() }).eq('id', id);
  if (!error) cargarMovimientos();
}

async function eliminarMovimiento(id) {
  if (!confirm('¿Eliminar este registro?')) return;
  const { error } = await supabaseClient.from('movimientos').delete().eq('id', id);
  if (!error) cargarMovimientos();
}

function calcularDiasRestantes(fechaStr) {
  const hoy = new Date(obtenerFechaLocalISO() + 'T00:00:00');
  const objetivo = new Date(fechaStr + 'T00:00:00');
  const diffDias = Math.round((objetivo - hoy) / (1000 * 60 * 60 * 24));
  if (diffDias < 0) return `Atrasado ${Math.abs(diffDias)}d`;
  if (diffDias === 0) return 'Vence hoy';
  if (diffDias === 1) return 'Mañana';
  return `En ${diffDias} días`;
}

function renderizarUI() {
  const mesSeleccionado = monthFilter.value;
  const catSeleccionada = categoryFilter.value;

  const pendientes = movimientosCache
    .filter(m => m.estado === 'pendiente')
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const upcomingSection = document.getElementById('upcoming-section');
  const upcomingList = document.getElementById('upcoming-list');
  const pendingBadge = document.getElementById('pending-badge');

  if (pendientes.length > 0) {
    upcomingSection.classList.remove('hidden');
    pendingBadge.classList.remove('hidden');
    document.getElementById('upcoming-count').textContent = `${pendientes.length} pendiente(s)`;
    const totalPendienteGastos = pendientes.filter(p => p.tipo === 'gasto').reduce((acc, p) => acc + Number(p.monto), 0);
    document.getElementById('pendiente-total').textContent = `$${totalPendienteGastos.toFixed(2)}`;

    upcomingList.innerHTML = pendientes.map(p => {
      const esGasto = p.tipo === 'gasto';
      const etiquetaDias = calcularDiasRestantes(p.fecha);
      const calData = encodeURIComponent(JSON.stringify(p));
      const autorTag = currentGrupoId && p.autor_email ? ` • Por ${p.autor_email}` : '';
      return `
        <div class="bg-slate-900/90 border border-amber-800/40 p-3 rounded-xl flex justify-between items-center">
          <div>
            <div class="flex items-center gap-2">
              <p class="text-sm font-semibold text-slate-100">${p.descripcion || p.categoria}</p>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">${etiquetaDias}</span>
            </div>
            <p class="text-xs text-slate-400">${p.categoria} • ${p.fecha}${autorTag}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-bold ${esGasto ? 'text-amber-400' : 'text-emerald-400'}">$${Number(p.monto).toFixed(2)}</span>
            ${p.recibo_url ? `<button onclick="verRecibo('${p.recibo_url}')" title="Ver recibo" class="text-indigo-400 text-xs">🧾</button>` : ''}
            <button onclick="marcarComoPagado('${p.id}')" title="Marcar como pagado hoy" class="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-600/40 text-xs px-2 py-1 rounded-lg transition">✓</button>
            <button onclick="recordarExistente('${calData}')" title="Recordatorio Calendar" class="text-slate-400 hover:text-indigo-400 text-xs">📅</button>
            <button onclick="eliminarMovimiento('${p.id}')" title="Eliminar" class="text-slate-600 hover:text-rose-400 text-xs px-1">✕</button>
          </div>
        </div>
      `;
    }).join('');
  } else {
    upcomingSection.classList.add('hidden');
    pendingBadge.classList.add('hidden');
  }

  const pagadosMes = movimientosCache.filter(m => {
    const esPagado = m.estado !== 'pendiente';
    const coincideMes = mesSeleccionado ? m.fecha.startsWith(mesSeleccionado) : true;
    return esPagado && coincideMes;
  });

  const filtrados = pagadosMes.filter(m => catSeleccionada === 'TODAS' ? true : m.categoria === catSeleccionada);

  let ingresos = 0;
  let gastos = 0;
  filtrados.forEach(m => {
    if (m.tipo === 'ingreso') ingresos += Number(m.monto);
    else gastos += Number(m.monto);
  });

  document.getElementById('balance-total').textContent = `$${(ingresos - gastos).toFixed(2)}`;
  document.getElementById('ingresos-total').textContent = `+$${ingresos.toFixed(2)}`;
  document.getElementById('gastos-total').textContent = `-$${gastos.toFixed(2)}`;

  actualizarGrafico(ingresos, gastos, pagadosMes);

  txList.innerHTML = filtrados.length === 0 
    ? '<p class="text-center text-slate-500 text-xs py-6">No hay movimientos ejecutados en este filtro.</p>'
    : filtrados.map(m => {
        const esIngreso = m.tipo === 'ingreso';
        const colorMonto = esIngreso ? 'text-emerald-400' : 'text-rose-400';
        const signo = esIngreso ? '+' : '-';
        const calData = encodeURIComponent(JSON.stringify(m));
        const autorTag = currentGrupoId && m.autor_email ? ` • Por ${m.autor_email}` : '';
        return `
          <div class="bg-slate-900 border border-slate-800/80 p-3 rounded-xl flex justify-between items-center">
            <div>
              <p class="text-sm font-medium text-slate-200">${m.descripcion || m.categoria}</p>
              <p class="text-xs text-slate-500">${m.categoria} • ${m.fecha}${autorTag}</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm font-bold ${colorMonto}">${signo}$${Number(m.monto).toFixed(2)}</span>
              ${m.recibo_url ? `<button onclick="verRecibo('${m.recibo_url}')" title="Ver recibo adjunto" class="text-indigo-400 hover:text-indigo-300 text-xs">🧾</button>` : ''}
              <button onclick="recordarExistente('${calData}')" title="Recordatorio en Calendar" class="text-slate-500 hover:text-indigo-400 text-xs">📅</button>
              <button onclick="eliminarMovimiento('${m.id}')" title="Eliminar" class="text-slate-600 hover:text-rose-400 text-xs px-1">✕</button>
            </div>
          </div>
        `;
      }).join('');
}

function abrirGoogleCalendar({ tipo, monto, categoria, descripcion, fecha }) {
  const titulo = encodeURIComponent(`Pago / Recordatorio: ${descripcion || categoria} ($${monto.toFixed(2)})`);
  const detalles = encodeURIComponent(`Tipo: ${tipo.toUpperCase()}\nCategoría: ${categoria}\nMonto: $${monto.toFixed(2)}`);
  const fechaLimpia = fecha.replace(/-/g, '');
  window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${titulo}&dates=${fechaLimpia}/${fechaLimpia}&details=${detalles}`, '_blank');
}

function recordarExistente(encodedData) {
  const m = JSON.parse(decodeURIComponent(encodedData));
  abrirGoogleCalendar({ tipo: m.tipo, monto: Number(m.monto), categoria: m.categoria, descripcion: m.descripcion, fecha: m.fecha });
}

function abrirModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('hidden'); el.classList.add('flex'); }
}
function cerrarModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('hidden'); el.classList.remove('flex'); }
}

document.getElementById('open-cat-modal')?.addEventListener('click', () => abrirModal('cat-modal'));
document.getElementById('close-cat-modal')?.addEventListener('click', () => cerrarModal('cat-modal'));
document.getElementById('open-group-modal')?.addEventListener('click', () => abrirModal('group-modal'));
document.getElementById('close-group-modal')?.addEventListener('click', () => cerrarModal('group-modal'));
document.getElementById('open-saving-modal')?.addEventListener('click', () => abrirModal('saving-modal'));
document.getElementById('close-saving-modal')?.addEventListener('click', () => cerrarModal('saving-modal'));
document.getElementById('close-receipt-modal')?.addEventListener('click', () => cerrarModal('receipt-modal'));

monthFilter?.addEventListener('change', renderizarUI);
categoryFilter?.addEventListener('change', renderizarUI);

document.getElementById('export-btn')?.addEventListener('click', () => {
  if (movimientosCache.length === 0) return alert('No hay datos para exportar.');
  const headers = ['Fecha', 'Estado', 'Tipo', 'Categoria', 'Descripcion', 'Monto', 'Autor', 'Recibo'];
  const rows = movimientosCache.map(m => [
    m.fecha, m.estado || 'pagado', m.tipo, `"${m.categoria}"`, `"${m.descripcion || ''}"`, m.monto, `"${m.autor_email || ''}"`, m.recibo_url || ''
  ]);
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `respaldo_${currentGrupoId ? 'familiar' : 'personal'}_${obtenerFechaLocalISO()}.csv`;
  a.click();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW error:', err));
}

checkSession();
