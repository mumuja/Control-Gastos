// REEMPLAZA ESTOS DOS VALORES CON LOS DE TU PROYECTO SUPABASE
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

// Referencias DOM
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const authForm = document.getElementById('auth-form');
const authFeedback = document.getElementById('auth-feedback');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const txForm = document.getElementById('tx-form');
const txList = document.getElementById('tx-list');
const fechaInput = document.getElementById('fecha');
const monthFilter = document.getElementById('month-filter');
const categoryFilter = document.getElementById('category-filter');
const categoriaSelect = document.getElementById('categoria');

let authMode = 'login'; // 'login' | 'signup'
let chartMode = 'balance'; // 'balance' | 'cats'
let chartInstance = null;
let movimientosCache = [];
let categoriasCache = [];

// Configurar fechas iniciales
const hoy = new Date();
fechaInput.valueAsDate = hoy;
monthFilter.value = hoy.toISOString().slice(0, 7);

// --- TABS DE LOGIN / REGISTRO ---
function mostrarFeedbackAuth(mensaje, esError = true) {
  authFeedback.textContent = mensaje;
  authFeedback.className = `text-xs p-2.5 rounded-lg border ${
    esError
      ? 'bg-rose-950/60 border-rose-800 text-rose-300'
      : 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
  }`;
  authFeedback.classList.remove('hidden');
}

tabLogin.addEventListener('click', () => {
  authMode = 'login';
  tabLogin.className = 'py-1.5 text-xs font-semibold rounded-lg bg-slate-800 text-white transition';
  tabSignup.className = 'py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-white transition';
  document.getElementById('auth-subtitle').textContent = 'Inicia sesión para sincronizar tus datos';
  authSubmitBtn.textContent = 'Entrar';
  authFeedback.classList.add('hidden');
});

tabSignup.addEventListener('click', () => {
  authMode = 'signup';
  tabSignup.className = 'py-1.5 text-xs font-semibold rounded-lg bg-slate-800 text-white transition';
  tabLogin.className = 'py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-white transition';
  document.getElementById('auth-subtitle').textContent = 'Crea tu usuario personal en Supabase';
  authSubmitBtn.textContent = 'Crear Cuenta';
  authFeedback.classList.add('hidden');
});

// --- AUTENTICACIÓN ---
async function checkSession() {
  if (!credencialesConfiguradas) {
    mostrarFeedbackAuth('Falta configurar SUPABASE_URL y SUPABASE_ANON_KEY en el archivo app.js.');
    return;
  }

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      authScreen.classList.add('hidden');
      appScreen.classList.remove('hidden');
      await cargarCategorias();
      await cargarMovimientos();
    } else {
      authScreen.classList.remove('hidden');
      appScreen.classList.add('hidden');
    }
  } catch (err) {
    mostrarFeedbackAuth('Error de conexión con Supabase: ' + err.message);
  }
}

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authFeedback.classList.add('hidden');

  if (!credencialesConfiguradas) {
    mostrarFeedbackAuth('Primero pega tu URL y Publishable Key en app.js.');
    return;
  }

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = authMode === 'login' ? 'Entrando...' : 'Creando cuenta...';

  try {
    if (authMode === 'login') {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        mostrarFeedbackAuth('Error al entrar: ' + error.message);
      } else {
        await checkSession();
      }
    } else {
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) {
        mostrarFeedbackAuth('Error al crear cuenta: ' + error.message);
      } else if (data.session) {
        await checkSession();
      } else {
        mostrarFeedbackAuth('Cuenta creada. Revisa tu correo para confirmar o desactiva "Confirm email" en Supabase.', false);
      }
    }
  } catch (err) {
    mostrarFeedbackAuth('Fallo inesperado: ' + err.message);
  } finally {
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = authMode === 'login' ? 'Entrar' : 'Crear Cuenta';
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  checkSession();
});

// --- GESTIÓN DE CATEGORÍAS ---
async function cargarCategorias() {
  let { data, error } = await supabaseClient
    .from('categorias')
    .select('*')
    .order('nombre', { ascending: true });

  if (error) {
    console.error('Error cargando categorías:', error);
    return;
  }

  if (data.length === 0) {
    const iniciales = CATEGORIAS_DEFAULT.map(nombre => ({ nombre, tipo: 'ambos' }));
    const res = await supabaseClient.from('categorias').insert(iniciales).select();
    if (!res.error) data = res.data;
  }

  categoriasCache = data;
  renderizarCategorias();
}

function renderizarCategorias() {
  categoriaSelect.innerHTML = categoriasCache
    .map(c => `<option value="${c.nombre}">${c.nombre}</option>`)
    .join('');

  const filtroActual = categoryFilter.value;
  categoryFilter.innerHTML = `<option value="TODAS">Todas las categorías</option>` +
    categoriasCache.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join('');
  if ([...categoryFilter.options].some(o => o.value === filtroActual)) {
    categoryFilter.value = filtroActual;
  }

  const catList = document.getElementById('cat-list');
  catList.innerHTML = categoriasCache.map(c => `
    <div class="flex justify-between items-center bg-slate-800/80 px-3 py-2 rounded-lg border border-slate-700/50">
      <span class="text-sm text-slate-200">${c.nombre}</span>
      <div class="flex gap-2">
        <button onclick="renombrarCategoria('${c.id}', '${c.nombre}')" class="text-xs text-indigo-400 hover:text-indigo-300">Editar</button>
        <button onclick="eliminarCategoria('${c.id}')" class="text-xs text-rose-400 hover:text-rose-300">Borrar</button>
      </div>
    </div>
  `).join('');
}

document.getElementById('new-cat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('new-cat-name');
  const nombre = input.value.trim();
  if (!nombre) return;

  const { error } = await supabaseClient.from('categorias').insert([{ nombre, tipo: 'ambos' }]);
  if (!error) {
    input.value = '';
    await cargarCategorias();
  }
});

async function renombrarCategoria(id, nombreActual) {
  const nuevoNombre = prompt('Nuevo nombre para la categoría:', nombreActual);
  if (!nuevoNombre || nuevoNombre.trim() === '' || nuevoNombre === nombreActual) return;

  const { error } = await supabaseClient
    .from('categorias')
    .update({ nombre: nuevoNombre.trim() })
    .eq('id', id);

  if (!error) await cargarCategorias();
}

async function eliminarCategoria(id) {
  if (!confirm('¿Borrar esta categoría?')) return;
  const { error } = await supabaseClient.from('categorias').delete().eq('id', id);
  if (!error) await cargarCategorias();
}

const catModal = document.getElementById('cat-modal');
document.getElementById('open-cat-modal').addEventListener('click', () => {
  catModal.classList.remove('hidden');
  catModal.classList.add('flex');
});
document.getElementById('close-cat-modal').addEventListener('click', () => {
  catModal.classList.add('hidden');
  catModal.classList.remove('flex');
});

// --- GRÁFICOS ---
const btnChartBalance = document.getElementById('chart-mode-balance');
const btnChartCats = document.getElementById('chart-mode-cats');

btnChartBalance.addEventListener('click', () => {
  chartMode = 'balance';
  btnChartBalance.className = 'px-2.5 py-1 rounded-md bg-slate-800 text-white font-medium';
  btnChartCats.className = 'px-2.5 py-1 rounded-md text-slate-400 hover:text-white';
  renderizarUI();
});

btnChartCats.addEventListener('click', () => {
  chartMode = 'cats';
  btnChartCats.className = 'px-2.5 py-1 rounded-md bg-slate-800 text-white font-medium';
  btnChartBalance.className = 'px-2.5 py-1 rounded-md text-slate-400 hover:text-white';
  renderizarUI();
});

function actualizarGrafico(ingresos, gastos, movimientosMes) {
  const canvas = document.getElementById('finance-chart');
  const emptyMsg = document.getElementById('chart-empty-msg');

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  if (chartMode === 'balance') {
    if (ingresos === 0 && gastos === 0) {
      canvas.classList.add('hidden');
      emptyMsg.classList.remove('hidden');
      return;
    }
    canvas.classList.remove('hidden');
    emptyMsg.classList.add('hidden');

    chartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: ['Ingresos', 'Gastos'],
        datasets: [{
          data: [ingresos, gastos],
          backgroundColor: ['#10b981', '#f43f5e'],
          borderRadius: 8,
          barThickness: 48
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: '#1e293b' },
            ticks: { color: '#94a3b8', callback: v => '$' + v }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#cbd5e1', font: { weight: 'bold' } }
          }
        }
      }
    });
  } else {
    // Agrupar gastos por categoría
    const soloGastos = movimientosMes.filter(m => m.tipo === 'gasto');
    if (soloGastos.length === 0) {
      canvas.classList.add('hidden');
      emptyMsg.classList.remove('hidden');
      return;
    }
    canvas.classList.remove('hidden');
    emptyMsg.classList.add('hidden');

    const totalesPorCat = {};
    soloGastos.forEach(g => {
      totalesPorCat[g.categoria] = (totalesPorCat[g.categoria] || 0) + Number(g.monto);
    });

    const labels = Object.keys(totalesPorCat);
    const values = Object.values(totalesPorCat);
    const paleta = ['#6366f1', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#ec4899', '#8b5cf6', '#84cc16'];

    chartInstance = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: labels.map((_, i) => paleta[i % paleta.length]),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#cbd5e1', boxWidth: 12, font: { size: 11 } }
          }
        }
      }
    });
  }
}

// --- GOOGLE CALENDAR REMINDER ---
function abrirGoogleCalendar({ tipo, monto, categoria, descripcion, fecha }) {
  const titulo = encodeURIComponent(`Pago / Recordatorio: ${descripcion || categoria} ($${monto.toFixed(2)})`);
  const detalles = encodeURIComponent(`Tipo: ${tipo.toUpperCase()}\nCategoría: ${categoria}\nMonto: $${monto.toFixed(2)}\nRegistrado desde Control de Gastos`);
  const fechaLimpia = fecha.replace(/-/g, '');
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${titulo}&dates=${fechaLimpia}/${fechaLimpia}&details=${detalles}`;
  window.open(url, '_blank');
}

// --- MOVIMIENTOS ---
async function cargarMovimientos() {
  const { data, error } = await supabaseClient
    .from('movimientos')
    .select('*')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error cargando datos:', error);
    return;
  }

  movimientosCache = data;
  renderizarUI();
}

txForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  const tipo = document.querySelector('input[name="tipo"]:checked').value;
  const monto = parseFloat(document.getElementById('monto').value);
  const fecha = document.getElementById('fecha').value;
  const categoria = document.getElementById('categoria').value;
  const descripcion = document.getElementById('descripcion').value.trim();
  const agendarCalendar = document.getElementById('add-calendar').checked;

  const { error } = await supabaseClient
    .from('movimientos')
    .insert([{ tipo, monto, fecha, categoria, descripcion }]);

  btn.disabled = false;
  btn.textContent = 'Guardar Movimiento';

  if (error) {
    alert('Error al guardar: ' + error.message);
  } else {
    if (agendarCalendar) {
      abrirGoogleCalendar({ tipo, monto, categoria, descripcion, fecha });
    }
    document.getElementById('monto').value = '';
    document.getElementById('descripcion').value = '';
    document.getElementById('add-calendar').checked = false;
    cargarMovimientos();
  }
});

async function eliminarMovimiento(id) {
  if (!confirm('¿Eliminar este registro?')) return;
  const { error } = await supabaseClient.from('movimientos').delete().eq('id', id);
  if (!error) cargarMovimientos();
}

function renderizarUI() {
  const mesSeleccionado = monthFilter.value;
  const catSeleccionada = categoryFilter.value;

  const delMes = movimientosCache.filter(m => mesSeleccionado ? m.fecha.startsWith(mesSeleccionado) : true);
  const filtrados = delMes.filter(m => catSeleccionada === 'TODAS' ? true : m.categoria === catSeleccionada);

  let ingresos = 0;
  let gastos = 0;

  filtrados.forEach(m => {
    if (m.tipo === 'ingreso') ingresos += Number(m.monto);
    else gastos += Number(m.monto);
  });

  const balance = ingresos - gastos;
  document.getElementById('balance-total').textContent = `$${balance.toFixed(2)}`;
  document.getElementById('ingresos-total').textContent = `+$${ingresos.toFixed(2)}`;
  document.getElementById('gastos-total').textContent = `-$${gastos.toFixed(2)}`;

  actualizarGrafico(ingresos, gastos, delMes);

  txList.innerHTML = filtrados.length === 0 
    ? '<p class="text-center text-slate-500 text-xs py-6">No hay movimientos en este filtro.</p>'
    : filtrados.map(m => {
        const esIngreso = m.tipo === 'ingreso';
        const colorMonto = esIngreso ? 'text-emerald-400' : 'text-rose-400';
        const signo = esIngreso ? '+' : '-';
        const calData = encodeURIComponent(JSON.stringify(m));
        return `
          <div class="bg-slate-900 border border-slate-800/80 p-3 rounded-xl flex justify-between items-center">
            <div>
              <p class="text-sm font-medium text-slate-200">${m.descripcion || m.categoria}</p>
              <p class="text-xs text-slate-500">${m.categoria} • ${m.fecha}</p>
            </div>
            <div class="flex items-center gap-2.5">
              <span class="text-sm font-bold ${colorMonto}">${signo}$${Number(m.monto).toFixed(2)}</span>
              <button onclick="recordarExistente('${calData}')" title="Crear recordatorio en Calendar" class="text-slate-500 hover:text-indigo-400 text-xs">📅</button>
              <button onclick="eliminarMovimiento('${m.id}')" title="Eliminar" class="text-slate-600 hover:text-rose-400 text-xs px-1">✕</button>
            </div>
          </div>
        `;
      }).join('');
}

function recordarExistente(encodedData) {
  const m = JSON.parse(decodeURIComponent(encodedData));
  abrirGoogleCalendar({
    tipo: m.tipo,
    monto: Number(m.monto),
    categoria: m.categoria,
    descripcion: m.descripcion,
    fecha: m.fecha
  });
}

monthFilter.addEventListener('change', renderizarUI);
categoryFilter.addEventListener('change', renderizarUI);

// Exportar CSV
document.getElementById('export-btn').addEventListener('click', () => {
  if (movimientosCache.length === 0) return alert('No hay datos para exportar.');
  const headers = ['Fecha', 'Tipo', 'Categoria', 'Descripcion', 'Monto'];
  const rows = movimientosCache.map(m => [
    m.fecha, m.tipo, `"${m.categoria}"`, `"${m.descripcion || ''}"`, m.monto
  ]);
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `respaldo_gastos_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW error:', err));
}

checkSession();
