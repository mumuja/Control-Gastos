// REEMPLAZA ESTOS DOS VALORES CON LOS DE TU PROYECTO SUPABASE
const SUPABASE_URL = 'https://stzukfgxwsjuztjjmfov.supabase.co/rest/v1/';
const SUPABASE_ANON_KEY = 'sb_publishable_sdKNxaC0HQUeGa3thZQAIg_yFoYwa3Z';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Referencias DOM
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const authError = document.getElementById('auth-error');
const txForm = document.getElementById('tx-form');
const txList = document.getElementById('tx-list');
const fechaInput = document.getElementById('fecha');

let movimientosCache = [];

// Establecer fecha de hoy por defecto
fechaInput.valueAsDate = new Date();
const hoy = new Date();
document.getElementById('current-month-label').textContent = hoy.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

// Verificar sesión al cargar
async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    authScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    cargarMovimientos();
  } else {
    authScreen.classList.remove('hidden');
    appScreen.classList.add('hidden');
  }
}

// Iniciar sesión
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.classList.add('hidden');
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    authError.textContent = 'Credenciales incorrectas.';
    authError.classList.remove('hidden');
  } else {
    checkSession();
  }
});

// Cerrar sesión
document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  checkSession();
});

// Cargar movimientos desde Supabase
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
  renderizarUI(data);
}

// Guardar nuevo movimiento
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

  const { error } = await supabaseClient
    .from('movimientos')
    .insert([{ tipo, monto, fecha, categoria, descripcion }]);

  btn.disabled = false;
  btn.textContent = 'Guardar Movimiento';

  if (error) {
    alert('Error al guardar: ' + error.message);
  } else {
    document.getElementById('monto').value = '';
    document.getElementById('descripcion').value = '';
    cargarMovimientos();
  }
});

// Eliminar un registro
async function eliminarMovimiento(id) {
  if (!confirm('¿Eliminar este registro?')) return;
  const { error } = await supabaseClient.from('movimientos').delete().eq('id', id);
  if (!error) cargarMovimientos();
}

// Actualizar balances y lista
function renderizarUI(data) {
  const mesActual = hoy.toISOString().slice(0, 7); // YYYY-MM
  const delMes = data.filter(m => m.fecha.startsWith(mesActual));

  let ingresos = 0;
  let gastos = 0;

  delMes.forEach(m => {
    if (m.tipo === 'ingreso') ingresos += Number(m.monto);
    else gastos += Number(m.monto);
  });

  const balance = ingresos - gastos;
  document.getElementById('balance-total').textContent = `$${balance.toFixed(2)}`;
  document.getElementById('ingresos-total').textContent = `+$${ingresos.toFixed(2)}`;
  document.getElementById('gastos-total').textContent = `-$${gastos.toFixed(2)}`;
  document.getElementById('tx-count').textContent = `${delMes.length} registros`;

  txList.innerHTML = delMes.length === 0 
    ? '<p class="text-center text-slate-500 text-xs py-6">Aún no hay movimientos este mes.</p>'
    : delMes.map(m => {
        const esIngreso = m.tipo === 'ingreso';
        const colorMonto = esIngreso ? 'text-emerald-400' : 'text-rose-400';
        const signo = esIngreso ? '+' : '-';
        return `
          <div class="bg-slate-900 border border-slate-800/80 p-3 rounded-xl flex justify-between items-center">
            <div>
              <p class="text-sm font-medium text-slate-200">${m.descripcion || m.categoria}</p>
              <p class="text-xs text-slate-500">${m.categoria} • ${m.fecha}</p>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-sm font-bold ${colorMonto}">${signo}$${Number(m.monto).toFixed(2)}</span>
              <button onclick="eliminarMovimiento('${m.id}')" class="text-slate-600 hover:text-rose-400 text-xs px-1">✕</button>
            </div>
          </div>
        `;
      }).join('');
}

// Exportar todo el historial histórico a CSV
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

// Registrar Service Worker para PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW error:', err));
}

checkSession();