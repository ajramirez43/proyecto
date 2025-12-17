import { auth, db, doc, getDoc, onAuthStateChanged, addDoc, collection, query, where, orderBy, getDocs, signOut } from './firebase.js';

/* ==========================================
   1. CONFIGURACIÓN Y ESTADO GLOBAL
   ========================================== */
// Se inicializa con valores por defecto que se sobreescribirán al cargar el perfil.
const userProfile = {
    nombre: "", 
    email: "", // Nuevo campo para el email del paciente
    esHipertenso: false,  
    esDiabetico: false,
    tienePulso: false,     
    tieneTermometro: false, 
    tieneOximetro: false
};

const LIMITES_VITALES = {
    temp: { min: 34.0, max: 43.0, nombre: "Temperatura" },
    sys:  { min: 50,  max: 250,  nombre: "Presión Sistólica" },
    dia:  { min: 30,  max: 150,  nombre: "Presión Diastólica" },
    pul:  { min: 30,  max: 220,  nombre: "Pulso" },
    glu:  { min: 20,  max: 600,  nombre: "Glucosa" },
    oxi:  { min: 50,  max: 100,  nombre: "Saturación de Oxígeno" }
};

let currentUserUID = null;
let historialGlobal = []; 
let datosFiltrados = [];  
let cuidadoresDetallados = []; // Lista de cuidadores con sus nombres y emails
let myChart = null;
let currentChartMode = 'BP'; // Se ajustará al primer activo si BP no lo está.

// Configuracion de EmailJS (DEBE SER LA MISMA QUE EN cuidador.js)
const EMAILJS_SERVICE_ID = 'service_uv9nabr'; 
const EMAILJS_TEMPLATE_ID_REPORT = 'template_v8x6t9s'; // ID de la plantilla para el REPORTE (Asegúrate de que esta ID sea correcta)
const EMAILJS_PUBLIC_KEY = 'E9boDbDZmeFuBrw4Y'; 

// Inicializar EmailJS
if (typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY !== 'YOUR_PUBLIC_KEY') {
    emailjs.init(EMAILJS_PUBLIC_KEY);
}


const Toast = Swal.mixin({
    toast: true, position: "top-end", showConfirmButton: false, timer: 3000,
    didOpen: (toast) => { toast.onmouseenter = Swal.stopTimer; toast.onmouseleave = Swal.resumeTimer; }
});

/* ==========================================
   2. INICIALIZACIÓN
   ========================================== */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserUID = user.uid;
        // 1. Cargar Perfil (incluyendo la configuración de signos vitales)
        await cargarPerfilUsuario(user.uid); 
        
        // 2. Configurar la vista
        configurarInputsFecha(); 
        
        // 3. Cargar Historial
        await cargarHistorialFirebase(user.uid);
        
        // 4. Cargar Cuidadores (Necesario para el nuevo modal de envío)
        await cargarCuidadoresDetalles(user.uid); 
        
        if(window.lucide) window.lucide.createIcons();
        configurarModal();
    } else {
        window.location.href = 'index.html';
    }
});

async function cargarPerfilUsuario(uid) {
    try {
        const docSnap = await getDoc(doc(db, "usuarios", uid));
        if (docSnap.exists()) {
            const data = docSnap.data();
            userProfile.nombre = data.fullName || 'Usuario';
            userProfile.email = data.email || auth.currentUser.email; 
            
            // Carga la configuración de signos vitales
            userProfile.esHipertenso = data.esHipertenso || false;
            userProfile.esDiabetico = data.esDiabetico || false;
            userProfile.tienePulso = data.tienePulso || false;
            userProfile.tieneTermometro = data.tieneTermometro || false;
            userProfile.tieneOximetro = data.tieneOximetro || false;
            
            // Si el modo de gráfico inicial ('BP') no está activo, ajustamos al primero disponible
            if (currentChartMode === 'BP' && !userProfile.esHipertenso) {
                currentChartMode = userProfile.tienePulso ? 'HR' : userProfile.esDiabetico ? 'GLU' : userProfile.tieneTermometro ? 'TEMP' : userProfile.tieneOximetro ? 'OXI' : '';
            }
        }
    } catch (e) { console.error("Error cargando perfil:", e); }
}

async function cargarCuidadoresDetalles(uid) {
    try {
        const docSnap = await getDoc(doc(db, "usuarios", uid));
        cuidadoresDetallados = [];
        if (docSnap.exists()) {
            const data = docSnap.data();
            const detalles = data.cuidadoresDetalles || {};

            for (const key in detalles) {
                const cuidador = detalles[key];
                // Solo cargamos cuidadores que han completado el registro
                if (cuidador.name && cuidador.email) {
                    cuidadoresDetallados.push({
                        email: cuidador.email,
                        nombre: cuidador.name
                    });
                }
            }
        }
    } catch (e) {
        console.error("Error cargando detalles de cuidadores:", e);
    }
}


async function cargarHistorialFirebase(uid) {
    try {
        const q = query(collection(db, "registros_vitales"), where("uid", "==", uid), orderBy("fecha", "asc"));
        const querySnapshot = await getDocs(q);
        historialGlobal = [];
        querySnapshot.forEach((doc) => {
            historialGlobal.push({ id: doc.id, ...doc.data() });
        });
        window.aplicarFiltros(); 
    } catch (error) {
        console.error(error);
        Swal.fire('Error', 'No se pudo cargar el historial.', 'error');
    }
}

function configurarInputsFecha() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    
    const formatDate = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const todayStr = formatDate(today); 
    const yesterdayStr = formatDate(yesterday);
    const pastDate = new Date(yesterday);
    pastDate.setDate(yesterday.getDate() - 30);
    
    const inputInicio = document.getElementById('filtroInicio');
    const inputFin = document.getElementById('filtroFin');

    if(inputInicio && inputFin) {
        // Bloqueamos fechas futuras en AMBOS selectores
        inputFin.max = todayStr; 
        inputInicio.max = todayStr; 

        // Valores iniciales
        inputInicio.value = formatDate(pastDate);
        inputFin.value = yesterdayStr;

        inputInicio.addEventListener('change', () => { if(inputInicio.value > inputFin.value) inputFin.value = inputInicio.value; window.aplicarFiltros(); });
        inputFin.addEventListener('change', () => { if(inputFin.value < inputInicio.value) inputInicio.value = inputFin.value; window.aplicarFiltros(); });
    }
}

/* ==========================================
   3. FILTRADO
   ========================================== */
window.aplicarFiltros = function() {
    const elInicio = document.getElementById('filtroInicio');
    const elFin = document.getElementById('filtroFin');
    
    if(!elInicio || !elFin) return;

    const fInicio = new Date(elInicio.value + "T00:00:00");
    const fFin = new Date(elFin.value + "T23:59:59");

    datosFiltrados = historialGlobal.filter(d => {
        const fDato = new Date(d.fecha);
        return fDato >= fInicio && fDato <= fFin;
    });

    datosFiltrados.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    renderizarTabla();
    
    const divGrafica = document.getElementById('vistaGrafica');
    if (divGrafica && !divGrafica.classList.contains('hidden')) {
        renderizarGrafica();
    }
}

/* ==========================================
   4. RENDERIZADO TABLA (FILTRADO)
   ========================================== */
function renderizarTabla() {
    const tbody = document.getElementById('tBody');
    const theadRow = document.getElementById('headerTabla'); 
    const emptyState = document.getElementById('emptyState');
    const tableContainer = document.getElementById('tablaHistorial');
    
    if(!tbody) return;

    tbody.innerHTML = '';
    
    if (datosFiltrados.length === 0) {
        if(emptyState) emptyState.classList.remove('hidden');
        if(tableContainer) tableContainer.classList.add('hidden');
        return;
    }
    if(emptyState) emptyState.classList.add('hidden');
    if(tableContainer) tableContainer.classList.remove('hidden');

    // Headers filtrados por userProfile
    let headersHTML = `<th class="p-4 font-bold text-slate-600 text-sm uppercase tracking-wide w-32 whitespace-nowrap">Fecha</th><th class="p-4 font-bold text-slate-600 text-sm uppercase tracking-wide w-24 whitespace-nowrap">Hora</th>`;
    if (userProfile.esHipertenso) headersHTML += `<th class="p-4 font-bold text-slate-600 text-sm uppercase tracking-wide text-center">Presión</th>`;
    if (userProfile.tienePulso)   headersHTML += `<th class="p-4 font-bold text-slate-600 text-sm uppercase tracking-wide text-center">Pulso</th>`;
    if (userProfile.esDiabetico)  headersHTML += `<th class="p-4 font-bold text-slate-600 text-sm uppercase tracking-wide text-center">Glucosa</th>`;
    if (userProfile.tieneTermometro) headersHTML += `<th class="p-4 font-bold text-slate-600 text-sm uppercase tracking-wide text-center">Temp</th>`;
    if (userProfile.tieneOximetro)   headersHTML += `<th class="p-4 font-bold text-slate-600 text-sm uppercase tracking-wide text-center">Sat. O2</th>`;
    
    if(theadRow) theadRow.innerHTML = headersHTML;

    const datosParaTabla = [...datosFiltrados].reverse();

    datosParaTabla.forEach(d => {
        const date = new Date(d.fecha);
        const fechaStr = date.toLocaleDateString();
        const horaStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-100 hover:bg-slate-50 transition-colors group";

        let rowHTML = `<td class="p-4 font-medium text-slate-800 whitespace-nowrap">${fechaStr}</td><td class="p-4 text-slate-500 font-medium whitespace-nowrap">${horaStr}</td>`;

        // Cuerpo de la tabla filtrado por userProfile
        if (userProfile.esHipertenso) rowHTML += `<td class="p-4 font-bold text-base text-center ${getColor('BP', d.sistolica, d.diastolica)}">${d.sistolica ? d.sistolica + '/' + d.diastolica : '--'}</td>`;
        if (userProfile.tienePulso) rowHTML += `<td class="p-4 font-bold text-base text-center ${getColor('HR', d.pulso)}">${d.pulso || '--'}</td>`;
        if (userProfile.esDiabetico) rowHTML += `<td class="p-4 font-bold text-base text-center ${getColor('GLU', d.glucosa)}">${d.glucosa || '--'}</td>`;
        if (userProfile.tieneTermometro) rowHTML += `<td class="p-4 font-bold text-base text-center ${getColor('TEMP', d.temperatura)}">${d.temperatura ? parseFloat(d.temperatura).toFixed(1) : '--'}</td>`;
        if (userProfile.tieneOximetro) rowHTML += `<td class="p-4 font-bold text-base text-center ${getColor('OXI', d.saturacion)}">${d.saturacion || '--'}</td>`;

        tr.innerHTML = rowHTML;
        tbody.appendChild(tr);
    });
    
    if(window.lucide) window.lucide.createIcons();
}

function getColor(tipo, val, valSec) {
    if (!val) return "text-slate-300";
    const v = parseFloat(val);
    let c = "text-green-600"; 
    if (tipo === 'BP') {
        const s = v; const d = parseFloat(valSec || 0);
        if (s>=130||d>=90) c="text-red-600"; else if((s>=120&&s<=129)||(d>=80&&d<=89)) c="text-yellow-500"; else if(s<110||d<70) c="text-blue-600";
    } else if (tipo === 'GLU') { if (v>=130) c="text-red-600"; else if(v>=100) c="text-yellow-500"; else if(v<70) c="text-blue-600"; } 
    else if (tipo === 'HR') { if (v>100) c="text-red-600"; else if(v>=90) c="text-yellow-500"; else if(v<60) c="text-blue-600"; } 
    else if (tipo === 'TEMP') { if (v>38) c="text-red-600"; else if(v>=37.5) c="text-yellow-500"; else if(v<36) c="text-blue-600"; } 
    else if (tipo === 'OXI') { if (v<90) c="text-red-600"; else if(v<=93) c="text-yellow-500"; }
    return c;
}

/* ==========================================
   5. VISTAS Y GRÁFICOS (FILTRADO)
   ========================================== */
window.cambiarVista = function(vista) {
    const btnT = document.getElementById('btnVistaTabla');
    const btnG = document.getElementById('btnVistaGrafica');
    const divT = document.getElementById('vistaTabla');
    const divG = document.getElementById('vistaGrafica');

    if (vista === 'tabla') {
        btnT.className = "active-tab px-6 py-2.5 rounded-lg text-sm font-bold flex gap-2 items-center shadow-sm";
        btnG.className = "inactive-tab px-6 py-2.5 rounded-lg text-sm font-bold flex gap-2 items-center hover:bg-white";
        divT.classList.remove('hidden');
        divG.classList.add('hidden');
    } else {
        btnG.className = "active-tab px-6 py-2.5 rounded-lg text-sm font-bold flex gap-2 items-center shadow-sm";
        btnT.className = "inactive-tab px-6 py-2.5 rounded-lg text-sm font-bold flex gap-2 items-center hover:bg-white";
        divG.classList.remove('hidden');
        divT.classList.add('hidden');
        generarPestañasGrafico();
        renderizarGrafica();
    }
}

function generarPestañasGrafico() {
    const container = document.getElementById('chartTabs');
    if(!container) return;
    container.innerHTML = '';
    const opts = [];
    // FILTRADO DE PESTAÑAS POR PERFIL DE USUARIO
    if(userProfile.esHipertenso) opts.push({k:'BP', l:'Presión'});
    if(userProfile.tienePulso) opts.push({k:'HR', l:'Pulso'});
    if(userProfile.esDiabetico) opts.push({k:'GLU', l:'Glucosa'});
    if(userProfile.tieneTermometro) opts.push({k:'TEMP', l:'Temp'});
    if(userProfile.tieneOximetro) opts.push({k:'OXI', l:'Sat. O2'});
    
    // Si la opción actual desaparece o no existe, se usa la primera opción activa
    if (!opts.find(o => o.k === currentChartMode) && opts.length > 0) currentChartMode = opts[0].k;
    if (opts.length === 0) currentChartMode = '';

    opts.forEach(o => {
        const btn = document.createElement('button');
        btn.textContent = o.l;
        btn.className = `px-4 py-2 rounded-lg text-xs font-bold transition-all border ${currentChartMode === o.k ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`;
        btn.onclick = () => { currentChartMode = o.k; generarPestañasGrafico(); renderizarGrafica(); };
        container.appendChild(btn);
    });
}

function renderizarGrafica() {
    const canvas = document.getElementById('historyChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const chartExistente = Chart.getChart("historyChart");
    if (chartExistente) chartExistente.destroy();
    if (datosFiltrados.length === 0 || currentChartMode === '') return; // Si no hay datos O no hay signos activos

    const labels = datosFiltrados.map(d => {
        const date = new Date(d.fecha);
        return `${date.getDate()}/${date.getMonth()+1} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
    });

    let datasets = [];
    if (currentChartMode === 'BP') {
        datasets = [{ label: 'Sistólica', data: datosFiltrados.map(d=>d.sistolica), borderColor: '#b91c1c', backgroundColor: 'rgba(185, 28, 28, 0.1)', fill: true, tension: 0.3 }, { label: 'Diastólica', data: datosFiltrados.map(d=>d.diastolica), borderColor: '#f43f5e', borderDash: [5,5], tension: 0.3 }];
    } else if (currentChartMode === 'GLU') {
        datasets = [{ label: 'Glucosa', data: datosFiltrados.map(d=>d.glucosa), borderColor: '#0284c7', backgroundColor: 'rgba(2, 132, 199, 0.1)', fill: true, tension: 0.3 }];
    } else if (currentChartMode === 'HR') {
        datasets = [{ label: 'Pulso', data: datosFiltrados.map(d=>d.pulso), borderColor: '#6366f1', backgroundColor: 'rgba(99, 102, 241, 0.1)', fill: true, tension: 0.3 }];
    } else if (currentChartMode === 'TEMP') {
        datasets = [{ label: 'Temp', data: datosFiltrados.map(d=>d.temperatura), borderColor: '#ea580c', backgroundColor: 'rgba(234, 88, 12, 0.1)', fill: true, tension: 0.3 }];
    } else if (currentChartMode === 'OXI') {
        datasets = [{ label: 'Sat O2', data: datosFiltrados.map(d=>d.saturacion), borderColor: '#0d9488', backgroundColor: 'rgba(13, 148, 136, 0.1)', fill: true, tension: 0.3 }];
    }

    myChart = new Chart(ctx, { type: 'line', data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false } } } });
}

/* ==========================================
   6. PDF (FILTRADO)
   ========================================== */
window.abrirOpcionesPDF = function() {
    let opcionesHTML = `<div class="text-left space-y-2">`;
    // FILTRADO DE OPCIONES POR PERFIL DE USUARIO
    if(userProfile.esHipertenso) opcionesHTML += `<div><input type="checkbox" id="chkBP" value="BP" checked> <label>Gráfico Presión Arterial</label></div>`;
    if(userProfile.tienePulso) opcionesHTML += `<div><input type="checkbox" id="chkHR" value="HR"> <label>Gráfico Frecuencia Card.</label></div>`;
    if(userProfile.esDiabetico) opcionesHTML += `<div><input type="checkbox" id="chkGLU" value="GLU"> <label>Gráfico Glucosa</label></div>`;
    if(userProfile.tieneTermometro) opcionesHTML += `<div><input type="checkbox" id="chkTEMP" value="TEMP"> <label>Gráfico Temperatura</label></div>`;
    if(userProfile.tieneOximetro) opcionesHTML += `<div><input type="checkbox" id="chkOXI" value="OXI"> <label>Gráfico Saturación</label></div>`;
    opcionesHTML += `</div>`;

    Swal.fire({
        title: 'Opciones de PDF',
        html: `<p class="mb-4 text-sm text-gray-500">Selecciona qué gráficos incluir:</p>${opcionesHTML}`,
        showCancelButton: true,
        confirmButtonText: 'Generar PDF',
        confirmButtonColor: '#dc2626',
        preConfirm: () => {
            const selected = [];
            if(document.getElementById('chkBP')?.checked) selected.push('BP');
            if(document.getElementById('chkHR')?.checked) selected.push('HR');
            if(document.getElementById('chkGLU')?.checked) selected.push('GLU');
            if(document.getElementById('chkTEMP')?.checked) selected.push('TEMP');
            if(document.getElementById('chkOXI')?.checked) selected.push('OXI');
            return selected;
        }
    }).then((result) => {
        if (result.isConfirmed) generarPDF(result.value);
    });
}

async function generarPDF(graficosSeleccionados) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(18); doc.text("Reporte Médico - VitalSync", 14, 20);
    doc.setFontSize(10); doc.text(`Generado: ${new Date().toLocaleDateString()}`, 14, 28);
    doc.text(`Paciente: ${userProfile.nombre || 'Usuario'}`, 14, 34);
    doc.text(`Periodo: ${document.getElementById('filtroInicio').value} al ${document.getElementById('filtroFin').value}`, 14, 40);

    // Headers filtrados por userProfile
    let headers = ['Fecha', 'Hora'];
    if(userProfile.esHipertenso) headers.push('Presión');
    if(userProfile.tienePulso) headers.push('Pulso');
    if(userProfile.esDiabetico) headers.push('Glucosa');
    if(userProfile.tieneTermometro) headers.push('Temp');
    if(userProfile.tieneOximetro) headers.push('Sat O2');

    const rows = [...datosFiltrados].reverse().map(d => {
        const dt = new Date(d.fecha);
        let row = [dt.toLocaleDateString(), dt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})];
        // Datos de la fila filtrados por userProfile
        if(userProfile.esHipertenso) row.push(d.sistolica ? `${d.sistolica}/${d.diastolica}` : '-');
        if(userProfile.tienePulso) row.push(d.pulso || '-');
        if(userProfile.esDiabetico) row.push(d.glucosa || '-');
        if(userProfile.tieneTermometro) row.push(d.temperatura || '-');
        if(userProfile.tieneOximetro) row.push(d.saturacion || '-');
        return row;
    });

    doc.autoTable({ head: [headers], body: rows, startY: 45, theme: 'grid', headStyles: { fillColor: [67, 56, 202] } });

    let finalY = doc.lastAutoTable.finalY + 10;
    const canvas = document.getElementById('pdfCanvas');
    if(canvas) { 
        const ctx = canvas.getContext('2d');
        for (const tipo of graficosSeleccionados) {
            if (finalY + 90 > 280) { doc.addPage(); finalY = 20; }
            const labels = datosFiltrados.map(d => { const dt = new Date(d.fecha); return `${dt.getDate()}/${dt.getMonth()+1}`; });
            let datasets = [], titulo = "";
            if(tipo==='BP') { titulo="Presión"; datasets=[{label:'Sys', data:datosFiltrados.map(d=>d.sistolica), borderColor:'#b91c1c', fill:false}, {label:'Dia', data:datosFiltrados.map(d=>d.diastolica), borderColor:'#f43f5e', fill:false}]; }
            else if(tipo==='GLU') { titulo="Glucosa"; datasets=[{label:'Glu', data:datosFiltrados.map(d=>d.glucosa), borderColor:'#0284c7', fill:false}]; }
            else if(tipo==='HR') { titulo="Pulso"; datasets=[{label:'Pulso', data:datosFiltrados.map(d=>d.pulso), borderColor:'#6366f1', fill:false}]; }
            else if(tipo==='TEMP') { titulo="Temp"; datasets=[{label:'Temp', data:datosFiltrados.map(d=>d.temperatura), borderColor:'#ea580c', fill:false}]; }
            else if(tipo==='OXI') { titulo="Sat O2"; datasets=[{label:'Sat', data:datosFiltrados.map(d=>d.saturacion), borderColor:'#0d9488', fill:false}]; }

            const existingChart = Chart.getChart("pdfCanvas");
            if (existingChart) existingChart.destroy();
            new Chart(ctx, { type: 'line', data: { labels, datasets }, options: { animation: false, responsive: false } });
            await new Promise(r => setTimeout(r, 100));
            const imgData = canvas.toDataURL('image/png');
            doc.setFontSize(12); doc.text(titulo, 14, finalY);
            doc.addImage(imgData, 'PNG', 14, finalY+5, 180, 80);
            finalY += 95;
        }
    }
    doc.save(`Reporte_VitalSync_${new Date().toISOString().slice(0,10)}.pdf`);
    Swal.fire("PDF Generado", "El reporte se ha descargado.", "success");
}

/* ==========================================
   7. MODAL Y FORMS (REGISTRO OLVIDADO)
   ========================================== */
window.toggleModal = function(show) { const modal = document.getElementById('modal'); show ? modal.classList.remove('hidden') : modal.classList.add('hidden'); }

window.abrirModalRetroactivo = function() {
    const inputFecha = document.getElementById('fechaRegistro');
    const now = new Date();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1); yesterday.setHours(23, 59);
    const minDate = new Date(now); minDate.setDate(now.getDate() - 60);

    const offset = now.getTimezoneOffset() * 60000;
    const maxStr = new Date(yesterday.getTime() - offset).toISOString().slice(0,16);
    const minStr = new Date(minDate.getTime() - offset).toISOString().slice(0,16);

    inputFecha.max = maxStr; inputFecha.min = minStr; inputFecha.value = maxStr;
    window.toggleModal(true);
}

function configurarModal() {
    const g = { bp: document.getElementById('group-bp'), pul: document.getElementById('group-pul'), glu: document.getElementById('group-glu'), temp: document.getElementById('group-temp'), oxi: document.getElementById('group-oxi') };
    const i = { sys: document.getElementById('sys'), dia: document.getElementById('dia'), pul: document.getElementById('pul'), glu: document.getElementById('glu') };
    if(!g.bp) return;
    
    Object.values(g).forEach(el => el.classList.add('hidden'));

    // SE MUESTRAN SOLO LOS ACTIVOS SEGÚN EL PERFIL
    if (userProfile.esHipertenso) { g.bp.classList.remove('hidden'); i.sys.required=true; i.dia.required=true; i.pul.required=true; }
    if (userProfile.tienePulso) g.pul.classList.remove('hidden');
    if (userProfile.esDiabetico) { g.glu.classList.remove('hidden'); i.glu.required=true; }
    if (userProfile.tieneTermometro) g.temp.classList.remove('hidden');
    if (userProfile.tieneOximetro) g.oxi.classList.remove('hidden');
}

// SUBMIT ADD DOC
const form = document.getElementById('addForm');
if(form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if(!currentUserUID) return;
        const fechaVal = document.getElementById('fechaRegistro').value;
        const inputDate = new Date(fechaVal);
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (inputDate >= startOfToday) { Swal.fire({icon: 'error', title: 'Fecha incorrecta', text: 'Solo registros pasados.'}); return; }

        const sysVal = document.getElementById('sys').value;
        const diaVal = document.getElementById('dia').value;
        const pulVal = document.getElementById('pul').value;
        const gluVal = document.getElementById('glu').value;
        const tempVal = document.getElementById('temp').value;
        const oxiVal = document.getElementById('oxi').value;

        const validarRango = (valor, codigo) => {
            if (!valor) return true; 
            const num = parseFloat(valor);
            const limite = LIMITES_VITALES[codigo];
            if (num < limite.min || num > limite.max) { Swal.fire({ icon: 'warning', title: `${limite.nombre} fuera de rango`, text: `Valor ${num} inválido.`}); return false; }
            return true;
        };

        if (userProfile.esHipertenso) { 
            if (!validarRango(sysVal, 'sys') || !validarRango(diaVal, 'dia')) return;
            if (Number(sysVal) > 0 && Number(diaVal) > 0 && Number(sysVal) <= Number(diaVal)) {
                Swal.fire({ icon: 'error', title: 'Error en Presión', text: 'La Sistólica debe ser mayor que la Diastólica.' });
                return;
            }
        }
        if (userProfile.tienePulso && !validarRango(pulVal, 'pul')) return;
        if (userProfile.esDiabetico && !validarRango(gluVal, 'glu')) return;
        if (userProfile.tieneTermometro && !validarRango(tempVal, 'temp')) return;
        if (userProfile.tieneOximetro && !validarRango(oxiVal, 'oxi')) return;


        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true; btn.innerText = "Guardando...";

        try {
            const nuevo = { uid: currentUserUID, fecha: fechaVal, sistolica: sysVal ? Number(sysVal) : null, diastolica: diaVal ? Number(diaVal) : null, pulso: pulVal ? Number(pulVal) : null, glucosa: gluVal ? Number(gluVal) : null, temperatura: tempVal ? Number(tempVal) : null, saturacion: oxiVal ? Number(oxiVal) : null, timestamp: new Date() };
            await addDoc(collection(db, "registros_vitales"), nuevo);
            await cargarHistorialFirebase(currentUserUID);
            window.toggleModal(false);
            form.reset();
            Toast.fire({ icon: "success", title: "Historial actualizado" });
        } catch (error) { console.error(error); Swal.fire('Error', 'No se pudo guardar.', 'error'); } 
        finally { btn.disabled = false; btn.innerText = "Guardar"; }
    });
}

window.cerrarSesion = async () => {
    await signOut(auth);
    window.location.href = 'index.html';
};


/* ==========================================
   8. ENVIAR INFORME A CUIDADORES (MODIFICADO)
   ========================================== */

window.toggleModalEnvio = function(show) { 
    const modal = document.getElementById('modalEnvio'); 
    show ? modal.classList.remove('hidden') : modal.classList.add('hidden'); 
}

window.abrirModalEnvioInforme = function() {
    if (datosFiltrados.length === 0) {
        Swal.fire('Advertencia', 'No hay datos filtrados para enviar. Por favor, selecciona un rango con registros.', 'warning');
        return;
    }
    if (cuidadoresDetallados.length === 0) {
        Swal.fire('Advertencia', 'No tienes cuidadores registrados para enviar el informe.', 'warning');
        return;
    }

    const container = document.getElementById('selectCuidadores');
    const btnEnviar = document.getElementById('btnEnviarInforme');
    
    // Generar checkboxes de cuidadores
    let html = '';
    cuidadoresDetallados.forEach((c, index) => {
        html += `
            <div class="flex items-center p-2 rounded-lg bg-white border border-slate-200">
                <input type="checkbox" id="cuidador-${index}" value="${c.email}" data-name="${c.nombre}" class="text-primary focus:ring-primary rounded border-gray-300">
                <label for="cuidador-${index}" class="ml-3 text-sm font-medium text-slate-700 flex-1">${c.nombre} (${c.email})</label>
            </div>
        `;
    });
    container.innerHTML = html;

    // Listener para habilitar/deshabilitar el botón de envío
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const checked = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'));
            btnEnviar.disabled = checked.length === 0;
        });
    });

    window.toggleModalEnvio(true);
    btnEnviar.disabled = true; // Por defecto deshabilitado hasta que se seleccione algo
}


function generarInformeHTML(datos) {
    // 1. Cabecera de la tabla (HTML inline para emails)
    let headers = ['Fecha', 'Hora'];
    if(userProfile.esHipertenso) headers.push('Presión');
    if(userProfile.tienePulso) headers.push('Pulso');
    if(userProfile.esDiabetico) headers.push('Glucosa');
    if(userProfile.tieneTermometro) headers.push('Temp');
    if(userProfile.tieneOximetro) headers.push('Sat O2');
    
    // Estilo en línea para compatibilidad con correos
    const headerRow = headers.map(h => `<th style="padding: 12px; background-color: #4338ca; color: white; font-weight: bold; text-align: center;">${h}</th>`).join('');
    
    // 2. Filas de la tabla
    const datosParaExportar = [...datos].reverse();
    let rowsHTML = '';

    datosParaExportar.forEach(d => {
        const dt = new Date(d.fecha);
        const fechaStr = dt.toLocaleDateString();
        const horaStr = dt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        
        let rowCells = `<td style="padding: 10px; border: 1px solid #ddd;">${fechaStr}</td><td style="padding: 10px; border: 1px solid #ddd;">${horaStr}</td>`;

        // Función auxiliar para celdas con color
        const createCell = (val, tipo, valSec) => {
            let colorClass = getColor(tipo, val, valSec);
            let colorStyle = '';
            if (colorClass.includes('red')) colorStyle = 'color: #ef4444; font-weight: bold;';
            else if (colorClass.includes('yellow')) colorStyle = 'color: #f59e0b; font-weight: bold;';
            else if (colorClass.includes('blue')) colorStyle = 'color: #3b82f6; font-weight: bold;';
            else if (colorClass.includes('green')) colorStyle = 'color: #10b981; font-weight: bold;';
            else colorStyle = 'color: #94a3b8;';
            
            let displayVal = val || '-';
            if (tipo === 'BP' && val && valSec) displayVal = `${val}/${valSec}`;
            if (tipo === 'TEMP' && val) displayVal = parseFloat(val).toFixed(1);

            return `<td style="padding: 10px; border: 1px solid #ddd; text-align: center; ${colorStyle}">${displayVal}</td>`;
        };

        if(userProfile.esHipertenso) rowCells += createCell(d.sistolica, 'BP', d.diastolica);
        if(userProfile.tienePulso) rowCells += createCell(d.pulso, 'HR');
        if(userProfile.esDiabetico) rowCells += createCell(d.glucosa, 'GLU');
        if(userProfile.tieneTermometro) rowCells += createCell(d.temperatura, 'TEMP');
        if(userProfile.tieneOximetro) rowCells += createCell(d.saturacion, 'OXI');
        
        rowsHTML += `<tr style="background-color: white; border-bottom: 1px solid #eee;">${rowCells}</tr>`;
    });

    // 3. Ensamblar la tabla completa en HTML
    return `
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-family: Arial, sans-serif; font-size: 14px; border: 1px solid #ddd;">
            <thead>
                <tr>${headerRow}</tr>
            </thead>
            <tbody>
                ${rowsHTML}
            </tbody>
        </table>
        <p style="font-size: 12px; color: #64748b; margin-top: 15px;">*Los colores indican rangos anormales: Rojo (alto/bajo crítico), Amarillo (elevado), Azul (bajo).</p>
    `;
}


window.enviarInformeACuidadores = async function() {
    const btn = document.getElementById('btnEnviarInforme');
    const container = document.getElementById('selectCuidadores');
    const checkedCheckboxes = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'));

    if (checkedCheckboxes.length === 0) {
        Swal.fire('Advertencia', 'Selecciona al menos un cuidador.', 'warning');
        return;
    }
    
    if (datosFiltrados.length === 0) {
        Swal.fire('Advertencia', 'No hay datos filtrados para enviar.', 'warning');
        return;
    }
    
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Enviando...';
    if (window.lucide) window.lucide.createIcons();

    window.toggleModalEnvio(false);

    try {
        // Generar el contenido HTML del informe
        const informeHTML = generarInformeHTML(datosFiltrados);
        const fInicio = document.getElementById('filtroInicio').value;
        const fFin = document.getElementById('filtroFin').value;
        
        const destinatarios = checkedCheckboxes.map(cb => ({
            email: cb.value,
            nombre: cb.dataset.name
        }));

        const emailsEnviados = [];
        let errores = 0;

        for (const dest of destinatarios) {
            const templateParams = {
                nombre_cuidador: dest.nombre,
                nombre_paciente: userProfile.nombre,
                periodo: `del ${fInicio} al ${fFin}`,
                informe_tabla_html: informeHTML, // **VARIABLE CLAVE** que se inserta en tu plantilla de EmailJS
                email_cuidador: dest.email
            };

            await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID_REPORT, templateParams)
                .then(() => {
                    emailsEnviados.push(dest.email);
                })
                .catch(error => {
                    console.error(`Error enviando a ${dest.email}:`, error);
                    errores++;
                });
        }
        
        // Mostrar resumen
        if (emailsEnviados.length > 0) {
            Swal.fire({
                icon: 'success',
                title: 'Informe Enviado',
                html: `El informe ha sido enviado con éxito a los siguientes correos:<br><strong>${emailsEnviados.join(', ')}</strong>.`,
                confirmButtonColor: '#4338ca'
            });
        }
        if (errores > 0) {
            Toast.fire({ icon: "error", title: `Error al enviar a ${errores} cuidador(es).` });
        }


    } catch (error) {
        console.error("Error general en el envío:", error);
        Swal.fire('Error', 'Ocurrió un error al procesar el envío del informe.', 'error');
    } finally {
        // Restaurar botón
        btn.innerHTML = originalText;
        if (window.lucide) window.lucide.createIcons();
        btn.disabled = false;
    }
}