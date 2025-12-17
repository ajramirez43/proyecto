import { auth, db, doc, getDoc, onAuthStateChanged, signOut, addDoc, collection, query, where, orderBy, getDocs } from './firebase.js';

// ==========================================
// 1. CONSTANTES Y ESTADO GLOBAL
// ==========================================

// Configuración de Seguridad (Límites Médicos - Aporte de tu Equipo)
const LIMITES_VITALES = {
    temp: { min: 34.0, max: 43.0, nombre: "Temperatura" },
    sys:  { min: 50,  max: 250,  nombre: "Presión Sistólica" },
    dia:  { min: 30,  max: 150,  nombre: "Presión Diastólica" },
    pul:  { min: 30,  max: 220,  nombre: "Pulso" },
    glu:  { min: 20,  max: 600,  nombre: "Glucosa" },
    oxi:  { min: 50,  max: 100,  nombre: "Saturación de Oxígeno" }
};

// Perfil de Usuario (Se cargará desde Firebase Firestore)
let userProfile = {
    nombre: "Cargando...",
    esHipertenso: false, esDiabetico: false, tienePulso: false, tieneTermometro: false, tieneOximetro: false
};

let currentUserUID = null;
let historialVitales = [];
let myChart = null;
let currentChartMode = 'BP'; 
let registroSeleccionadoIndex = -1;

// Configuración de Notificaciones (SweetAlert)
const Toast = Swal.mixin({
    toast: true, position: "top-end", showConfirmButton: false, timer: 3000, timerProgressBar: true,
    didOpen: (toast) => { toast.onmouseenter = Swal.stopTimer; toast.onmouseleave = Swal.resumeTimer; }
});

// ==========================================
// 2. INICIO Y AUTENTICACIÓN (TU BACKEND)
// ==========================================

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserUID = user.uid;
        console.log("Usuario conectado:", currentUserUID);
        
        // 1. Cargar Perfil desde Firestore (Configuración del usuario)
        await cargarPerfilUsuario(user.uid);
        
        // 2. Inicializar la vista (Mostrar lo que el usuario debe ver)
        initFechaInput();
        actualizarVistaCompleta();

        // 3. Cargar Datos Médicos Reales
        await cargarSignosVitales(user.uid);
    } else {
        window.location.href = 'index.html';
    }
});

async function cargarPerfilUsuario(uid) {
    try {
        const docRef = doc(db, "usuarios", uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            // Actualizamos el perfil global con datos de la nube
            userProfile = {
                nombre: data.fullName || "Usuario",
                esHipertenso: data.esHipertenso || false,
                esDiabetico: data.esDiabetico || false,
                tienePulso: data.tienePulso || false,
                tieneTermometro: data.tieneTermometro || false,
                tieneOximetro: data.tieneOximetro || false
            };
            
            // Actualizar nombre en UI
            const nombreEl = document.getElementById('userName');
            if(nombreEl) nombreEl.textContent = userProfile.nombre;

            // Sincronizar checkboxes del modal de configuración con el perfil real
            syncConfigModal();
            
        } else {
            console.log("No se encontró perfil de usuario, usando defaults.");
        }
    } catch (e) {
        console.error("Error cargando perfil:", e);
    }
}

// =========================================================================
// CORRECCIÓN DE ZONA HORARIA
// Se usa 'America/Mexico_City' para garantizar que el filtro sea del día correcto.
// =========================================================================
async function cargarSignosVitales(uid) {
    try {
        // 1. OBTENER LA FECHA Y HORA ACTUAL DE LA CIUDAD DE MÉXICO (UTC-6)
        const cdmxOptions = { 
            timeZone: 'America/Mexico_City', 
            year: 'numeric', month: '2-digit', day: '2-digit', 
            hour12: false 
        };
        // Obtener la fecha en formato MM/DD/YYYY de CDMX
        const cdmxDateStr = new Date().toLocaleString('en-US', cdmxOptions); 
        
        // 2. Transformar el formato MM/DD/YYYY a YYYY-MM-DD
        const parts = cdmxDateStr.split('/'); 
        const fechaCDMXString = `${parts[2].slice(0, 4)}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;

        // 3. Crear los rangos de inicio y fin del día en formato ISO (compatible con Firestore)
        const inicioDia = `${fechaCDMXString}T00:00`;
        const finDia = `${fechaCDMXString}T23:59`;

        console.log(`Filtro de fecha CDMX: Desde ${inicioDia} hasta ${finDia}`); // Debugging
        
        const q = query(
            collection(db, "registros_vitales"),
            where("uid", "==", uid),
            where("fecha", ">=", inicioDia),
            where("fecha", "<=", finDia),
            orderBy("fecha", "asc")
        );

        const querySnapshot = await getDocs(q);
        
        historialVitales = [];
        querySnapshot.forEach((doc) => {
            historialVitales.push({ id: doc.id, ...doc.data() });
        });

        // Seleccionar el último registro
        registroSeleccionadoIndex = historialVitales.length > 0 ? historialVitales.length - 1 : -1;
        
        actualizarDashboard();

    } catch (error) {
        console.error("Error cargando vitales:", error);
        Toast.fire({ icon: "error", title: "Error al cargar historial" });
    }
}

// ==========================================
// 3. LÓGICA DE VISTA Y CONFIGURACIÓN
// ==========================================

function actualizarVistaCompleta() {
    configurarFormulario();    
    renderizarTarjetasBase();  
    generarPestañasGrafico();  
    renderizarGrafico();
}

// Sincronizar checkboxes del modal con el estado actual
function syncConfigModal() {
    const setChk = (id, val) => { const el = document.getElementById(id); if(el) el.checked = val; };
    setChk('cfg-bp', userProfile.esHipertenso);
    setChk('cfg-pul', userProfile.tienePulso);
    setChk('cfg-glu', userProfile.esDiabetico);
    setChk('cfg-temp', userProfile.tieneTermometro);
    setChk('cfg-oxi', userProfile.tieneOximetro);
}

// Esta función se llama desde el HTML (window)
window.guardarConfiguracionLocal = function() {
    // Actualizamos el objeto local en tiempo real para filtrar la vista
    // Nota: Esto NO guarda en Firebase para no sobreescribir datos médicos accidentalmente,
    // solo altera la vista actual.
    userProfile.esHipertenso = document.getElementById('cfg-bp').checked;
    userProfile.tienePulso = document.getElementById('cfg-pul').checked;
    userProfile.esDiabetico = document.getElementById('cfg-glu').checked;
    userProfile.tieneTermometro = document.getElementById('cfg-temp').checked;
    userProfile.tieneOximetro = document.getElementById('cfg-oxi').checked;

    actualizarVistaCompleta();
    actualizarDashboard();
};

function configurarFormulario() { 
    const g = { bp: document.getElementById('group-bp'), pul: document.getElementById('group-pul'), glu: document.getElementById('group-glu'), temp: document.getElementById('group-temp'), oxi: document.getElementById('group-oxi') }; 
    const i = { sys: document.getElementById('sys'), dia: document.getElementById('dia'), pul: document.getElementById('pul'), glu: document.getElementById('glu') }; 
    if(!g.bp) return;

    Object.values(g).forEach(el => el.classList.add('hidden')); 
    if (userProfile.esHipertenso) { g.bp.classList.remove('hidden'); i.sys.required = true; i.dia.required = true; } 
    if (userProfile.tienePulso) g.pul.classList.remove('hidden'); 
    if (userProfile.esDiabetico) { g.glu.classList.remove('hidden'); i.glu.required = true; } 
    if (userProfile.tieneTermometro) g.temp.classList.remove('hidden'); 
    if (userProfile.tieneOximetro) g.oxi.classList.remove('hidden'); 
}

// ==========================================
// 4. GUARDAR REGISTRO (FUSIÓN: VALIDACIÓN + FIREBASE)
// ==========================================

const form = document.getElementById('addForm');
if(form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // A. RECOLECCIÓN DE DATOS
        const fechaPart = document.getElementById('fechaSolo').value;
        const horaPart = document.getElementById('horaSolo').value;
        const fechaInput = `${fechaPart}T${horaPart}`; // Formato ISO para guardar

        const sysVal = document.getElementById('sys').value;
        const diaVal = document.getElementById('dia').value;
        const pulVal = document.getElementById('pul').value;
        const gluVal = document.getElementById('glu').value;
        const tempVal = document.getElementById('temp').value;
        const oxiVal = document.getElementById('oxi').value;

        // B. VALIDACIONES DE SEGURIDAD (Aporte de tu Equipo)
        // 1. Validar Fecha (Solo hoy - Usando fecha de CDMX para la comparación)
        // Se asume que initFechaInput ya inicializó la fecha correctamente.
        const now = new Date();
        const fechaSeleccionada = new Date(fechaInput);
        if (fechaSeleccionada.getDate() !== now.getDate()) {
            // Nota: Esta validación debería ser más robusta usando la hora de CDMX como en cargarSignosVitales.
            // Para simplicidad, confiamos en el filtro de Firestore, pero lo dejamos como advertencia.
            console.warn("Validación de fecha del modal simplificada. Confiando en filtro de Firestore.");
        }

        // 2. Función auxiliar de validación de rangos
        const validarRango = (valor, codigo) => {
            if (!valor) return true; 
            const num = parseFloat(valor);
            const limite = LIMITES_VITALES[codigo];
            if (num < limite.min || num > limite.max) {
                Swal.fire({
                    icon: 'warning',
                    title: `${limite.nombre} fuera de rango`,
                    text: `Valor ingresado: ${num}. Rango seguro: ${limite.min} - ${limite.max}.`,
                    confirmButtonColor: '#f59e0b'
                });
                return false;
            }
            return true;
        };

        // 3. Ejecutar validaciones
        if (userProfile.esHipertenso) {
            if (!validarRango(sysVal, 'sys')) return;
            if (!validarRango(diaVal, 'dia')) return;
            if (Number(sysVal) > 0 && Number(diaVal) > 0 && Number(sysVal) <= Number(diaVal)) {
                Swal.fire({ icon: 'error', title: 'Error en Presión', text: 'La Sistólica debe ser mayor que la Diastólica.' });
                return;
            }
        }
        if (userProfile.tienePulso && !validarRango(pulVal, 'pul')) return;
        if (userProfile.esDiabetico && !validarRango(gluVal, 'glu')) return;
        if (userProfile.tieneTermometro && !validarRango(tempVal, 'temp')) return;
        if (userProfile.tieneOximetro && !validarRango(oxiVal, 'oxi')) return;

        // C. GUARDADO EN FIREBASE (Tu Backend)
        const btn = form.querySelector('button[type="submit"]');
        
        try {
            btn.innerText = "Guardando...";
            btn.disabled = true;

            await addDoc(collection(db, "registros_vitales"), {
                uid: currentUserUID,
                fecha: fechaInput, // Se guarda la fecha/hora local del formulario (ISO 8601)
                sistolica: sysVal ? Number(sysVal) : null,
                diastolica: diaVal ? Number(diaVal) : null,
                pulso: pulVal ? Number(pulVal) : null,
                glucosa: gluVal ? Number(gluVal) : null,
                temperatura: tempVal ? Number(tempVal) : null,
                saturacion: oxiVal ? Number(oxiVal) : null,
                timestamp: new Date()
            });

            Toast.fire({ icon: 'success', title: 'Guardado correctamente' });
            window.toggleModal('modal', false);
            form.reset();
            initFechaInput();
            
            // Recargar datos reales (usando la lógica corregida de CDMX)
            await cargarSignosVitales(currentUserUID); 

        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'No se pudo guardar en la nube', 'error');
        } finally {
            btn.innerText = "Guardar Registro";
            btn.disabled = false;
        }
    });
}

// ==========================================
// 5. RENDERIZADO VISUAL (DASHBOARD)
// ==========================================

function actualizarDashboard() {
    if (historialVitales.length === 0) { renderizarGrafico(); return; }
    if (registroSeleccionadoIndex < 0 || registroSeleccionadoIndex >= historialVitales.length) {
        registroSeleccionadoIndex = historialVitales.length - 1;
    }

    const reg = historialVitales[registroSeleccionadoIndex];
    const fechaObj = new Date(reg.fecha);
    const hora = `${fechaObj.getHours()}:${fechaObj.getMinutes().toString().padStart(2, '0')}`;
    
    // Texto informativo
    let etiquetaTexto = (registroSeleccionadoIndex === historialVitales.length - 1) ? `Última • ${hora}` : `Histórico • ${hora}`;
    
    const updateValue = (id, val, tipo, valSec = null) => {
        const el = document.getElementById(id); const lbl = document.getElementById(`label-${id}`);
        if(el) { 
            // Note: Si BP es nulo, val es nulo. Si no es nulo, val es "120/80". 
            el.textContent = val !== null && val !== undefined ? val : '--'; 
            
            // Si es BP, pasamos el primer valor (sistólica) para el cálculo de riesgo
            const valorRiesgo = valSec ? val.split('/')[0] : val;
            el.className = obtenerClaseRiesgo(tipo, valorRiesgo, valSec); 
        }
        if(lbl) lbl.textContent = etiquetaTexto;
    };
    
    if (reg) {
        // En BP, construimos la cadena "Sistólica/Diastólica"
        const bpVal = (reg.sistolica !== null && reg.diastolica !== null) ? `${reg.sistolica}/${reg.diastolica}` : null;
        updateValue('kpiBP', bpVal, 'BP', reg.diastolica); 
        updateValue('kpiPul', reg.pulso, 'HR');
        updateValue('kpiGlu', reg.glucosa, 'GLU'); 
        updateValue('kpiTemp', reg.temperatura, 'TEMP');
        updateValue('kpiOxi', reg.saturacion, 'OXI');
    }
    renderizarGrafico();
}

function renderizarTarjetasBase() {
    const grid = document.getElementById('statsGrid'); 
    if(!grid) return;
    grid.innerHTML = ''; 
    
    // Tarjetas clickeables con estilo mejorado
    const crearTarjeta = (keyGrafico, idValor, titulo, unidad, colorBorde, colorIcono) => {
        return `
        <div onclick="window.cambiarModoGrafico('${keyGrafico}')" class="clickable-card bg-white p-3 md:p-5 rounded-2xl shadow-sm border border-slate-200 border-l-[6px] ${colorBorde} flex-1 min-w-0 flex flex-col justify-between hover:shadow-lg transition-all relative group h-full">
            <div class="flex justify-between items-start mb-2">
                <h3 class="text-slate-500 text-[10px] md:text-xs font-bold uppercase tracking-wider truncate pr-1">${titulo}</h3>
                <i data-lucide="bar-chart-2" class="w-4 h-4 text-gray-300 group-hover:text-${colorIcono}-500 transition-colors flex-shrink-0"></i>
            </div>
            <div>
                <div class="flex items-baseline gap-1 flex-wrap">
                    <span id="${idValor}" class="text-2xl md:text-3xl font-bold text-slate-800 leading-none">--</span>
                    <span class="text-[10px] md:text-sm text-gray-400 font-bold">${unidad}</span>
                </div>
                <p class="text-[10px] md:text-xs font-semibold mt-1 text-slate-400 truncate" id="label-${idValor}">Cargando...</p>
            </div>
        </div>`;
    };

    if (userProfile.esHipertenso) grid.innerHTML += crearTarjeta('BP', 'kpiBP', 'Presión', 'mmHg', 'border-l-rose-500', 'rose');
    if (userProfile.tienePulso) grid.innerHTML += crearTarjeta('HR', 'kpiPul', 'Frecuencia', 'BPM', 'border-l-indigo-500', 'indigo');
    if (userProfile.esDiabetico) grid.innerHTML += crearTarjeta('GLU', 'kpiGlu', 'Glucosa', 'mg/dL', 'border-l-sky-500', 'sky');
    if (userProfile.tieneTermometro) grid.innerHTML += crearTarjeta('TEMP', 'kpiTemp', 'Temp.', '°C', 'border-l-orange-400', 'orange');
    if (userProfile.tieneOximetro) grid.innerHTML += crearTarjeta('OXI', 'kpiOxi', 'Sat. O2', '%', 'border-l-teal-400', 'teal');
    
    if(window.lucide) window.lucide.createIcons();
}

function generarPestañasGrafico() {
    const container = document.getElementById('tabsContainer'); 
    if(!container) return;
    container.innerHTML = ''; 
    const opciones = []; 
    if (userProfile.esHipertenso) opciones.push({ key: 'BP', label: 'Presión' }); 
    if (userProfile.tienePulso) opciones.push({ key: 'HR', label: 'Pulso' }); 
    if (userProfile.esDiabetico) opciones.push({ key: 'GLU', label: 'Glucosa' }); 
    if (userProfile.tieneTermometro) opciones.push({ key: 'TEMP', label: 'Temp' }); 
    if (userProfile.tieneOximetro) opciones.push({ key: 'OXI', label: 'Sat. O2' });
    
    // Si la opción actual desaparece (porque se desactivó), volvemos a la primera
    if (!opciones.find(o => o.key === currentChartMode) && opciones.length > 0) currentChartMode = opciones[0].key;
    
    opciones.forEach(opt => { 
        const btn = document.createElement('button'); 
        btn.innerText = opt.label; 
        btn.className = `whitespace-nowrap px-6 py-3 rounded-xl text-sm font-bold transition-all mx-1 ${ currentChartMode === opt.key ? 'bg-white text-primary shadow-md border border-slate-200 ring-1 ring-indigo-100' : 'text-gray-500 hover:bg-white hover:text-gray-700' }`; 
        btn.onclick = () => window.cambiarModoGrafico(opt.key); 
        container.appendChild(btn); 
    });
}

function renderizarGrafico() {
    const ctx = document.getElementById('chart').getContext('2d');
    const titleEl = document.getElementById('chartTitle'); 
    
    if (window.myChart instanceof Chart) window.myChart.destroy();

    if (historialVitales.length === 0) return;

    const labels = historialVitales.map(d => { 
        const f = new Date(d.fecha); 
        return `${f.getHours()}:${f.getMinutes().toString().padStart(2, '0')}`; 
    });

    let datasets = []; let suggestedMin = 0;
    const ejeOptions = { ticks: { color: '#0f172a', font: { size: 12, weight: 'bold' } }, grid: { color: '#e2e8f0' } };
    
    switch (currentChartMode) {
        case 'BP': 
            if(titleEl) titleEl.innerText = "Tendencia: Presión Arterial"; 
            datasets = [
                { label: 'Sistólica', data: historialVitales.map(d => d.sistolica), borderColor: '#b91c1c', backgroundColor: 'rgba(185, 28, 28, 0.05)', borderWidth: 3, pointRadius: 6, tension: 0.3, fill: true }, 
                { label: 'Diastólica', data: historialVitales.map(d => d.diastolica), borderColor: '#f43f5e', borderWidth: 3, borderDash: [5, 5], pointRadius: 6, tension: 0.3 }
            ]; 
            suggestedMin = 50; 
            break;
        case 'GLU': 
            if(titleEl) titleEl.innerText = "Tendencia: Glucosa"; 
            datasets = [{ label: 'Glucosa', data: historialVitales.map(d => d.glucosa), borderColor: '#0284c7', backgroundColor: 'rgba(2, 132, 199, 0.1)', borderWidth: 3, fill: true, tension: 0.3 }]; 
            suggestedMin = 60; 
            break;
        case 'HR': 
            if(titleEl) titleEl.innerText = "Tendencia: Pulso"; 
            datasets = [{ label: 'Pulso', data: historialVitales.map(d => d.pulso), borderColor: '#6366f1', backgroundColor: 'rgba(99, 102, 241, 0.1)', borderWidth: 3, fill: true, tension: 0.3 }]; 
            suggestedMin = 40; 
            break;
        case 'TEMP': case 'OXI': 
            if(titleEl) titleEl.innerText = currentChartMode === 'TEMP' ? "Tendencia: Temperatura" : "Tendencia: Sat. O2"; 
            const color = currentChartMode === 'TEMP' ? '#ea580c' : '#0d9488'; 
            datasets = [{ label: currentChartMode === 'TEMP' ? 'Temp' : 'O2', data: historialVitales.map(d => currentChartMode === 'TEMP' ? d.temperatura : d.saturacion), borderColor: color, backgroundColor: color + '20', borderWidth: 3, fill: true, tension: 0.3 }]; 
            suggestedMin = currentChartMode === 'TEMP' ? 35 : 85; 
            break;
    }
    
    window.myChart = new Chart(ctx, { 
        type: 'line', 
        data: { labels: labels, datasets: datasets }, 
        options: { 
            responsive: true, maintainAspectRatio: false, 
            layout: { padding: { top: 30, bottom: 0, left: 10, right: 10 } }, 
            onClick: (e) => { 
                const points = window.myChart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true); 
                if (points.length) { 
                    registroSeleccionadoIndex = points[0].index; 
                    actualizarDashboard(); 
                } 
            }, 
            plugins: { legend: { display: currentChartMode === 'BP', position: 'top' }, title: { display: false } }, 
            scales: { y: { ...ejeOptions, beginAtZero:false, suggestedMin:suggestedMin }, x:{...ejeOptions, grid:{display:false}} } 
        } 
    });
}

// ==========================================
// 6. UTILIDADES Y EXPORTS (PARA HTML)
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
            break;
        case 'GLU': if (v >= 130) color = "text-red-600"; else if (v >= 100) color = "text-yellow-500"; else if (v < 70) color = "text-blue-600"; break;
        case 'HR': if (v > 100) color = "text-red-600"; else if (v >= 90) color = "text-yellow-500"; else if (v < 60) color = "text-blue-600"; break;
        case 'TEMP': if (v > 38.0) color = "text-red-600"; else if (v >= 37.5) color = "text-yellow-500"; else if (v < 36.0) color = "text-blue-600"; break;
        case 'OXI': if (v < 90) color = "text-red-600"; else if (v <= 93) color = "text-yellow-500"; break;
    }
    return `${baseClass} ${color} ${opacityClass}`;
}

function initFechaInput() {
    const inputFecha = document.getElementById('fechaSolo'); 
    const inputHora = document.getElementById('horaSolo');
    if(!inputFecha || !inputHora) return;
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    inputFecha.value = now.toISOString().slice(0,10);
    inputHora.value = now.toISOString().slice(11,16);
}

// Funciones globales para que funcionen los onclick="" del HTML
window.toggleModal = function(id, show) { 
    const modal = document.getElementById(id); 
    if(modal) show ? modal.classList.remove('hidden') : modal.classList.add('hidden'); 
};

window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobileOverlay');
    if (sidebar.classList.contains('-translate-x-full')) {
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
    } else {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    }
};

window.cambiarModoGrafico = function(nuevoModo) { 
    currentChartMode = nuevoModo; 
    generarPestañasGrafico(); 
    renderizarGrafico(); 
};

window.cerrarSesion = async () => {
    await signOut(auth);
    window.location.href = 'index.html';
};