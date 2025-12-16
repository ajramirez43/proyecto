// ==========================================
// 1. CONFIGURACIÓN Y CARGA DE DATOS
// ==========================================
const defaultProfile = {
    nombre: "Juan Pérez",
    esHipertenso: true, esDiabetico: true, tienePulso: true, tieneTermometro: true, tieneOximetro: true
};

// Cargar perfil guardado o usar default
let userProfile = JSON.parse(localStorage.getItem('vitalSync_profile')) || defaultProfile;

// --- NUEVA SECCIÓN: LÍMITES DE SEGURIDAD ---
const LIMITES_VITALES = {
    temp: { min: 34.0, max: 43.0, nombre: "Temperatura" },
    sys:  { min: 50,  max: 250,  nombre: "Presión Sistólica" },
    dia:  { min: 30,  max: 150,  nombre: "Presión Diastólica" },
    pul:  { min: 30,  max: 220,  nombre: "Pulso" },
    glu:  { min: 20,  max: 600,  nombre: "Glucosa" },
    oxi:  { min: 50,  max: 100,  nombre: "Saturación de Oxígeno" }
};

const datosDemo = [
    { id: 1, fecha: new Date(new Date().setHours(8, 0)).toISOString(), sistolica: 118, diastolica: 78, pulso: 70, glucosa: 92, temperatura: 36.5, saturacion: 98 },
    { id: 2, fecha: new Date(new Date().setHours(12, 0)).toISOString(), sistolica: 135, diastolica: 85, pulso: 75, glucosa: 110, temperatura: 36.6, saturacion: 97 },
    { id: 3, fecha: new Date(new Date().setHours(16, 0)).toISOString(), sistolica: 125, diastolica: 82, pulso: 72, glucosa: 105, temperatura: 36.7, saturacion: 98 }
];

let historialVitales = [];
let myChart = null;
let currentChartMode = 'BP'; 
let registroSeleccionadoIndex = -1;

// === CONFIGURACIÓN DE SWEETALERT TOAST (NOTIFICACIÓN) ===
const Toast = Swal.mixin({
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    didOpen: (toast) => {
        toast.onmouseenter = Swal.stopTimer;
        toast.onmouseleave = Swal.resumeTimer;
    }
});

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    const nombreEl = document.getElementById('userName');
    if(nombreEl) nombreEl.textContent = userProfile.nombre;
    
    const datosGuardados = localStorage.getItem('vitalSync_data');
    if (datosGuardados) {
        historialVitales = JSON.parse(datosGuardados);
    } else {
        historialVitales = datosDemo;
        guardarEnLocalStorage();
    }

    cargarEstadoCheckboxes();
    actualizarVistaCompleta();
    configurarFormulario();
    renderizarTarjetasBase(); 
    generarPestañasGrafico();

    registroSeleccionadoIndex = historialVitales.length > 0 ? historialVitales.length - 1 : -1;
    actualizarDashboard();
    initFechaInput();
});

function guardarEnLocalStorage() {
    localStorage.setItem('vitalSync_data', JSON.stringify(historialVitales));
}


// Función Maestra para redibujar todo cuando cambia la config
function actualizarVistaCompleta() {
    configurarFormulario();      // Ocultar/Mostrar inputs del modal registro
    renderizarTarjetasBase();    // Ocultar/Mostrar tarjetas KPI
    generarPestañasGrafico();    // Ocultar/Mostrar tabs del gráfico
    
    // Si la pestaña actual desapareció, resetear a la primera disponible
    // (Lógica simple: si desactivó presión y estaba viendo presión, mover a otro)
    if (currentChartMode === 'BP' && !userProfile.esHipertenso) currentChartMode = obtenerPrimerModoDisponible();
    // ... repetir para otros modos si quieres ser muy estricto, o dejar que renderizarGrafico maneje vacíos
    
    renderizarGrafico();
}

function obtenerPrimerModoDisponible() {
    if(userProfile.esHipertenso) return 'BP';
    if(userProfile.tienePulso) return 'HR';
    if(userProfile.esDiabetico) return 'GLU';
    if(userProfile.tieneTermometro) return 'TEMP';
    if(userProfile.tieneOximetro) return 'OXI';
    return '';
}

// === NUEVA LÓGICA DE CONFIGURACIÓN ===

function cargarEstadoCheckboxes() {
    const chkBP = document.getElementById('cfg-bp');
    if(!chkBP) return; // Si no existe el modal, salir

    chkBP.checked = userProfile.esHipertenso;
    document.getElementById('cfg-pul').checked = userProfile.tienePulso;
    document.getElementById('cfg-glu').checked = userProfile.esDiabetico;
    document.getElementById('cfg-temp').checked = userProfile.tieneTermometro;
    document.getElementById('cfg-oxi').checked = userProfile.tieneOximetro;
}

function guardarConfiguracion() {
    // Leer estado de los checkboxes
    userProfile.esHipertenso = document.getElementById('cfg-bp').checked;
    userProfile.tienePulso = document.getElementById('cfg-pul').checked;
    userProfile.esDiabetico = document.getElementById('cfg-glu').checked;
    userProfile.tieneTermometro = document.getElementById('cfg-temp').checked;
    userProfile.tieneOximetro = document.getElementById('cfg-oxi').checked;

    // Guardar en localStorage
    localStorage.setItem('vitalSync_profile', JSON.stringify(userProfile));

    // Refrescar interfaz
    actualizarVistaCompleta();
    actualizarDashboard();
    
    // Toast discreto
    const ToastCfg = Swal.mixin({
        toast: true, position: 'bottom', showConfirmButton: false, timer: 1500,
        didOpen: (toast) => { toast.style.marginBottom = '20px'; }
    });
    ToastCfg.fire({ icon: 'success', title: 'Panel actualizado' });
}



// === SWEETALERT PARA CONFIRMACIÓN DE BORRADO ===
// Nota: Asegúrate que tu botón HTML llame a esta función (onclick="borrarDatos()")
function borrarDatos() {
    Swal.fire({
        title: "¿Reiniciar datos?",
        text: "Se borrará tu historial local y volverás a los datos de prueba.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#ef4444", 
        cancelButtonColor: "#64748b",
        confirmButtonText: "Sí, borrar",
        cancelButtonText: "Cancelar",
        customClass: { popup: 'rounded-2xl' }
    }).then((result) => {
        if (result.isConfirmed) {
            localStorage.removeItem('vitalSync_data');
            Toast.fire({ icon: "info", title: "Reiniciando sistema..." });
            setTimeout(() => location.reload(), 1000);
        }
    });
}

// ==========================================
// 2. LÓGICA VISUAL Y GRÁFICOS
// ==========================================

function obtenerClaseRiesgo(tipo, valor, valorSecundario = null) {
    if (valor === null || valor === undefined || valor === "") return "text-slate-300";
    const v = parseFloat(valor);
    const esActual = (registroSeleccionadoIndex === historialVitales.length - 1);
    const baseClass = "text-3xl font-bold transition-colors ";
    const opacityClass = esActual ? "" : "opacity-40";
    let color = "text-green-600"; 

    switch (tipo) {
        case 'BP':
            const sys = v; const dia = valorSecundario ? parseFloat(valorSecundario) : 0;
            if (sys >= 130 || dia >= 90) color = "text-red-600";
            else if ((sys >= 120 && sys <= 129) || (dia >= 80 && dia <= 89)) color = "text-yellow-500";
            else if (sys < 110 || dia < 70) color = "text-blue-600";
            else color = "text-green-600";
            break;
        case 'GLU':
            if (v >= 130) color = "text-red-600"; else if (v >= 100) color = "text-yellow-500"; else if (v < 70) color = "text-blue-600"; else color = "text-green-600"; break;
        case 'HR':
            if (v > 100) color = "text-red-600"; else if (v >= 90) color = "text-yellow-500"; else if (v < 60) color = "text-blue-600"; else color = "text-green-600"; break;
        case 'TEMP':
            if (v > 38.0) color = "text-red-600"; else if (v >= 37.5) color = "text-yellow-500"; else if (v < 36.0) color = "text-blue-600"; else color = "text-green-600"; break;
        case 'OXI':
            if (v < 90) color = "text-red-600"; else if (v <= 93) color = "text-yellow-500"; else color = "text-green-600"; break;
    }
    return `${baseClass} ${color} ${opacityClass}`;
}

function renderizarTarjetasBase() {
    const grid = document.getElementById('statsGrid'); 
    if(!grid) return;
    grid.innerHTML = ''; 
    
    // CAMBIOS REALIZADOS EN LA LÍNEA DE ABAJO (dentro del string HTML):
    // 1. Cambié 'p-5' por 'p-3 md:p-5' (menos relleno en celular).
    // 2. Quité 'min-w-[200px]' y puse 'min-w-0' (para que no obligue a ser ancha y quepan 2).
    // 3. Cambié 'text-3xl' por 'text-2xl md:text-3xl' (números un poco más chicos en celular).
    
    const crearTarjeta = (keyGrafico, idValor, titulo, unidad, colorBorde, colorIcono) => {
        return `
        <div onclick="cambiarModoGrafico('${keyGrafico}')" class="clickable-card bg-white p-3 md:p-5 rounded-2xl shadow-sm border border-slate-200 border-l-[6px] ${colorBorde} flex-1 min-w-0 flex flex-col justify-between hover:shadow-lg transition-all relative group h-full">
            <div class="flex justify-between items-start mb-2">
                <h3 class="text-slate-500 text-[10px] md:text-xs font-bold uppercase tracking-wider truncate pr-1">${titulo}</h3>
                <i data-lucide="bar-chart-2" class="w-4 h-4 text-gray-300 group-hover:text-${colorIcono}-500 transition-colors flex-shrink-0"></i>
            </div>
            <div>
                <div class="flex items-baseline gap-1 flex-wrap">
                    <span id="${idValor}" class="text-2xl md:text-3xl font-bold text-slate-800 leading-none">--</span>
                    <span class="text-[10px] md:text-sm text-gray-400 font-bold">${unidad}</span>
                </div>
                <p class="text-[10px] md:text-xs font-semibold mt-1 text-slate-400 truncate" id="label-${idValor}">Sin datos</p>
            </div>
        </div>`;
    };

    if (userProfile.esHipertenso) grid.innerHTML += crearTarjeta('BP', 'kpiBP', 'Presión', 'mmHg', 'border-l-rose-500', 'rose');
    if (userProfile.tienePulso) grid.innerHTML += crearTarjeta('HR', 'kpiPul', 'Frecuencia', 'BPM', 'border-l-indigo-500', 'indigo');
    if (userProfile.esDiabetico) grid.innerHTML += crearTarjeta('GLU', 'kpiGlu', 'Glucosa', 'mg/dL', 'border-l-sky-500', 'sky');
    if (userProfile.tieneTermometro) grid.innerHTML += crearTarjeta('TEMP', 'kpiTemp', 'Temp.', '°C', 'border-l-orange-400', 'orange');
    if (userProfile.tieneOximetro) grid.innerHTML += crearTarjeta('OXI', 'kpiOxi', 'Sat. O2', '%', 'border-l-teal-400', 'teal');
    
    lucide.createIcons();
}

function cambiarModoGrafico(nuevoModo) { currentChartMode = nuevoModo; generarPestañasGrafico(); renderizarGrafico(); }

function actualizarDashboard() {
    if (historialVitales.length === 0) return;
    if (registroSeleccionadoIndex < 0 || registroSeleccionadoIndex >= historialVitales.length) registroSeleccionadoIndex = historialVitales.length - 1;
    const reg = historialVitales[registroSeleccionadoIndex];
    const fechaObj = new Date(reg.fecha);
    const hora = `${fechaObj.getHours()}:${fechaObj.getMinutes().toString().padStart(2, '0')}`;
    let etiquetaTexto = (registroSeleccionadoIndex === historialVitales.length - 1) ? `Última • ${hora}` : `Registro anterior • ${hora}`;
    
    const updateValue = (id, val, tipo, valSec = null) => {
        const el = document.getElementById(id); const lbl = document.getElementById(`label-${id}`);
        if(el) { el.textContent = val || '--'; el.className = obtenerClaseRiesgo(tipo, valSec ? val.split('/')[0] : val, valSec); }
        if(lbl) lbl.textContent = etiquetaTexto;
    };
    
    if (reg) {
        const bpVal = reg.sistolica ? `${reg.sistolica}/${reg.diastolica}` : null;
        updateValue('kpiBP', bpVal, 'BP', reg.diastolica); 
        updateValue('kpiPul', reg.pulso, 'HR');
        updateValue('kpiGlu', reg.glucosa, 'GLU'); 
        updateValue('kpiTemp', reg.temperatura, 'TEMP');
        updateValue('kpiOxi', reg.saturacion, 'OXI');
    }
    renderizarGrafico();
}

function renderizarGrafico() {
    const ctx = document.getElementById('chart').getContext('2d');
    const titleEl = document.getElementById('chartTitle'); 
    if (historialVitales.length === 0) { if(myChart) myChart.destroy(); return; }
    const labels = historialVitales.map(d => { const f = new Date(d.fecha); return `${f.getHours()}:${f.getMinutes().toString().padStart(2, '0')}`; });
    let datasets = []; let suggestedMin = 0;
    const ejeOptions = { ticks: { color: '#0f172a', font: { size: 12, weight: 'bold' } }, grid: { color: '#e2e8f0' } };
    
    switch (currentChartMode) {
        case 'BP': titleEl.innerText = "Tendencia: Presión Arterial"; datasets = [{ label: 'Sistólica', data: historialVitales.map(d => d.sistolica), borderColor: '#b91c1c', backgroundColor: 'rgba(185, 28, 28, 0.05)', borderWidth: 3, pointBackgroundColor: '#b91c1c', pointRadius: 6, tension: 0.3, fill: true }, { label: 'Diastólica', data: historialVitales.map(d => d.diastolica), borderColor: '#f43f5e', borderWidth: 3, borderDash: [5, 5], pointBackgroundColor: '#f43f5e', pointRadius: 6, tension: 0.3 }]; suggestedMin = 50; break;
        case 'GLU': titleEl.innerText = "Tendencia: Glucosa Capilar"; datasets = [{ label: 'Glucosa', data: historialVitales.map(d => d.glucosa), borderColor: '#0284c7', backgroundColor: 'rgba(2, 132, 199, 0.1)', borderWidth: 3, pointBackgroundColor: '#0284c7', pointRadius: 6, fill: true, tension: 0.3 }]; suggestedMin = 60; break;
        case 'HR': titleEl.innerText = "Tendencia: Frecuencia Cardiaca"; datasets = [{ label: 'Pulso', data: historialVitales.map(d => d.pulso), borderColor: '#6366f1', backgroundColor: 'rgba(99, 102, 241, 0.1)', borderWidth: 3, pointBackgroundColor: '#6366f1', pointRadius: 6, fill: true, tension: 0.3 }]; suggestedMin = 40; break;
        case 'TEMP': case 'OXI': titleEl.innerText = currentChartMode === 'TEMP' ? "Tendencia: Temperatura" : "Tendencia: Sat. O2"; const color = currentChartMode === 'TEMP' ? '#ea580c' : '#0d9488'; datasets = [{ label: currentChartMode === 'TEMP' ? 'Temperatura' : 'Sat. O2', data: historialVitales.map(d => currentChartMode === 'TEMP' ? d.temperatura : d.saturacion), borderColor: color, backgroundColor: color + '20', borderWidth: 3, pointBackgroundColor: color, pointRadius: 6, fill: true, tension: 0.3 }]; suggestedMin = currentChartMode === 'TEMP' ? 35 : 85; break;
    }
    
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: datasets }, options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 30, bottom: 0, left: 10, right: 10 } }, onClick: (e) => { const points = myChart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true); if (points.length) { registroSeleccionadoIndex = points[0].index; actualizarDashboard(); } }, plugins: { legend: { display: currentChartMode === 'BP', position: 'top', align: 'end', labels: { color: '#000', font: { weight: 'bold', size: 12 }, boxWidth: 20, padding: 20 } }, title: { display: false } }, scales: { y: { ...ejeOptions, beginAtZero:false, suggestedMin:suggestedMin }, x:{...ejeOptions, grid:{display:false}} } } });
}

function generarPestañasGrafico() {
    const container = document.getElementById('tabsContainer'); 
    if(!container) return;
    container.innerHTML = ''; 
    const opciones = []; if (userProfile.esHipertenso) opciones.push({ key: 'BP', label: 'Presión' }); if (userProfile.tienePulso) opciones.push({ key: 'HR', label: 'Pulso' }); if (userProfile.esDiabetico) opciones.push({ key: 'GLU', label: 'Glucosa' }); if (userProfile.tieneTermometro) opciones.push({ key: 'TEMP', label: 'Temp' }); if (userProfile.tieneOximetro) opciones.push({ key: 'OXI', label: 'Sat. O2' });
    if (!opciones.find(o => o.key === currentChartMode) && opciones.length > 0) currentChartMode = opciones[0].key;
    opciones.forEach(opt => { const btn = document.createElement('button'); btn.innerText = opt.label; btn.className = `whitespace-nowrap px-6 py-3 rounded-xl text-sm font-bold transition-all mx-1 ${ currentChartMode === opt.key ? 'bg-white text-primary shadow-md border border-slate-200 ring-1 ring-indigo-100' : 'text-gray-500 hover:bg-white hover:text-gray-700' }`; btn.onclick = () => cambiarModoGrafico(opt.key); container.appendChild(btn); });
}

function initFechaInput() {
    const inputFecha = document.getElementById('fechaSolo'); 
    const inputHora = document.getElementById('horaSolo');
    
    // Si no existen los inputs (por ejemplo si estás en otra página), no hacer nada
    if(!inputFecha || !inputHora) return;

    const now = new Date();
    // Ajuste para que tome la hora local correcta y no la UTC
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    
    // Poner la fecha (YYYY-MM-DD) en el input bloqueado
    inputFecha.value = now.toISOString().slice(0,10);
    
    // Poner la hora (HH:MM) en el input editable
    inputHora.value = now.toISOString().slice(11,16);
}

function toggleModal(id, show) { 
    const m = document.getElementById(id); 
    if(m) {
        show ? m.classList.remove('hidden') : m.classList.add('hidden'); 
    }
}


function configurarFormulario() { 
    const g = { bp: document.getElementById('group-bp'), pul: document.getElementById('group-pul'), glu: document.getElementById('group-glu'), temp: document.getElementById('group-temp'), oxi: document.getElementById('group-oxi') }; 
    const i = { sys: document.getElementById('sys'), dia: document.getElementById('dia'), pul: document.getElementById('pul'), glu: document.getElementById('glu') }; 
    
    // Safety check por si no existen elementos
    if(!g.bp) return;

    Object.values(g).forEach(el => el.classList.add('hidden')); 
    if (userProfile.esHipertenso) { g.bp.classList.remove('hidden'); i.sys.required = true; i.dia.required = true; i.pul.required = true; } 
    if (userProfile.tienePulso) g.pul.classList.remove('hidden'); 
    if (userProfile.esDiabetico) { g.glu.classList.remove('hidden'); i.glu.required = true; } 
    if (userProfile.tieneTermometro) g.temp.classList.remove('hidden'); 
    if (userProfile.tieneOximetro) g.oxi.classList.remove('hidden'); 
}

// ==========================================
// 3. EVENTO SUBMIT (CON VALIDACIÓN DE RANGOS)
// ==========================================
document.getElementById('addForm').addEventListener('submit', (e) => {
    e.preventDefault();

    // 1. CONSTRUIR LA FECHA COMPLETA (Fecha Fija + Hora Elegida)
    const fechaPart = document.getElementById('fechaSolo').value;
    const horaPart = document.getElementById('horaSolo').value;
    
    // Creamos la fecha completa (Ej: "2025-12-13T16:05")
    const fechaInput = `${fechaPart}T${horaPart}`;
    
    const sysVal = document.getElementById('sys').value;
    const diaVal = document.getElementById('dia').value;
    const pulVal = document.getElementById('pul').value;
    const gluVal = document.getElementById('glu').value;
    const tempVal = document.getElementById('temp').value;
    const oxiVal = document.getElementById('oxi').value;

    // 2. Validación Fecha
    const now = new Date();
    const fechaSeleccionada = new Date(fechaInput);
    if (fechaSeleccionada.getDate() !== now.getDate()) {
        Swal.fire({ icon: 'error', title: 'Fecha incorrecta', text: 'Solo puedes registrar mediciones para el día de hoy.', confirmButtonColor: '#4338ca' });
        return; 
    }

    // 3. Función auxiliar de validación de rangos
    const validarRango = (valor, codigo) => {
        if (!valor) return true; // Si está vacío, lo dejamos pasar (HTML required lo detendrá si es necesario)
        const num = parseFloat(valor);
        const limite = LIMITES_VITALES[codigo];
        if (num < limite.min || num > limite.max) {
            Swal.fire({
                icon: 'warning',
                title: `${limite.nombre} fuera de rango`,
                text: `Has ingresado ${num}. El rango válido es entre ${limite.min} y ${limite.max}.`,
                confirmButtonColor: '#f59e0b'
            });
            return false;
        }
        return true;
    };

    // 4. Ejecutar validaciones
    if (userProfile.esHipertenso) {
        if (!validarRango(sysVal, 'sys')) return;
        if (!validarRango(diaVal, 'dia')) return;
        if (Number(sysVal) > 0 && Number(diaVal) > 0 && Number(sysVal) <= Number(diaVal)) {
            Swal.fire({ icon: 'error', title: 'Error en Presión', text: 'La Sistólica (alta) debe ser mayor que la Diastólica (baja).', confirmButtonColor: '#4338ca' });
            return;
        }
    }
    if (userProfile.tienePulso && !validarRango(pulVal, 'pul')) return;
    if (userProfile.esDiabetico && !validarRango(gluVal, 'glu')) return;
    if (userProfile.tieneTermometro && !validarRango(tempVal, 'temp')) return;
    if (userProfile.tieneOximetro && !validarRango(oxiVal, 'oxi')) return;

    // 5. Guardar datos
    const nuevo = {
        id: Date.now(),
        fecha: fechaInput,
        sistolica: sysVal ? Number(sysVal) : null,
        diastolica: diaVal ? Number(diaVal) : null,
        pulso: pulVal ? Number(pulVal) : null,
        glucosa: gluVal ? Number(gluVal) : null,
        temperatura: tempVal ? Number(tempVal) : null,
        saturacion: oxiVal ? Number(oxiVal) : null
    };

    historialVitales.push(nuevo);
    guardarEnLocalStorage(); 
    
    registroSeleccionadoIndex = historialVitales.length - 1; 
    actualizarDashboard();
    
    // CORRECCIÓN AQUÍ: Especificar 'modal'
    toggleModal('modal', false); 
    
    Toast.fire({ icon: "success", title: "Registro guardado correctamente" });

    e.target.reset();
    initFechaInput();
});